import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';
import * as schema from '../lib/db/schema';
import { seedDatabase } from '../lib/db/seed';

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Set DIRECT_URL (port 5432) atau DATABASE_URL sebelum menjalankan db:seed.',
    );
  }

  const demo = process.env.SEED_DEMO_DATA === 'true';
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const client = postgres(url, {
    prepare: false,
    max: 1,
    ssl: isLocal || url.includes('sslmode=disable') ? false : 'require',
    onnotice: () => {},
  });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('Menjalankan migration Drizzle...');
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });

  console.log(`Seeding database (${demo ? 'demo lengkap' : 'katalog dasar'})...`);
  await seedDatabase(db, { demo });
  console.log('Seed selesai.');

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
