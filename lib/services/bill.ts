import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { DbTransaction } from '@/lib/db';
import {
  bills,
  billiardSessions,
  members,
  memberTiers,
  menuItems,
  orderItems,
  orders,
  venueSettings,
  venueTables,
  type Bill,
} from '@/lib/db/schema';
import { SERVICE_RATE_BPS, TAX_RATE_BPS } from '@/lib/constants';
import {
  billableElapsedSeconds,
  computeBillTotals,
  computeSessionAmount,
  computeSessionAmountFromSeconds,
} from '@/lib/billing';
import { billNumber } from '@/lib/ids';
import { restoreIngredientsForOrder } from './inventory';
import {
  listBillPromotions,
  syncAutoPromotions,
  syncBillPromotionAggregate,
} from './promotion-engine';

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

  const [table] = await tx.select().from(venueTables).where(eq(venueTables.id, tableId)).limit(1);
  if (!table) throw new Error('Meja tidak ditemukan.');
  const [settings] = await tx
    .select()
    .from(venueSettings)
    .where(eq(venueSettings.outletId, table.outletId))
    .limit(1);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const [created] = await tx
      .insert(bills)
      .values({
        outletId: table.outletId,
        billNumber: billNumber(),
        tableId,
        openedBy,
        taxRateBps: settings?.taxRateBps ?? TAX_RATE_BPS,
        serviceRateBps: settings?.serviceRateBps ?? SERVICE_RATE_BPS,
      })
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

  let memberDiscountAmount = 0;
  if (bill.memberId) {
    const [memberTier] = await tx
      .select({ discountBps: memberTiers.discountBps })
      .from(members)
      .innerJoin(memberTiers, eq(members.tierId, memberTiers.id))
      .where(and(eq(members.id, bill.memberId), eq(members.active, true)))
      .limit(1);
    if (memberTier) {
      memberDiscountAmount = Math.round(
        (Math.max(0, subtotal - bill.discountAmount) * memberTier.discountBps) / 10_000,
      );
    }
  }

  // Simpan subtotal sementara agar promo scope "all" membaca basis terbaru.
  await tx.update(bills).set({ subtotal: Math.max(0, subtotal) }).where(eq(bills.id, billId));
  await syncAutoPromotions(tx, { ...bill, subtotal: Math.max(0, subtotal) }, now);
  const promoRows = await listBillPromotions(tx, billId);
  const promoDiscountAmount = promoRows.reduce((sum, row) => sum + row.discountAmount, 0);
  const promotionCode = promoRows.length ? promoRows.map((row) => row.code).join(' + ') : null;
  const promotionId = promoRows[0]?.promotionId ?? null;

  const totalDiscount =
    bill.discountAmount +
    memberDiscountAmount +
    promoDiscountAmount +
    bill.pointsDiscountAmount +
    bill.voucherDiscountAmount;
  const totals = computeBillTotals({
    subtotal,
    discountAmount: totalDiscount,
    taxRateBps: bill.taxRateBps,
    serviceRateBps: bill.serviceRateBps,
  });
  const grandTotal = totals.total + bill.penaltyAmount;

  const [updated] = await tx
    .update(bills)
    .set({
      subtotal: totals.subtotal,
      memberDiscountAmount,
      promoDiscountAmount,
      promotionCode,
      promotionId,
      taxAmount: totals.taxAmount,
      serviceAmount: totals.serviceAmount,
      total: grandTotal,
    })
    .where(eq(bills.id, billId))
    .returning();

  return { bill: updated, total: grandTotal };
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
  await restoreIngredientsForOrder(tx, orderId);
}

export function billableTotal(bill: Bill): number {
  return bill.total;
}
