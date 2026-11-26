import { and, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb, dbNow, type DbTransaction } from '@/lib/db';
import {
  bills,
  menuItems,
  orderItems,
  orders,
  venueTables,
  type Order,
  type OrderStatus,
  type StationType,
} from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { orderNumber } from '@/lib/ids';
import type { CartLine } from '@/lib/types';
import { ensureOpenBill, recalcBillTotals, restoreOrderStock } from './bill';
import { audit } from './audit';
import { hasBillSplits } from './splits';
import { enqueueOrderReadyNotification } from './notifications';

export type OrderActor =
  | { type: 'customer' }
  | { type: 'staff'; id: string; role: 'owner' | 'cashier' };

export type PlaceOrderInput = {
  actor: OrderActor;
  tableId: string;
  idempotencyKey: string;
  items: CartLine[];
  note?: string | null;
};

export type PlaceOrderResult = {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  billId: string;
  billNumber: string;
  orderTotal: number;
  duplicate: boolean;
};

function normalizeItems(items: CartLine[]): CartLine[] {
  return items
    .map((item) => ({
      menuItemId: item.menuItemId,
      qty: Math.floor(Number(item.qty)),
      note: item.note?.trim().slice(0, 240) || undefined,
    }))
    .filter((item) => item.menuItemId && item.qty > 0 && item.qty <= 50);
}

async function findExistingByKey(idempotencyKey: string, tableId: string): Promise<Order | null> {
  const db = await getDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.idempotencyKey, idempotencyKey))
    .limit(1);
  if (!order) return null;
  if (order.tableId !== tableId) {
    throw new AppError('IDEMPOTENCY_MISMATCH', 'Kunci pesanan sudah dipakai di meja lain.');
  }
  return order;
}

async function toPlaceResult(order: Order, duplicate: boolean): Promise<PlaceOrderResult> {
  const db = await getDb();
  const [bill] = await db
    .select({ billNumber: bills.billNumber })
    .from(bills)
    .where(eq(bills.id, order.billId))
    .limit(1);
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const orderTotal = items.reduce((sum, item) => sum + item.priceSnapshot * item.qty, 0);
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    billId: order.billId,
    billNumber: bill?.billNumber ?? '',
    orderTotal,
    duplicate,
  };
}

/**
 * Satu use case untuk dua aktor:
 * - customer QR → status pending (perlu approval kasir)
 * - kasir → accepted langsung masuk KDS
 * Harga & stok SELALU dari database; payload client tidak dipercaya.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const items = normalizeItems(input.items);
  if (items.length === 0) {
    throw new AppError('EMPTY_CART', 'Keranjang masih kosong.');
  }
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
    throw new AppError('INVALID_IDEMPOTENCY', 'Kunci idempotensi tidak valid.');
  }

  const existing = await findExistingByKey(input.idempotencyKey, input.tableId);
  if (existing) {
    return toPlaceResult(existing, true);
  }

  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      const [table] = await tx
        .select()
        .from(venueTables)
        .where(and(eq(venueTables.id, input.tableId), eq(venueTables.active, true)))
        .limit(1);
      if (!table) throw new AppError('TABLE_NOT_FOUND', 'Meja tidak ditemukan.');
      if (input.actor.type === 'customer' && !table.allowSelfOrder) {
        throw new AppError(
          'SELF_ORDER_DISABLED',
          'Meja ini hanya bisa dipesan melalui kasir. Silakan panggil waiter.',
        );
      }

      if (input.actor.type === 'customer') {
        const [recent] = await tx
          .select({ total: count() })
          .from(orders)
          .where(
            and(
              eq(orders.tableId, input.tableId),
              eq(orders.source, 'customer_qr'),
              gte(orders.createdAt, sql`now() - interval '60 seconds'`),
            ),
          );
        if ((recent?.total ?? 0) >= 5) {
          throw new AppError(
            'RATE_LIMITED',
            'Terlalu banyak pesanan dalam 1 menit. Tunggu sebentar lalu coba lagi.',
          );
        }
      }

      const menuIds = [...new Set(items.map((item) => item.menuItemId))];
      const menuRows = await tx
        .select()
        .from(menuItems)
        .where(and(inArray(menuItems.id, menuIds), eq(menuItems.isAvailable, true)));
      if (menuRows.length !== menuIds.length) {
        throw new AppError('ITEM_UNAVAILABLE', 'Ada item yang tidak tersedia. Muat ulang menu.');
      }
      const menuById = new Map(menuRows.map((item) => [item.id, item]));

      // Stok atomik: tidak bisa oversell walau dua order masuk bersamaan.
      for (const line of items) {
        const menuItem = menuById.get(line.menuItemId)!;
        if (menuItem.stock === null) continue;
        const updated = await tx
          .update(menuItems)
          .set({
            stock: sql`${menuItems.stock} - ${line.qty}`,
            updatedAt: now,
          })
          .where(and(eq(menuItems.id, line.menuItemId), sql`${menuItems.stock} >= ${line.qty}`))
          .returning({ id: menuItems.id });
        if (updated.length === 0) {
          throw new AppError('OUT_OF_STOCK', `Stok ${menuItem.name} tidak mencukupi.`);
        }
      }

      const bill = await ensureOpenBill(
        tx,
        table.id,
        input.actor.type === 'staff' ? input.actor.id : null,
      );
      if (await hasBillSplits(tx, bill.id)) {
        throw new AppError('BILL_SPLIT_LOCKED', 'Bill sudah di-split. Selesaikan pembayaran split.');
      }
      if (bill.promotionId) {
        throw new AppError('BILL_PROMO_LOCKED', 'Hapus promo sebelum menambah order baru.');
      }

      const isCustomer = input.actor.type === 'customer';
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: orderNumber(),
          billId: bill.id,
          tableId: table.id,
          source: isCustomer ? 'customer_qr' : 'cashier',
          status: isCustomer ? 'pending' : 'accepted',
          idempotencyKey: input.idempotencyKey,
          placedBy: input.actor.type === 'staff' ? input.actor.id : null,
          approvedBy: input.actor.type === 'staff' ? input.actor.id : null,
          note: input.note?.trim().slice(0, 500) || null,
          createdAt: now,
          acceptedAt: isCustomer ? null : now,
        })
        .returning();

      await tx.insert(orderItems).values(
        items.map((line) => {
          const menuItem = menuById.get(line.menuItemId)!;
          return {
            orderId: order.id,
            menuItemId: menuItem.id,
            nameSnapshot: menuItem.name,
            priceSnapshot: menuItem.price,
            qty: line.qty,
            note: line.note ?? null,
            station: menuItem.station,
          };
        }),
      );

      await recalcBillTotals(tx, bill.id, now);
      const orderTotal = items.reduce(
        (sum, line) => sum + menuById.get(line.menuItemId)!.price * line.qty,
        0,
      );

      await audit(tx, {
        staffId: input.actor.type === 'staff' ? input.actor.id : null,
        action: isCustomer ? 'order.customer_placed' : 'order.cashier_placed',
        entityType: 'order',
        entityId: order.id,
        detail: {
          table: table.code,
          orderNumber: order.orderNumber,
          items: items.length,
          billNumber: bill.billNumber,
        },
        at: now,
      });

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        billId: bill.id,
        billNumber: bill.billNumber,
        orderTotal,
        duplicate: false,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await findExistingByKey(input.idempotencyKey, input.tableId).catch(() => null);
      if (raced) {
        const result = await toPlaceResult(raced, true);
        return { ...result, duplicate: true };
      }
    }
    throw error;
  }
}

async function loadOrder(tx: DbTransaction, orderId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order tidak ditemukan.');
  return order;
}

export async function approveOrder(orderId: string, staffId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (order.status !== 'pending') {
      if (order.status === 'cancelled') throw new AppError('ORDER_CANCELLED', 'Order sudah dibatalkan.');
      return { orderId, status: order.status, already: true };
    }
    const now = await dbNow(tx);
    const [updated] = await tx
      .update(orders)
      .set({ status: 'accepted', acceptedAt: now, approvedBy: staffId })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
      .returning();
    if (!updated) throw new AppError('ORDER_STATE_CHANGED', 'Order sudah diproses kasir lain.');
    await recalcBillTotals(tx, order.billId, now);
    await audit(tx, {
      staffId,
      action: 'order.approved',
      entityType: 'order',
      entityId: orderId,
      detail: { orderNumber: order.orderNumber },
      at: now,
    });
    return { orderId, status: 'accepted' as const, already: false };
  });
}

export async function rejectOrder(orderId: string, staffId: string, reason?: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (order.status === 'cancelled') return { orderId, status: 'cancelled' as const };
    if (order.status !== 'pending') {
      throw new AppError('ORDER_LOCKED', 'Order yang sudah diproses tidak bisa ditolak dari sini.');
    }
    const now = await dbNow(tx);
    await tx
      .update(orders)
      .set({ status: 'cancelled', cancelledAt: now, approvedBy: staffId })
      .where(eq(orders.id, orderId));
    await restoreOrderStock(tx, orderId);
    await recalcBillTotals(tx, order.billId, now);
    await audit(tx, {
      staffId,
      action: 'order.rejected',
      entityType: 'order',
      entityId: orderId,
      detail: { orderNumber: order.orderNumber, reason: reason ?? null },
      at: now,
    });
    return { orderId, status: 'cancelled' as const };
  });
}

export async function markOrderPreparing(orderId: string, staffId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (order.status === 'preparing') return { orderId, status: 'preparing' as const };
    if (order.status !== 'accepted') {
      throw new AppError('ORDER_LOCKED', 'Order ini tidak berada di antrean baru.');
    }
    const now = await dbNow(tx);
    await tx
      .update(orders)
      .set({ status: 'preparing', preparingAt: now })
      .where(eq(orders.id, orderId));
    await audit(tx, {
      staffId,
      action: 'order.preparing',
      entityType: 'order',
      entityId: orderId,
      detail: { orderNumber: order.orderNumber },
      at: now,
    });
    return { orderId, status: 'preparing' as const };
  });
}

async function syncOrderReadyState(
  tx: DbTransaction,
  orderId: string,
  now: Date,
  staffId: string,
) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order tidak ditemukan.');
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const allDone = items.length > 0 && items.every((item) => item.doneAt !== null);

  let nextStatus: OrderStatus = order.status;
  if (allDone && (order.status === 'accepted' || order.status === 'preparing')) {
    nextStatus = 'ready';
  } else if (!allDone && order.status === 'ready') {
    nextStatus = 'preparing';
  }
  if (nextStatus !== order.status) {
    await tx
      .update(orders)
      .set({
        status: nextStatus,
        readyAt: nextStatus === 'ready' ? now : null,
        preparingAt: nextStatus === 'preparing' ? (order.preparingAt ?? now) : order.preparingAt,
      })
      .where(eq(orders.id, orderId));
    await audit(tx, {
      staffId,
      action: nextStatus === 'ready' ? 'order.ready' : 'order.reopened',
      entityType: 'order',
      entityId: orderId,
      detail: { orderNumber: order.orderNumber, stationReady: nextStatus === 'ready' },
      at: now,
    });
    if (nextStatus === 'ready') {
      await enqueueOrderReadyNotification(tx, orderId);
    }
  }
  return { orderId, status: nextStatus, allDone };
}

export async function toggleOrderItemDone(
  itemId: string,
  done: boolean,
  staffId: string,
) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(orderItems).where(eq(orderItems.id, itemId)).limit(1);
    if (!item) throw new AppError('ITEM_NOT_FOUND', 'Item order tidak ditemukan.');
    const now = await dbNow(tx);
    await tx
      .update(orderItems)
      .set({ doneAt: done ? now : null })
      .where(eq(orderItems.id, itemId));
    await audit(tx, {
      staffId,
      action: done ? 'order.item_done' : 'order.item_reopened',
      entityType: 'order_item',
      entityId: itemId,
      detail: { name: item.nameSnapshot, orderId: item.orderId },
      at: now,
    });
    return syncOrderReadyState(tx, item.orderId, now, staffId);
  });
}

export async function markStationReady(
  orderId: string,
  station: StationType,
  staffId: string,
) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (order.status === 'served' || order.status === 'cancelled') {
      return { orderId, status: order.status, allDone: true };
    }
    const now = await dbNow(tx);
    await tx
      .update(orderItems)
      .set({ doneAt: now })
      .where(
        and(
          eq(orderItems.orderId, orderId),
          eq(orderItems.station, station),
          sql`${orderItems.doneAt} is null`,
        ),
      );
    await audit(tx, {
      staffId,
      action: 'order.station_ready',
      entityType: 'order',
      entityId: orderId,
      detail: { station, orderNumber: order.orderNumber },
      at: now,
    });
    return syncOrderReadyState(tx, orderId, now, staffId);
  });
}

export async function markOrderServed(orderId: string, staffId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (order.status === 'served') return { orderId, status: 'served' as const };
    if (order.status === 'cancelled' || order.status === 'pending') {
      throw new AppError('ORDER_LOCKED', 'Order ini belum siap untuk disajikan.');
    }
    const now = await dbNow(tx);
    await tx
      .update(orders)
      .set({ status: 'served', servedAt: now })
      .where(eq(orders.id, orderId));
    await tx
      .update(orderItems)
      .set({ doneAt: sql`coalesce(${orderItems.doneAt}, ${now})` })
      .where(eq(orderItems.orderId, orderId));
    await recalcBillTotals(tx, order.billId, now);
    await audit(tx, {
      staffId,
      action: 'order.served',
      entityType: 'order',
      entityId: orderId,
      detail: { orderNumber: order.orderNumber },
      at: now,
    });
    return { orderId, status: 'served' as const };
  });
}
