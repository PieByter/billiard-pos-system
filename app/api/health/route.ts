import { NextResponse } from 'next/server';
import { pingDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ok = await pingDb();
  return NextResponse.json(
    {
      ok,
      service: 'cuetap-pos',
      database: ok ? 'up' : 'down',
      mode: process.env.DATABASE_URL ? 'supabase' : 'demo-pglite',
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
