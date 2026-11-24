import { NextResponse } from 'next/server';
import { getCustomerOrdersByToken } from '@/lib/queries/customer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')?.trim();
  if (!token || token.length < 6 || token.length > 120) {
    return NextResponse.json({ ok: false, error: 'Token tidak valid.' }, { status: 400 });
  }

  const data = await getCustomerOrdersByToken(token);
  if (!data) {
    return NextResponse.json({ ok: false, error: 'Meja tidak ditemukan.' }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, ...data },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
