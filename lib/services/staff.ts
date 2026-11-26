import { hashSync } from 'bcryptjs';
import { and, eq, ne, sql } from 'drizzle-orm';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import { profiles, type ProfileRole } from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { audit } from './audit';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const ROLES = new Set<ProfileRole>(['owner', 'cashier', 'kitchen']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type StaffInput = {
  id?: string;
  email: string;
  name: string;
  role: ProfileRole;
  active?: boolean;
  password?: string | null;
};

function isSupabaseAuth() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function normalizeInput(input: StaffInput) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL_RE.test(email)) throw new AppError('INVALID_EMAIL', 'Email staff tidak valid.');
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama staff wajib diisi.');
  if (!ROLES.has(input.role)) throw new AppError('INVALID_ROLE', 'Role staff tidak valid.');
  return { email, name };
}

async function assertNotLastOwner(
  tx: DbTransaction,
  targetId: string,
  nextRole: ProfileRole,
  nextActive: boolean,
) {
  if (nextRole === 'owner' && nextActive) return;
  const [target] = await tx.select().from(profiles).where(eq(profiles.id, targetId)).limit(1);
  if (!target || target.role !== 'owner' || !target.active) return;
  const [owners] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(profiles)
    .where(and(eq(profiles.role, 'owner'), eq(profiles.active, true)));
  if ((owners?.total ?? 0) <= 1) {
    throw new AppError('LAST_OWNER', 'Tidak bisa menonaktifkan/menurunkan owner aktif terakhir.');
  }
}

export async function saveStaff(actorId: string, input: StaffInput) {
  const { email, name } = normalizeInput(input);
  const active = input.active ?? true;
  const password = input.password?.trim() || null;
  if (!input.id && (!password || password.length < 8)) {
    throw new AppError('PASSWORD_REQUIRED', 'Password staff minimal 8 karakter untuk akun baru.');
  }
  if (password && password.length < 8) {
    throw new AppError('PASSWORD_WEAK', 'Password staff minimal 8 karakter.');
  }

  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      if (input.id) {
        const [target] = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.id, input.id))
          .limit(1);
        if (!target) throw new AppError('STAFF_NOT_FOUND', 'Staff tidak ditemukan.');
        if (target.id === actorId && (!active || input.role !== target.role)) {
          throw new AppError('SELF_ROLE', 'Tidak bisa menonaktifkan atau mengubah role akun sendiri.');
        }
        await assertNotLastOwner(tx, target.id, input.role, active);

        const [duplicate] = await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(and(eq(profiles.email, email), ne(profiles.id, target.id)))
          .limit(1);
        if (duplicate) throw new AppError('EMAIL_TAKEN', 'Email sudah dipakai staff lain.');

        const admin = isSupabaseAuth() ? getSupabaseAdminClient() : null;
        const needsAuthUpdate = email !== target.email || Boolean(password);
        if (isSupabaseAuth() && needsAuthUpdate) {
          if (!admin) {
            throw new AppError(
              'AUTH_NOT_CONFIGURED',
              'SUPABASE_SERVICE_ROLE_KEY belum diisi; perubahan email/password tidak bisa diproses.',
            );
          }
          const { error } = await admin.auth.admin.updateUserById(target.id, {
            email,
            ...(password ? { password } : {}),
            email_confirm: true,
            user_metadata: { name },
          });
          if (error) throw new AppError('AUTH_UPDATE_FAILED', error.message);
        }

        const [updated] = await tx
          .update(profiles)
          .set({
            email,
            name,
            role: input.role,
            active,
            passwordHash: password ? hashSync(password, 10) : target.passwordHash,
            updatedAt: now,
          })
          .where(eq(profiles.id, target.id))
          .returning();

        await audit(tx, {
          staffId: actorId,
          action: 'staff.updated',
          entityType: 'profile',
          entityId: updated.id,
          detail: { email, name, role: input.role, active, passwordChanged: Boolean(password) },
          at: now,
        });
        return { id: updated.id };
      }

      const [duplicate] = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.email, email))
        .limit(1);
      if (duplicate) throw new AppError('EMAIL_TAKEN', 'Email sudah dipakai staff lain.');

      let profileId = crypto.randomUUID();
      const admin = isSupabaseAuth() ? getSupabaseAdminClient() : null;
      if (isSupabaseAuth()) {
        if (!admin) {
          throw new AppError(
            'AUTH_NOT_CONFIGURED',
            'SUPABASE_SERVICE_ROLE_KEY belum diisi; staff baru tidak bisa dibuat.',
          );
        }
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: password!,
          email_confirm: true,
          user_metadata: { name, role: input.role },
        });
        if (error || !data.user) {
          throw new AppError('AUTH_CREATE_FAILED', error?.message ?? 'Gagal membuat auth user.');
        }
        profileId = data.user.id;
      }

      try {
        const [created] = await tx
          .insert(profiles)
          .values({
            id: profileId,
            email,
            name,
            role: input.role,
            active,
            passwordHash: isSupabaseAuth() ? null : hashSync(password!, 10),
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await audit(tx, {
          staffId: actorId,
          action: 'staff.created',
          entityType: 'profile',
          entityId: created.id,
          detail: { email, name, role: input.role },
          at: now,
        });
        return { id: created.id };
      } catch (error) {
        if (isSupabaseAuth() && admin) {
          await admin.auth.admin.deleteUser(profileId).catch(() => undefined);
        }
        throw error;
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError('EMAIL_TAKEN', 'Email sudah dipakai staff lain.');
    throw error;
  }
}

export async function setStaffActive(actorId: string, targetId: string, active: boolean) {
  if (targetId === actorId && !active) {
    throw new AppError('SELF_DEACTIVATE', 'Tidak bisa menonaktifkan akun sendiri.');
  }
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(profiles).where(eq(profiles.id, targetId)).limit(1);
    if (!target) throw new AppError('STAFF_NOT_FOUND', 'Staff tidak ditemukan.');
    await assertNotLastOwner(tx, targetId, target.role, active);
    const now = await dbNow(tx);
    const [updated] = await tx
      .update(profiles)
      .set({ active, updatedAt: now })
      .where(eq(profiles.id, targetId))
      .returning();
    await audit(tx, {
      staffId: actorId,
      action: active ? 'staff.activated' : 'staff.deactivated',
      entityType: 'profile',
      entityId: targetId,
      detail: { email: target.email, name: target.name },
      at: now,
    });
    return { active: updated.active };
  });
}
