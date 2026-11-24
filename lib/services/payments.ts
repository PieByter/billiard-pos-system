import { and, count, eq, ne } from 'drizzle-orm';
import { getDb, dbNow, type DbTransaction } from '@/lib/db';
import {
  billiardSessions,
  bills,
  orders,
  payments,
  venueTables,
} from '@/lib/db/schema';
import { AppError } from '@/lib/errors';
import type { PaymentInput } from '@/lib/types';
import { recalcBillTotals, restoreOrderStock } from './bill';
import { audit } from './audit';

const VALID_METHODS = new Set(['cash', 'qris', 'transfer', 'edc']);

function normalizePayments(input: PaymentInput[]): PaymentInput[] {
  return input
    .map((payment) => ({
      method: payment.method,
      amount: Math.round(Number(payment.amount)),
      tendered: payment.tendered ? Math.round(Number(payment.tendered)) : undefined,
    }))
    .filter((payment) => payment.amount > 0);
}

export async function payBill(
  billId: string,
  staffId: string,
  inputPayments: PaymentInput[],
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
    const { bill, total } = await recalcBillTotals(tx, billId, now);
    if (bill.status !== 'open') {
      throw new AppError('BILL_NOT_OPEN', 'Bill ini sudah ditutup.');
    }
    if (total <= 0) {
      throw new AppError('EMPTY_BILL', 'Bill tidak punya item untuk dibayar.');
    }

    const [activeSession] = await tx
      .select({ id: billiardSessions.id })
      .from(billiardSessions)
      .where(
        and(
          eq(billiardSessions.billId, billId),
          ne(billiardSessions.status, 'finished'),
        ),
      )
      .limit(1);
    if (activeSession) {
      throw new AppError(
        'ACTIVE_SESSION',
        'Sesi billiard masih berjalan. Stop sesi terlebih dahulu sebelum pembayaran.',
      );
    }

    const [pendingOrder] = await tx
      .select({ total: count() })
      .from(orders)
      .where(and(eq(orders.billId, billId), eq(orders.status, 'pending')));
    if ((pendingOrder?.total ?? 0) > 0) {
      throw new AppError(
        'PENDING_ORDERS',
        'Masih ada self-order yang menunggu approval. Terima atau tolak dulu.',
      );
    }

    const paidTotal = paymentRows.reduce((sum, payment) => sum + payment.amount, 0);
    if (paidTotal !== total) {
      throw new AppError(
        'PAYMENT_MISMATCH',
        `Total pembayaran (${paidTotal}) harus sama dengan total bill (${total}).`,
        { expected: total, paid: paidTotal },
      );
    }

    await tx.insert(payments).values(
      paymentRows.map((payment) => ({
        billId,
        method: payment.method,
        amount: payment.amount,
        tendered: payment.tendered ?? null,
        receivedBy: staffId,
        createdAt: now,
      })),
    );

    const [closed] = await tx
      .update(bills)
      .set({
        status: 'paid',
        closedAt: now,
        closedBy: staffId,
        subtotal: bill.subtotal,
        taxAmount: bill.taxAmount,
        serviceAmount: bill.serviceAmount,
        total,
      })
      .where(and(eq(bills.id, billId), eq(bills.status, 'open')))
      .returning();

    if (!closed) {
      throw new AppError('BILL_ALREADY_PAID', 'Bill ini baru saja dibayar kasir lain.');
    }

    await tx
      .update(venueTables)
      .set({ needsCleaningAt: now })
      .where(eq(venueTables.id, bill.tableId));

    const cashTendered = paymentRows.reduce(
      (sum, payment) =>
        payment.method === 'cash' && payment.tendered
          ? sum + Math.max(0, payment.tendered - payment.amount)
          : sum,
      0,
    );

    await audit(tx, {
      staffId,
      action: 'bill.paid',
      entityType: 'bill',
      entityId: billId,
      detail: {
        billNumber: bill.billNumber,
        total,
        methods: paymentRows.map((payment) => payment.method),
      },
      at: now,
    });

    return {
      billId,
      billNumber: bill.billNumber,
      total,
      change: cashTendered,
      paidAt: now.toISOString(),
    };
  });
}

export async function applyBillDiscount(
  billId: string,
  staffId: string,
  amount: number,
  reason: string,
) {
  const discount = Math.round(Number(amount));
  if (!Number.isFinite(discount) || discount < 0) {
    throw new AppError('INVALID_DISCOUNT', 'Nominal diskon tidak valid.');
  }
  if (discount > 0 && !reason.trim()) {
    throw new AppError('REASON_REQUIRED', 'Alasan diskon wajib diisi.');
  }

  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const { bill, total } = await recalcBillTotals(tx, billId, now);
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    if (discount > bill.subtotal) {
      throw new AppError('DISCOUNT_TOO_LARGE', 'Diskon melebihi subtotal bill.');
    }
    await tx
      .update(bills)
      .set({
        discountAmount: discount,
        discountReason: reason.trim().slice(0, 240) || null,
      })
      .where(eq(bills.id, billId));
    const updated = await recalcBillTotals(tx, billId, now);
    await audit(tx, {
      staffId,
      action: 'bill.discount_applied',
      entityType: 'bill',
      entityId: billId,
      detail: {
        billNumber: bill.billNumber,
        previousTotal: total,
        discount,
        reason: reason.trim(),
      },
      at: now,
    });
    return { billId, discount, total: updated.total };
  });
}

export async function voidBill(billId: string, staffId: string, reason: string) {
  if (!reason.trim()) throw new AppError('REASON_REQUIRED', 'Alasan void wajib diisi.');
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
      throw new AppError('BILL_HAS_PAYMENT', 'Bill sudah punya pembayaran. Gunakan refund flow.');
    }

    const [activeSession] = await tx
      .select({ id: billiardSessions.id })
      .from(billiardSessions)
      .where(
        and(
          eq(billiardSessions.billId, billId),
          ne(billiardSessions.status, 'finished'),
        ),
      )
      .limit(1);
    if (activeSession) {
      throw new AppError(
        'ACTIVE_SESSION',
        'Sesi billiard masih berjalan. Stop sesi terlebih dahulu sebelum void.',
      );
    }

    const orderRows = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.billId, billId), ne(orders.status, 'cancelled')));
    for (const order of orderRows) {
      await restoreOrderStock(tx, order.id);
    }
    await tx
      .update(orders)
      .set({ status: 'cancelled', cancelledAt: now, approvedBy: staffId })
      .where(and(eq(orders.billId, billId), ne(orders.status, 'cancelled')));
    await tx
      .update(bills)
      .set({
        status: 'void',
        closedAt: now,
        closedBy: staffId,
        note: `VOID: ${reason.trim()}`.slice(0, 500),
      })
      .where(eq(bills.id, billId));
    await tx
      .update(venueTables)
      .set({ needsCleaningAt: now })
      .where(eq(venueTables.id, bill.tableId));

    await audit(tx, {
      staffId,
      action: 'bill.void',
      entityType: 'bill',
      entityId: billId,
      detail: { billNumber: bill.billNumber, reason: reason.trim(), total: bill.total },
      at: now,
    });

    return { billId, billNumber: bill.billNumber };
  });
}

/** Ringkasan pembayaran bill (dipakai struk & detail). */
export async function listBillPayments(tx: DbTransaction, billId: string) {
  return tx.select().from(payments).where(eq(payments.billId, billId));
}
