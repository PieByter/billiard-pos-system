import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { DbTransaction } from '@/lib/db';
import {
  bills,
  billiardSessions,
  menuItems,
  orderItems,
  orders,
  type Bill,
} from '@/lib/db/schema';
import {
  billableElapsedSeconds,
  computeBillTotals,
  computeSessionAmount,
  computeSessionAmountFromSeconds,
} from '@/lib/billing';
import { billNumber } from '@/lib/ids';

/** Ambil bill yang masih open, atau buat baru secara atomik. */
export async function ensureOpenBill(
  tx: DbTransaction,
  tableId: string,
  openedBy: string | null,
): Promise<Bill> {
  const findOpen = async () => {
    const [row] = await tx
      .select()
      .from(bills)
      .where(and(eq(bills.tableId, tableId), eq(bills.status, 'open')))
      .limit(1);
    return row ?? null;
  };

  const existing = await findOpen();
  if (existing) return existing;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const [created] = await tx
      .insert(bills)
      .values({ billNumber: billNumber(), tableId, openedBy })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const open = await findOpen();
    if (open) return open;
  }

  throw new Error('Gagal membuat open bill untuk meja ini.');
}

/**
 * Hitung ulang seluruh line item bill dari sumbernya:
 * - sesi billiard: amount final atau estimasi live
 * - order aktif (bukan cancelled): snapshot harga item
 * Lalu simpan subtotal/pajak/service/total ke row bills.
 */
export async function recalcBillTotals(
  tx: DbTransaction,
  billId: string,
  now: Date,
): Promise<{ bill: Bill; total: number }> {
  const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
  if (!bill) throw new Error('Bill tidak ditemukan.');

  const sessions = await tx
    .select()
    .from(billiardSessions)
    .where(eq(billiardSessions.billId, billId));

  let subtotal = 0;
  for (const session of sessions) {
    if (session.status === 'finished') {
      subtotal +=
        session.amount ??
        computeSessionAmount(
          session.startedAt,
          session.endedAt ?? now,
          session.pausedSeconds,
          {
            ratePerHour: session.ratePerHour,
            minMinutes: session.minMinutes,
            incrementMinutes: session.incrementMinutes,
          },
        ).amount;
    } else {
      const at = session.status === 'paused' ? new Date(session.pausedAt ?? now) : now;
      const seconds = billableElapsedSeconds(session.startedAt, at, session.pausedSeconds);
      subtotal += computeSessionAmountFromSeconds(seconds, {
        ratePerHour: session.ratePerHour,
        minMinutes: session.minMinutes,
        incrementMinutes: session.incrementMinutes,
      }).amount;
    }
  }

  const activeOrders = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.billId, billId), ne(orders.status, 'cancelled')));

  if (activeOrders.length > 0) {
    const itemRows = await tx
      .select()
      .from(orderItems)
      .where(
        inArray(
          orderItems.orderId,
          activeOrders.map((order) => order.id),
        ),
      );
    for (const item of itemRows) {
      subtotal += item.priceSnapshot * item.qty;
    }
  }

  const totals = computeBillTotals({
    subtotal,
    discountAmount: bill.discountAmount,
    taxRateBps: bill.taxRateBps,
    serviceRateBps: bill.serviceRateBps,
  });

  const [updated] = await tx
    .update(bills)
    .set({
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      serviceAmount: totals.serviceAmount,
      total: totals.total,
    })
    .where(eq(bills.id, billId))
    .returning();

  return { bill: updated, total: totals.total };
}

/** Kembalikan stok item ketika order dibatalkan / bill di-void. */
export async function restoreOrderStock(tx: DbTransaction, orderId: string): Promise<void> {
  const rows = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const item of rows) {
    await tx
      .update(menuItems)
      .set({ stock: sql`${menuItems.stock} + ${item.qty}`, updatedAt: new Date() })
      .where(and(eq(menuItems.id, item.menuItemId), sql`${menuItems.stock} is not null`));
  }
}

export function billableTotal(bill: Bill): number {
  return bill.total;
}
