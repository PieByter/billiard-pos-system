import { and, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { getDb } from '@/lib/db';
import { venueTables } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim();
  if (!token || token.length > 120) {
    return new Response('Token tidak valid', { status: 400 });
  }

  const db = await getDb();
  const [table] = await db
    .select({ id: venueTables.id })
    .from(venueTables)
    .where(and(eq(venueTables.qrToken, token), eq(venueTables.active, true)))
    .limit(1);
  if (!table) return new Response('Meja tidak ditemukan', { status: 404 });

  const customerUrl = `${url.origin}/t/${token}`;
  const png = await QRCode.toBuffer(customerUrl, {
    type: 'png',
    width: 720,
    margin: 1,
    color: { dark: '#0b1326', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
