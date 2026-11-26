import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import {
  billSplitItems,
  billSplits,
  billiardSessions,
  bills,
  orderItems,
  orders,
  payments,
  venueTables,
} from '@/lib/db/schema';
import { AppError } from '@/lib/errors';
import { allocateSplitTotals, computeSessionAmountFromSeconds, billableElapsedSeconds } from '@/lib/billing';
import { audit } from './audit';
import { recalcBillTotals } from './bill';
import { awardMembershipForBill } from './membership';
import { consumePromotionForBill } from './promotions';

export type SplitGroupInput = {
  label: string;
  itemIds: string[];
  sessionIds: string[];
};

const VALID_METHODS = new Set(['cash', 'qris', 'transfer', 'edc']);

function normalizePayments(input: Array<{ method: string; amount: number; tendered?: number }>) {
  return input
    .map((payment) => ({
      method: payment.method,
      amount: Math.round(Number(payment.amount)),
      tendered: payment.tendered ? Math.round(Number(payment.tendered)) : undefined,
    }))
    .filter((payment) => payment.amount > 0);
}

export async function hasBillSplits(tx: DbTransaction, billId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: billSplits.id })
    .from(billSplits)
    .where(eq(billSplits.billId, billId))
    .limit(1);
  return Boolean(row);
}

export async function createBillSplits(
  staffId: string,
  billId: string,
  groups: SplitGroupInput[],
) {
  if (groups.length < 2 || groups.length > 10) {
    throw new AppError('INVALID_SPLIT', 'Split bill membutuhkan 2–10 group.');
  }
  const normalized = groups.map((group, index) => ({
    label: group.label.trim().slice(0, 40) || `Group ${index + 1}`,
    itemIds: [...new Set(group.itemIds)],
    sessionIds: [...new Set(group.sessionIds)],
  }));
  if (normalized.some((group) => group.itemIds.length + group.sessionIds.length === 0)) {
    throw new AppError('EMPTY_SPLIT', 'Setiap group harus punya minimal satu item/sesi.');
  }

  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');

    const [activeSession] = await tx
      .select({ id: billiardSessions.id })
      .from(billiardSessions)
      .where(and(eq(billiardSessions.billId, billId), ne(billiardSessions.status, 'finished')))
      .limit(1);
    if (activeSession) {
      throw new AppError('ACTIVE_SESSION', 'Stop sesi billiard sebelum membuat split bill.');
    }
    const [pendingOrder] = await tx
      .select({ total: count() })
      .from(orders)
      .where(and(eq(orders.billId, billId), eq(orders.status, 'pending')));
    if ((pendingOrder?.total ?? 0) > 0) {
      throw new AppError('PENDING_ORDERS', 'Selesaikan order pending sebelum split bill.');
    }

    const [paymentCount] = await tx
      .select({ total: count() })
      .from(payments)
      .where(eq(payments.billId, billId));
    if ((paymentCount?.total ?? 0) > 0) {
      throw new AppError('BILL_HAS_PAYMENT', 'Bill sudah punya pembayaran; split harus dibuat sebelum bayar.');
    }

    const [existing] = await tx
      .select({ id: billSplits.id })
      .from(billSplits)
      .where(eq(billSplits.billId, billId))
      .limit(1);
    if (existing) {
      await tx.delete(billSplitItems).where(
        inArray(
          billSplitItems.splitId,
          (await tx.select({ id: billSplits.id }).from(billSplits).where(eq(billSplits.billId, billId))).map(
            (row) => row.id,
          ),
        ),
      );
      await tx.delete(billSplits).where(eq(billSplits.billId, billId));
    }

    const orderRows = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.billId, billId), ne(orders.status, 'cancelled')));
    const orderItemRows = orderRows.length
      ? await tx
          .select()
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderRows.map((order) => order.id)))
      : [];
    const sessionRows = await tx
      .select()
      .from(billiardSessions)
      .where(eq(billiardSessions.billId, billId));

    const itemAmount = new Map(
      orderItemRows.map((item) => [item.id, item.priceSnapshot * item.qty]),
    );
    const sessionAmount = new Map(
      sessionRows.map((session) => [
        session.id,
        session.amount ??
          computeSessionAmountFromSeconds(
            billableElapsedSeconds(
              session.startedAt,
              session.endedAt ?? now,
              session.pausedSeconds,
            ),
            {
              ratePerHour: session.ratePerHour,
              minMinutes: session.minMinutes,
              incrementMinutes: session.incrementMinutes,
            },
          ).amount,
      ]),
    );

    const assignedItems = new Set<string>();
    const assignedSessions = new Set<string>();
    for (const group of normalized) {
      for (const itemId of group.itemIds) {
        if (!itemAmount.has(itemId)) throw new AppError('SPLIT_ITEM_INVALID', 'Item tidak ada di bill.');
        if (assignedItems.has(itemId)) throw new AppError('SPLIT_ITEM_DUPLICATE', 'Item dialokasikan dua kali.');
        assignedItems.add(itemId);
      }
      for (const sessionId of group.sessionIds) {
        if (!sessionAmount.has(sessionId)) {
          throw new AppError('SPLIT_SESSION_INVALID', 'Sesi tidak ada di bill.');
        }
        if (assignedSessions.has(sessionId)) {
          throw new AppError('SPLIT_SESSION_DUPLICATE', 'Sesi dialokasikan dua kali.');
        }
        assignedSessions.add(sessionId);
      }
    }
    if (assignedItems.size !== itemAmount.size || assignedSessions.size !== sessionAmount.size) {
      throw new AppError('SPLIT_INCOMPLETE', 'Semua item dan sesi harus dialokasikan.');
    }

    await recalcBillTotals(tx, billId, now);
    const [updatedBill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!updatedBill || updatedBill.total <= 0) {
      throw new AppError('EMPTY_BILL', 'Bill tidak punya nilai untuk dibayar.');
    }

    const groupSubtotals = normalized.map((group) => {
      const sessions = group.sessionIds.reduce(
        (sum, sessionId) => sum + (sessionAmount.get(sessionId) ?? 0),
        0,
      );
      const items = group.itemIds.reduce(
        (sum, itemId) => sum + (itemAmount.get(itemId) ?? 0),
        0,
      );
      return sessions + items;
    });
    const allocated = allocateSplitTotals(groupSubtotals, {
      subtotal: updatedBill.subtotal,
      discountAmount:
        updatedBill.discountAmount +
        updatedBill.memberDiscountAmount +
        updatedBill.promoDiscountAmount,
      taxRateBps: updatedBill.taxRateBps,
      serviceRateBps: updatedBill.serviceRateBps,
    });

    const created: Array<{ id: string; label: string; total: number }> = [];
    for (let index = 0; index < normalized.length; index += 1) {
      const group = normalized[index];
      const totals = allocated[index];
      const [split] = await tx
        .insert(billSplits)
        .values({
          billId,
          label: group.label,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          serviceAmount: totals.serviceAmount,
          total: totals.total,
          createdBy: staffId,
          createdAt: now,
        })
        .returning();

      const itemValues = [
        ...group.itemIds.map((itemId) => ({
          splitId: split.id,
          itemType: 'order_item' as const,
          orderItemId: itemId,
          sessionId: null,
          amount: itemAmount.get(itemId) ?? 0,
          createdAt: now,
        })),
        ...group.sessionIds.map((sessionId) => ({
          splitId: split.id,
          itemType: 'session' as const,
          orderItemId: null,
          sessionId,
          amount: sessionAmount.get(sessionId) ?? 0,
          createdAt: now,
        })),
      ];
      if (itemValues.length) await tx.insert(billSplitItems).values(itemValues);
      created.push({ id: split.id, label: split.label, total: split.total });
    }

    await audit(tx, {
      staffId,
      action: 'bill.splits_created',
      entityType: 'bill',
      entityId: billId,
      detail: {
        billNumber: updatedBill.billNumber,
        groups: created.map((group) => ({ label: group.label, total: group.total })),
      },
      at: now,
    });

    return { billId, splits: created };
  });
}

export async function resetBillSplits(staffId: string, billId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    const [paymentCount] = await tx
      .select({ total: count() })
      .from(payments)
      .where(eq(payments.billId, billId));
    if ((paymentCount?.total ?? 0) > 0) {
      throw new AppError('BILL_HAS_PAYMENT', 'Split tidak bisa direset setelah ada pembayaran.');
    }
    await tx.delete(billSplits).where(eq(billSplits.billId, billId));
    await audit(tx, {
      staffId,
      action: 'bill.splits_reset',
      entityType: 'bill',
      entityId: billId,
      detail: { billNumber: bill.billNumber },
      at: now,
    });
    return { billId };
  });
}

export async function payBillSplit(
  staffId: string,
  splitId: string,
  inputPayments: Array<{ method: string; amount: number; tendered?: number }>,
) {
  const paymentRows = normalizePayments(inputPayments);
  if (paymentRows.length === 0) {
    throw new AppError('NO_PAYMENT', 'Tambahkan minimal satu metode pembayaran.');
  }
  if (paymentRows.some((payment) => !VALID_METHODS.has(payment.method))) {
    throw new AppError('INVALID_METHOD', 'Metode pembayaran tidak valid.');
  }

  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [split] = await tx.select().from(billSplits).where(eq(billSplits.id, splitId)).limit(1);
    if (!split) throw new AppError('SPLIT_NOT_FOUND', 'Split group tidak ditemukan.');
    if (split.status !== 'open') throw new AppError('SPLIT_PAID', 'Split group sudah dibayar.');
    const [bill] = await tx.select().from(bills).where(eq(bills.id, split.billId)).limit(1);
    if (!bill || bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');

    const [activeSession] = await tx
      .select({ id: billiardSessions.id })
      .from(billiardSessions)
      .where(and(eq(billiardSessions.billId, bill.id), ne(billiardSessions.status, 'finished')))
      .limit(1);
    if (activeSession) throw new AppError('ACTIVE_SESSION', 'Sesi billiard masih berjalan.');
    const [pendingOrder] = await tx
      .select({ total: count() })
      .from(orders)
      .where(and(eq(orders.billId, bill.id), eq(orders.status, 'pending')));
    if ((pendingOrder?.total ?? 0) > 0) throw new AppError('PENDING_ORDERS', 'Masih ada order pending.');

    const [splitSum] = await tx
      .select({ total: sql<number>`coalesce(sum(${billSplits.total}),0)::int` })
      .from(billSplits)
      .where(eq(billSplits.billId, bill.id));
    if ((splitSum?.total ?? 0) !== bill.total) {
      throw new AppError('SPLIT_TOTAL_MISMATCH', 'Total split tidak sama dengan total bill. Reset split.');
    }

    const paidTotal = paymentRows.reduce((sum, payment) => sum + payment.amount, 0);
    if (paidTotal !== split.total) {
      throw new AppError(
        'PAYMENT_MISMATCH',
        `Pembayaran group (${paidTotal}) harus sama dengan total group (${split.total}).`,
      );
    }

    await tx.insert(payments).values(
      paymentRows.map((payment) => ({
        billId: bill.id,
        billSplitId: split.id,
        method: payment.method as 'cash' | 'qris' | 'transfer' | 'edc',
        amount: payment.amount,
        tendered: payment.tendered ?? null,
        receivedBy: staffId,
        createdAt: now,
      })),
    );

    await tx
      .update(billSplits)
      .set({ status: 'paid', paidAt: now })
      .where(eq(billSplits.id, split.id));

    const [unpaid] = await tx
      .select({ total: count() })
      .from(billSplits)
      .where(and(eq(billSplits.billId, bill.id), ne(billSplits.status, 'paid')));
    const billClosed = (unpaid?.total ?? 0) === 0;
    if (billClosed) {
      await tx
        .update(bills)
        .set({ status: 'paid', closedAt: now, closedBy: staffId })
        .where(and(eq(bills.id, bill.id), eq(bills.status, 'open')));
      await tx
        .update(venueTables)
        .set({ needsCleaningAt: now })
        .where(eq(venueTables.id, bill.tableId));
      await awardMembershipForBill(tx, bill.id, staffId);
      await consumePromotionForBill(tx, bill.id, staffId);
    }

    const cashTendered = paymentRows.reduce(
      (sum, payment) =>
        payment.method === 'cash' && payment.tendered
          ? sum + Math.max(0, payment.tendered - payment.amount)
          : sum,
      0,
    );

    await audit(tx, {
      staffId,
      action: billClosed ? 'bill.paid_split_final' : 'bill_split.paid',
      entityType: 'bill',
      entityId: bill.id,
      detail: {
        billNumber: bill.billNumber,
        split: split.label,
        amount: split.total,
        billClosed,
      },
      at: now,
    });

    return {
      splitId: split.id,
      billId: bill.id,
      billNumber: bill.billNumber,
      splitLabel: split.label,
      total: split.total,
      billClosed,
      change: cashTendered,
      paidAt: now.toISOString(),
    };
  });
}
