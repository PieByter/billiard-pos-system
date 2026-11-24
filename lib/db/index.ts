import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { seedDatabase } from './seed';

export type AppDb = PostgresJsDatabase<typeof schema>;
export type DbTransaction = Parameters<Parameters<AppDb['transaction']>[0]>[0];

type DbGlobal = typeof globalThis & {
  __cuetapDbPromise?: Promise<AppDb>;
  __cuetapPgClient?: ReturnType<typeof postgres>;
  __cuetapTxChain?: Promise<unknown>;
};

const globalForDb = globalThis as DbGlobal;

/**
 * PGlite hanya punya satu koneksi. Transaksi yang overlap bisa saling
 * menimpa, jadi semua transaksi diserialisasi per proses. Di Supabase
 * (production) ini hanya menambah sedikit antrean di satu instance.
 */
function serializeTransactions(db: AppDb): AppDb {
  const original = db.transaction.bind(db) as (...args: unknown[]) => Promise<unknown>;
  const wrapped = (...args: unknown[]) => {
    const previous = globalForDb.__cuetapTxChain ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => original(...args));
    globalForDb.__cuetapTxChain = run.catch(() => undefined);
    return run;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any).transaction = wrapped;
  return db;
}

function hasRemoteDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

async function initRemote(): Promise<AppDb> {
  const url = process.env.DATABASE_URL!;
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const client = postgres(url, {
    prepare: false, // wajib untuk Supabase transaction pooler (port 6543)
    max: 1, // satu koneksi per instance serverless
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: isLocal || url.includes('sslmode=disable') ? false : 'require',
    onnotice: () => {},
  });
  globalForDb.__cuetapPgClient = client;
  return drizzle(client, { schema, casing: 'snake_case' });
}

async function initLocal(): Promise<AppDb> {
  if (process.env.VERCEL) {
    throw new Error(
      'DATABASE_URL wajib diisi di Vercel. Mode database demo (PGlite) hanya untuk lokal.',
    );
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const dataDir =
    process.env.DEMO_DB_PATH ?? path.join(process.cwd(), '.data', 'pglite');
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await client.waitReady;

  const localDb = drizzlePglite(client, { schema, casing: 'snake_case' });
  await migrate(localDb, {
    migrationsFolder: path.join(process.cwd(), 'drizzle'),
  });

  const db = localDb as unknown as AppDb;
  const demoSeed = process.env.CUETAP_SEED_MODE !== 'catalog';
  await seedDatabase(db, { demo: demoSeed });
  return serializeTransactions(db);
}

export function getDb(): Promise<AppDb> {
  if (!globalForDb.__cuetapDbPromise) {
    globalForDb.__cuetapDbPromise = (async () => {
      const db = hasRemoteDb() ? await initRemote() : await initLocal();
      return db;
    })().catch((error) => {
      globalForDb.__cuetapDbPromise = undefined;
      throw error;
    });
  }
  return globalForDb.__cuetapDbPromise;
}

const NOW_QUERY = sql`select now() as now`;

type QueryExecutor = {
  execute: (query: typeof NOW_QUERY) => Promise<unknown>;
};

/**
 * Waktu server dari Postgres, bukan jam Node/serverless.
 * Dipakai untuk menghitung billing supaya clock skew tidak berpengaruh.
 */
export async function dbNow(executor?: QueryExecutor): Promise<Date> {
  const db = executor ?? (await getDb());
  const result = (await db.execute(NOW_QUERY)) as unknown;
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] }).rows ?? []);
  const raw = (rows[0] as { now?: unknown } | undefined)?.now;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export async function pingDb(): Promise<boolean> {
  try {
    await dbNow();
    return true;
  } catch {
    return false;
  }
}

export { schema };
