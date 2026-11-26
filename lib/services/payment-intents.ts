import { and, count, eq, ne } from 'drizzle-orm';
import QRCode from 'qrcode';
import { dbNow, getDb } from '@/lib/db';
import {
  billiardSessions,
  bills,
  orders,
  payments,
  paymentIntents,
  venueTables,
} from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { audit } from './audit';
import { recalcBillTotals } from './bill';
import { hasBillSplits } from './splits';
import { awardMembershipForBill } from './membership';
import { consumePromotionForBill } from './promotions';
import { enqueueReceiptForBill } from './notifications';
import { createQrisCharge, getGatewayConfig } from '@/lib/payments/gateway';

export async function createBillQrisIntent(staffId: string, billId: string) {
  const config = getGatewayConfig();
  if (!config.enabled || !config.provider) {
    throw new AppError(
      'GATEWAY_NOT_CONFIGURED',
      'Payment gateway belum dikonfigurasi. Gunakan QRIS manual di dialog pembayaran.',
    );
  }

  const db = await getDb();
  const prepared = await db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    if (await hasBillSplits(tx, billId)) {
      throw new AppError('USE_SPLIT_PAYMENT', 'Bill memakai split group; gunakan pembayaran split.');
    }
    const [activeSession] = await tx
      .select({ id: billiardSessions.id })
      .from(billiardSessions)
      .where(and(eq(billiardSessions.billId, billId), ne(billiardSessions.status, 'finished')))
      .limit(1);
    if (activeSession) throw new AppError('ACTIVE_SESSION', 'Stop sesi billiard sebelum QRIS.');
    const [pendingOrder] = await tx
      .select({ total: count() })
      .from(orders)
      .where(and(eq(orders.billId, billId), eq(orders.status, 'pending')));
    if ((pendingOrder?.total ?? 0) > 0) {
      throw new AppError('PENDING_ORDERS', 'Selesaikan order pending sebelum QRIS.');
    }
    const { total } = await recalcBillTotals(tx, billId, now);
    if (total <= 0) throw new AppError('EMPTY_BILL', 'Bill tidak punya nilai untuk dibayar.');

    await tx
      .update(paymentIntents)
      .set({ status: 'cancelled', updatedAt: now })
      .where(and(eq(paymentIntents.billId, billId), eq(paymentIntents.status, 'pending')));

    return { bill, amount: total, now };
  });

  const orderId = `CUETAP-${prepared.bill.id.slice(0, 8)}-${Date.now()}`;
  const charge = await createQrisCharge({
    orderId,
    amount: prepared.amount,
    description: `Bill ${prepared.bill.billNumber}`,
  });
  const qrDataUrl = await QRCode.toDataURL(charge.qrString, {
    margin: 1,
    width: 360,
    color: { dark: '#0b1326', light: '#ffffff' },
  });

  const intent = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(paymentIntents)
      .values({
        billId: prepared.bill.id,
        provider: charge.provider,
        providerOrderId: charge.providerOrderId,
        providerRef: charge.providerRef,
        amount: prepared.amount,
        status: 'pending',
        qrString: charge.qrString,
        qrUrl: charge.qrUrl,
        expiresAt: charge.expiresAt,
        rawPayload: charge.raw,
        createdBy: staffId,
        createdAt: prepared.now,
        updatedAt: prepared.now,
      })
      .returning();

    await audit(tx, {
      staffId,
      action: 'payment.qris_intent_created',
      entityType: 'bill',
      entityId: prepared.bill.id,
      detail: {
        billNumber: prepared.bill.billNumber,
        provider: charge.provider,
        amount: prepared.amount,
        orderId: charge.providerOrderId,
      },
      at: prepared.now,
    });
    return created;
  });

  return {
    intentId: intent.id,
    billId: prepared.bill.id,
    billNumber: prepared.bill.billNumber,
    amount: prepared.amount,
    qrString: charge.qrString,
    qrDataUrl,
    expiresAt: charge.expiresAt.toISOString(),
    provider: charge.provider,
    providerLabel: config.label,
    mock: charge.provider === 'mock',
  };
}

export async function getQrisIntentStatus(intentId: string) {
  const db = await getDb();
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.id, intentId))
    .limit(1);
  if (!intent) throw new AppError('INTENT_NOT_FOUND', 'Payment intent tidak ditemukan.');
  const now = await dbNow(db);
  if (intent.status === 'pending' && intent.expiresAt && intent.expiresAt < now) {
    await db
      .update(paymentIntents)
      .set({ status: 'expired', updatedAt: now })
      .where(eq(paymentIntents.id, intent.id));
    return { status: 'expired' as const, paidAt: null, amount: intent.amount };
  }
  return {
    status: intent.status,
    paidAt: intent.paidAt?.toISOString() ?? null,
    amount: intent.amount,
  };
}

export async function settleQrisIntent(
  intentId: string,
  providerRef?: string | null,
  rawPayload?: Record<string, unknown> | null,
) {
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      const [intent] = await tx
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.id, intentId))
        .limit(1);
      if (!intent) throw new AppError('INTENT_NOT_FOUND', 'Payment intent tidak ditemukan.');
      if (intent.status === 'paid') {
        return { duplicate: true as const, billId: intent.billId, amount: intent.amount };
      }
      if (intent.status !== 'pending') {
        throw new AppError('INTENT_NOT_PENDING', 'Payment intent tidak aktif.');
      }
      const [bill] = await tx.select().from(bills).where(eq(bills.id, intent.billId)).limit(1);
      if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
      if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
      if (await hasBillSplits(tx, bill.id)) {
        throw new AppError('USE_SPLIT_PAYMENT', 'Bill memakai split group.');
      }
      const { total } = await recalcBillTotals(tx, bill.id, now);
      if (intent.amount !== total) {
        throw new AppError('AMOUNT_MISMATCH', 'Nominal QRIS tidak sama dengan total bill.');
      }

      await tx.insert(payments).values({
        billId: bill.id,
        method: 'qris',
        amount: intent.amount,
        externalRef: `gateway:${intent.providerOrderId}`,
        createdAt: now,
      });
      await tx
        .update(paymentIntents)
        .set({
          status: 'paid',
          paidAt: now,
          providerRef: providerRef ?? intent.providerRef,
          rawPayload: rawPayload ?? intent.rawPayload,
          updatedAt: now,
        })
        .where(eq(paymentIntents.id, intent.id));
      await tx
        .update(bills)
        .set({ status: 'paid', closedAt: now })
        .where(and(eq(bills.id, bill.id), eq(bills.status, 'open')));
      await tx
        .update(venueTables)
        .set({ needsCleaningAt: now })
        .where(eq(venueTables.id, bill.tableId));
      await awardMembershipForBill(tx, bill.id, null);
      await consumePromotionForBill(tx, bill.id, null);
      await enqueueReceiptForBill(tx, bill.id);

      await audit(tx, {
        staffId: null,
        action: 'bill.paid_gateway',
        entityType: 'bill',
        entityId: bill.id,
        detail: {
          billNumber: bill.billNumber,
          provider: intent.provider,
          amount: intent.amount,
          orderId: intent.providerOrderId,
        },
        at: now,
      });

      return {
        duplicate: false as const,
        billId: bill.id,
        billNumber: bill.billNumber,
        amount: intent.amount,
        paidAt: now.toISOString(),
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { duplicate: true as const };
    }
    throw error;
  }
}

export async function simulateMockIntentPaid(staffId: string, intentId: string) {
  const db = await getDb();
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.id, intentId))
    .limit(1);
  if (!intent) throw new AppError('INTENT_NOT_FOUND', 'Payment intent tidak ditemukan.');
  if (intent.provider !== 'mock') {
    throw new AppError('NOT_MOCK', 'Simulasi hanya untuk provider mock.');
  }
  return settleQrisIntent(intentId, intent.providerRef, { simulatedBy: staffId });
}
