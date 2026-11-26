import { asc, eq } from 'drizzle-orm';
import { ACTIVE_OUTLET_COOKIE, DEFAULT_OUTLET_ID } from './constants';
import { getDb } from './db';
import { outlets, type Outlet } from './db/schema';

export const DEFAULT_OUTLET: Outlet = {
  id: DEFAULT_OUTLET_ID,
  code: 'MAIN',
  name: 'Cue & Tap Main',
  address: '',
  timezone: 'Asia/Jakarta',
  active: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

/**
 * Outlet aktif disimpan di cookie agar owner bisa berpindah cabang.
 * Di script/integration test cookie tidak tersedia, jadi fallback ke env
 * CUETAP_OUTLET_ID atau outlet utama.
 */
export async function getActiveOutletId(): Promise<string> {
  const envOutlet = process.env.CUETAP_OUTLET_ID?.trim();
  if (envOutlet) return envOutlet;
  try {
    const { cookies } = await import('next/headers');
    const store = await cookies();
    const value = store.get(ACTIVE_OUTLET_COOKIE)?.value?.trim();
    if (value && /^[0-9a-f-]{36}$/i.test(value)) return value;
  } catch {
    // Bukan request Next.js (script/CLI) atau cookie belum tersedia.
  }
  return DEFAULT_OUTLET_ID;
}

export async function listOutlets(): Promise<Outlet[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(outlets)
    .where(eq(outlets.active, true))
    .orderBy(asc(outlets.name));
  return rows.length > 0 ? rows : [DEFAULT_OUTLET];
}

export async function getOutletContext(): Promise<{
  activeOutletId: string;
  outlets: Outlet[];
  activeOutlet: Outlet;
}> {
  const [all, requested] = await Promise.all([listOutlets(), getActiveOutletId()]);
  const activeOutlet =
    all.find((outlet) => outlet.id === requested) ??
    all.find((outlet) => outlet.id === DEFAULT_OUTLET_ID) ??
    all[0] ??
    DEFAULT_OUTLET;
  return { activeOutletId: activeOutlet.id, outlets: all, activeOutlet };
}

export async function getOutletById(outletId: string): Promise<Outlet | null> {
  const db = await getDb();
  const [row] = await db.select().from(outlets).where(eq(outlets.id, outletId)).limit(1);
  return row ?? null;
}
