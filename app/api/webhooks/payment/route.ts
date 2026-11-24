import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, count, eq, ne } from 'drizzle-orm';
import { getDb, dbNow } from '@/lib/db';
import {
  billiardSessions,
  bills,
  orders,
  payments,
  venueTables,
} from '@/lib/db/schema';
import { recalcBillTotals } from '@/lib/services/bill';
import { audit } from '@/lib/services/audit';
import { AppError, isUniqueViolation } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  billId: z.string().uuid(),
  method: z.enum(['qris', 'transfer']),
  amount: z.coerce.number().int().min(1).max(1_000_000_000),
  externalRef: z.string().min(4).max(160),
});

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook payment gateway (QRIS/transfer).
 * Signature: hex HMAC-SHA256 dari `${billId}.${amount}.${externalRef}`.
 * Idempoten via payments.external_ref unique.
 */
export async function POST(request: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'Webhook belum dikonfigurasi.' },
      { status: 503 },
    );
  }

  const raw = await request.text();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'Body bukan JSON.' }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Payload tidak valid.' },
      { status: 400 },
    );
  }
  const payload = parsed.data;
  const signature =
    request.headers.get('x-cuetap-signature')?.trim() ??
    (json as { signature?: string }).signature?.trim() ??
    '';
  const canonical = `${payload.billId}.${payload.amount}.${payload.externalRef}`;
  if (!signature || !verifySignature(canonical, signature, secret)) {
    return NextResponse.json({ ok: false, error: 'Signature tidak valid.' }, { status: 401 });
  }

  const db = await getDb();
  try {
    const result = await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      const [bill] = await tx
        .select()
        .from(bills)
        .where(eq(bills.id, payload.billId))
        .limit(1);
      if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');

      const [existing] = await tx
        .select()
        .from(payments)
        .where(eq(payments.externalRef, payload.externalRef))
        .limit(1);
      if (existing) {
        return { duplicate: true, status: 'already_recorded' as const };
      }
      if (bill.status !== 'open') {
        throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
      }

      const [activeSession] = await tx
        .select({ id: billiardSessions.id })
        .from(billiardSessions)
        .where(
          and(
            eq(billiardSessions.billId, bill.id),
            ne(billiardSessions.status, 'finished'),
          ),
        )
        .limit(1);
      if (activeSession) {
        throw new AppError('ACTIVE_SESSION', 'Sesi billiard masih berjalan.');
      }

      const [pending] = await tx
        .select({ total: count() })
        .from(orders)
        .where(and(eq(orders.billId, bill.id), eq(orders.status, 'pending')));
      if ((pending?.total ?? 0) > 0) {
        throw new AppError('PENDING_ORDERS', 'Masih ada order pending.');
      }

      const { total } = await recalcBillTotals(tx, bill.id, now);
      const existingPayments = await tx
        .select({ amount: payments.amount })
        .from(payments)
        .where(eq(payments.billId, bill.id));
      const paid = existingPayments.reduce((sum, row) => sum + row.amount, 0);
      const remaining = total - paid;
      if (payload.amount !== remaining) {
        throw new AppError(
          'AMOUNT_MISMATCH',
          `Nominal webhook (${payload.amount}) tidak sama dengan sisa tagihan (${remaining}).`,
        );
      }

      await tx.insert(payments).values({
        billId: bill.id,
        method: payload.method,
        amount: payload.amount,
        externalRef: payload.externalRef,
        createdAt: now,
      });

      await tx
        .update(bills)
        .set({
          status: 'paid',
          closedAt: now,
          subtotal: bill.subtotal,
          taxAmount: bill.taxAmount,
          serviceAmount: bill.serviceAmount,
          total,
        })
        .where(and(eq(bills.id, bill.id), eq(bills.status, 'open')));
      await tx
        .update(venueTables)
        .set({ needsCleaningAt: now })
        .where(eq(venueTables.id, bill.tableId));

      await audit(tx, {
        staffId: null,
        action: 'bill.paid_webhook',
        entityType: 'bill',
        entityId: bill.id,
        detail: {
          billNumber: bill.billNumber,
          method: payload.method,
          amount: payload.amount,
          externalRef: payload.externalRef,
        },
        at: now,
      });

      return { duplicate: false, status: 'paid' as const };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ ok: true, duplicate: true, status: 'already_recorded' });
    }
    if (error instanceof AppError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 400 },
      );
    }
    console.error('[payment webhook]', error);
    return NextResponse.json({ ok: false, error: 'Internal error.' }, { status: 500 });
  }
}
