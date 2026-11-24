import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../lib/db/schema';

/**
 * Provision Supabase Auth users untuk staff yang sudah ada di tabel profiles.
 * Jalankan setelah `npm run db:seed`, dengan SERVICE ROLE KEY (server-only).
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... npm run auth:provision
 *
 * Login pertama akan otomatis me-link profile by email (FK on update cascade).
 */
async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi.');
  }
  if (!dbUrl) throw new Error('DATABASE_URL / DIRECT_URL wajib diisi.');

  const password = process.env.SEED_STAFF_PASSWORD ?? 'demo1234';
  if (password === 'demo1234' && process.env.NODE_ENV === 'production') {
    console.warn('PERINGATAN: ganti SEED_STAFF_PASSWORD sebelum production.');
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl);
  const sql = postgres(dbUrl, {
    prepare: false,
    max: 1,
    ssl: isLocal || dbUrl.includes('sslmode=disable') ? false : 'require',
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema, casing: 'snake_case' });
  const profiles = await db.select().from(schema.profiles);

  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;
  const existing = new Map((list?.users ?? []).map((user) => [user.email?.toLowerCase(), user]));

  for (const profile of profiles) {
    const email = profile.email.toLowerCase();
    if (existing.has(email)) {
      console.log(`skip (sudah ada): ${email}`);
      continue;
    }
    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: profile.name, role: profile.role },
    });
    if (error) {
      console.error(`gagal membuat ${email}:`, error.message);
      continue;
    }
    console.log(`created: ${email} (${profile.role})`);
  }

  console.log('\nSelesai. Akun awal:');
  for (const profile of profiles) {
    console.log(`- ${profile.email} / ${password} (${profile.role})`);
  }
  console.log('\nGanti password demo sebelum go-live.');

  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
