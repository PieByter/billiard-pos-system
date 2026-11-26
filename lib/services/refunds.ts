import { and, eq, ne, sql } from 'drizzle-orm';
import { dbNow, getDb } from '@/lib/db';
import { bills, orders, payments, refunds } from '@/lib/db/schema';
import { AppError } from '@/lib/errors';
import { getGatewayConfig, refundQrisCharge } from '@/lib/payments/gateway';
import { restoreOrderStock } from './bill';
import { refundToMemberBalance } from './membership';
import { audit } from './audit';

export type RefundCategory = 'billiard' | 'fnb' | 'other';

export type RefundInput = {
  billId: string;
  paymentId: string;
  amount: number;
  category: RefundCategory;
  reason: string;
  restock?: boolean;
  externalRef?: string | null;
};

const VALID_CATEGORIES = new Set<RefundCategory>(['billiard', 'fnb', 'other']);

export async function refundPayment(staffId: string, input: RefundInput) {
  const amount = Math.round(Number(input.amount));
  const reason = input.reason.trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('INVALID_REFUND', 'Nominal refund tidak valid.');
  }
  if (!reason) {
    throw new AppError('REASON_REQUIRED', 'Alasan refund wajib diisi.');
  }
  if (!VALID_CATEGORIES.has(input.category)) {
    throw new AppError('INVALID_CATEGORY', 'Kategori refund tidak valid.');
  }

  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, input.billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'paid') {
      throw new AppError('BILL_NOT_PAID', 'Refund hanya bisa dilakukan pada bill yang sudah lunas.');
    }

    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, input.paymentId), eq(payments.billId, bill.id)))
      .limit(1);
    if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 'Pembayaran tidak ditemukan pada bill ini.');

    const [refundedRow] = await tx
      .select({ total: sql<number>`coalesce(sum(${refunds.amount}),0)::int` })
      .from(refunds)
      .where(eq(refunds.paymentId, payment.id));
    const refundedForPayment = refundedRow?.total ?? 0;
    const remainingForPayment = payment.amount - refundedForPayment;
    if (amount > remainingForPayment) {
      throw new AppError(
        'REFUND_TOO_LARGE',
        `Nominal refund melebihi sisa pembayaran (${remainingForPayment}).`,
        { remaining: remainingForPayment },
      );
    }

    const [billRefundedRow] = await tx
      .select({ total: sql<number>`coalesce(sum(${refunds.amount}),0)::int` })
      .from(refunds)
      .where(eq(refunds.billId, bill.id));
    const refundedForBill = billRefundedRow?.total ?? 0;
    const nextRefunded = refundedForBill + amount;

    if (nextRefunded > bill.total) {
      throw new AppError(
        'REFUND_TOO_LARGE',
        `Total refund melebihi total bill (${bill.total}).`,
        { remaining: bill.total - refundedForBill },
      );
    }

    let gatewayRefunded = false;
    let balanceRefunded = 0;
    const externalRef = input.externalRef?.trim() || null;
    if (!externalRef && payment.method === 'qris' && payment.externalRef?.startsWith('gateway:')) {
      const gatewayOrderId = payment.externalRef.slice('gateway:'.length);
      const config = getGatewayConfig();
      if (config.enabled && config.provider) {
        const ok = await refundQrisCharge(gatewayOrderId, amount, reason);
        if (!ok) {
          throw new AppError(
            'GATEWAY_REFUND_FAILED',
            'Gateway menolak refund. Coba lagi atau catat refund manual dengan referensi eksternal.',
          );
        }
        gatewayRefunded = true;
      }
    }

    const wantsRestock = Boolean(input.restock);
    if (wantsRestock && nextRefunded !== bill.total) {
      throw new AppError(
        'RESTOCK_REQUIRES_FULL_REFUND',
        'Stok hanya bisa dikembalikan jika seluruh bill sudah di-refund.',
      );
    }
    if (wantsRestock) {
      const [restocked] = await tx
        .select({ id: refunds.id })
        .from(refunds)
        .where(and(eq(refunds.billId, bill.id), eq(refunds.restocked, true)))
        .limit(1);
      if (restocked) {
        throw new AppError('ALREADY_RESTOCKED', 'Stok bill ini sudah pernah dikembalikan.');
      }

      const orderRows = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.billId, bill.id), ne(orders.status, 'cancelled')));
      for (const order of orderRows) {
        await restoreOrderStock(tx, order.id);
      }
    }

    if (payment.method === 'balance') {
      const restored = await refundToMemberBalance(tx, bill, amount, staffId, now);
      balanceRefunded = restored?.balance ?? 0;
    }

    const [refund] = await tx
      .insert(refunds)
      .values({
        outletId: bill.outletId,
        billId: bill.id,
        paymentId: payment.id,
        amount,
        category: input.category,
        reason,
        restocked: wantsRestock,
        externalRef:
          externalRef ??
          (gatewayRefunded
            ? `gateway-refund:${payment.externalRef?.slice('gateway:'.length)}:${amount}:${now.getTime()}`
            : null),
        approvedBy: staffId,
        createdAt: now,
      })
      .returning();

    await tx
      .update(bills)
      .set({ refundedAmount: nextRefunded })
      .where(eq(bills.id, bill.id));

    await audit(tx, {
      staffId,
      action: 'bill.refunded',
      entityType: 'bill',
      entityId: bill.id,
      detail: {
        billNumber: bill.billNumber,
        paymentId: payment.id,
        method: payment.method,
        amount,
        category: input.category,
        reason,
        restocked: wantsRestock,
        gatewayRefunded,
        balanceRefunded,
        refundedTotal: nextRefunded,
      },
      at: now,
    });

    return {
      refundId: refund.id,
      billId: bill.id,
      billNumber: bill.billNumber,
      amount,
      refundedTotal: nextRefunded,
      remainingRefundable: bill.total - nextRefunded,
      restocked: wantsRestock,
      gatewayRefunded,
      balance: balanceRefunded || null,
    };
  });
}
