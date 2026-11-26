import { createHmac, timingSafeEqual } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { compareSync } from 'bcryptjs';
import { createServerClient } from '@supabase/ssr';
import { eq, sql } from 'drizzle-orm';
import { ACTIVE_OUTLET_COOKIE } from './constants';
import { getDb } from './db';
import { profiles, type ProfileRole, type StaffProfile } from './db/schema';
import { AppError } from './errors';

export const SESSION_COOKIE = 'cuetap_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 jam
const DEV_SECRET = 'cuetap-local-dev-secret-change-in-production';

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function isDemoAuthAllowed(): boolean {
  if (isSupabaseConfigured()) return false;
  if (process.env.VERCEL && process.env.DEMO_AUTH !== 'true') return false;
  return true;
}

export function authMode(): 'supabase' | 'demo' | 'disabled' {
  if (isSupabaseConfigured()) return 'supabase';
  return isDemoAuthAllowed() ? 'demo' : 'disabled';
}

function authSecret(): string {
  return process.env.AUTH_SECRET || DEV_SECRET;
}

function sign(value: string): string {
  return createHmac('sha256', authSecret()).update(value).digest('base64url');
}

function encodeSession(profileId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: profileId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decodeSession(raw: string | undefined): string | null {
  if (!raw) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    if (!data.sub || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.sub;
  } catch {
    return null;
  }
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component tidak dapat menulis cookie — ditangani middleware.
          }
        },
      },
    },
  );
}

async function findProfileByEmail(email: string): Promise<StaffProfile | null> {
  const db = await getDb();
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, email.toLowerCase()))
    .limit(1);
  return profile ?? null;
}

/**
 * Supabase Auth user → profiles. Profile harus sudah di-provision.
 * Jika email cocok tetapi id berbeda (seed → auth user), id di-link ulang
 * dan seluruh FK ikut ter-cascade.
 */
async function resolveSupabaseProfile(userId: string, email: string | undefined) {
  const db = await getDb();
  const [byId] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (byId?.active) return byId;

  if (!email) return null;
  const byEmail = await findProfileByEmail(email);
  if (!byEmail || !byEmail.active) return null;

  try {
    await db
      .update(profiles)
      .set({ id: userId, email: email.toLowerCase(), updatedAt: new Date() })
      .where(eq(profiles.id, byEmail.id));
    return { ...byEmail, id: userId, email: email.toLowerCase() };
  } catch {
    // Bisa gagal jika id auth sudah dipakai profil lain.
    return null;
  }
}

async function readSupabaseStaff(): Promise<StaffProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return resolveSupabaseProfile(user.id, user.email ?? undefined);
}

async function readDemoStaff(): Promise<StaffProfile | null> {
  if (!isDemoAuthAllowed()) return null;
  const cookieStore = await cookies();
  const profileId = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!profileId) return null;

  const db = await getDb();
  const [profile] = await db
    .select()
    .from(profiles)
    .where(sql`${profiles.id} = ${profileId}`)
    .limit(1);
  return profile?.active ? profile : null;
}

export const getCurrentStaff = cache(async (): Promise<StaffProfile | null> => {
  try {
    if (isSupabaseConfigured()) return await readSupabaseStaff();
    return await readDemoStaff();
  } catch (error) {
    console.error('getCurrentStaff failed:', error);
    return null;
  }
});

export function homeForRole(role: ProfileRole): string {
  if (role === 'kitchen') return '/staff/kitchen';
  return '/staff/cashier';
}

export async function requireStaff(roles?: ProfileRole[]): Promise<StaffProfile> {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');
  if (roles && !roles.includes(staff.role)) redirect(homeForRole(staff.role));
  return staff;
}

/** Untuk server action: jangan redirect, kembalikan error yang bisa di-toast. */
export async function requireStaffAction(roles?: ProfileRole[]): Promise<StaffProfile> {
  const staff = await getCurrentStaff();
  if (!staff) throw new AppError('UNAUTHORIZED', 'Sesi berakhir. Silakan login ulang.');
  if (roles && !roles.includes(staff.role)) {
    throw new AppError('FORBIDDEN', 'Role kamu tidak punya akses untuk aksi ini.');
  }
  return staff;
}

export type SignInResult =
  | { ok: true; role: ProfileRole; redirectTo: string }
  | { ok: false; error: string };

export async function signInWithEmail(emailRaw: string, password: string): Promise<SignInResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return { ok: false, error: 'Email dan password wajib diisi.' };

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return { ok: false, error: 'Email atau password salah.' };
    }
    const profile = await resolveSupabaseProfile(data.user.id, data.user.email ?? email);
    if (!profile) {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: 'Akun ini belum terdaftar sebagai staff Cue & Tap. Hubungi owner.',
      };
    }
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_OUTLET_COOKIE, profile.outletId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true, role: profile.role, redirectTo: homeForRole(profile.role) };
  }

  if (!isDemoAuthAllowed()) {
    return {
      ok: false,
      error:
        'Supabase Auth belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  const profile = await findProfileByEmail(email);
  if (!profile || !profile.active || !profile.passwordHash) {
    return { ok: false, error: 'Akun demo tidak ditemukan.' };
  }
  if (!compareSync(password, profile.passwordHash)) {
    return { ok: false, error: 'Email atau password salah.' };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(profile.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  cookieStore.set(ACTIVE_OUTLET_COOKIE, profile.outletId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return { ok: true, role: profile.role, redirectTo: homeForRole(profile.role) };
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
