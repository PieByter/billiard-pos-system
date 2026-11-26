import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { paymentIntents } from '@/lib/db/schema';
import { settleQrisIntent } from '@/lib/services/payment-intents';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const raw = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Body bukan JSON.' }, { status: 400 });
  }

  const db = await getDb();
  const midtransKey = process.env.MIDTRANS_SERVER_KEY?.trim();
  const xenditToken = process.env.XENDIT_CALLBACK_TOKEN?.trim();

  // Midtrans HTTP notification.
  if (midtransKey && typeof payload.order_id === 'string') {
    const statusCode = String(payload.status_code ?? '');
    const grossAmount = String(payload.gross_amount ?? '');
    const expected = createHash('sha512')
      .update(`${payload.order_id}${statusCode}${grossAmount}${midtransKey}`)
      .digest('hex');
    const signature = String(payload.signature_key ?? '');
    if (!signature || !safeEqual(signature, expected)) {
      return NextResponse.json({ ok: false, error: 'Signature tidak valid.' }, { status: 401 });
    }
    const status = String(payload.transaction_status ?? '');
    if (!['settlement', 'capture'].includes(status)) {
      return NextResponse.json({ ok: true, ignored: true, status });
    }
    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.providerOrderId, payload.order_id))
      .limit(1);
    if (!intent || intent.provider !== 'midtrans') {
      return NextResponse.json({ ok: true, ignored: true, reason: 'intent_not_found' });
    }
    try {
      const result = await settleQrisIntent(intent.id, String(payload.transaction_id ?? ''), payload);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : 'Settlement gagal.' },
        { status: 400 },
      );
    }
  }

  // Xendit callback.
  if (xenditToken && typeof payload.reference_id === 'string') {
    const token = request.headers.get('x-callback-token') ?? '';
    if (!safeEqual(token, xenditToken)) {
      return NextResponse.json({ ok: false, error: 'Callback token tidak valid.' }, { status: 401 });
    }
    if (String(payload.status ?? '').toUpperCase() !== 'PAID') {
      return NextResponse.json({ ok: true, ignored: true });
    }
    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.providerOrderId, payload.reference_id))
      .limit(1);
    if (!intent || intent.provider !== 'xendit') {
      return NextResponse.json({ ok: true, ignored: true, reason: 'intent_not_found' });
    }
    try {
      const result = await settleQrisIntent(intent.id, String(payload.id ?? ''), payload);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : 'Settlement gagal.' },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: false, error: 'Provider tidak dikenali.' }, { status: 400 });
}
