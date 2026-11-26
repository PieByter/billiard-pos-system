import { eq } from 'drizzle-orm';
import { dbNow, getDb } from '@/lib/db';
import {
  billiardRates,
  memberTiers,
  menuCategories,
  outlets,
  venueSettings,
} from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { audit } from './audit';

export type OutletInput = {
  id?: string;
  code: string;
  name: string;
  address?: string | null;
  timezone?: string;
  active?: boolean;
};

export async function saveOutlet(staffId: string, input: OutletInput) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z0-9-]{2,12}$/.test(code)) {
    throw new AppError('INVALID_CODE', 'Kode outlet 2-12 karakter huruf/angka/dash.');
  }
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama outlet wajib diisi.');
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      const values = {
        code,
        name,
        address: input.address?.trim() ?? '',
        timezone: input.timezone?.trim() || 'Asia/Jakarta',
        active: input.active ?? true,
        updatedAt: now,
      };
      if (input.id) {
        const [updated] = await tx
          .update(outlets)
          .set(values)
          .where(eq(outlets.id, input.id))
          .returning();
        if (!updated) throw new AppError('OUTLET_NOT_FOUND', 'Outlet tidak ditemukan.');
        await audit(tx, {
          staffId,
          action: 'outlet.updated',
          entityType: 'outlet',
          entityId: updated.id,
          outletId: updated.id,
          detail: { code, name },
          at: now,
        });
        return { id: updated.id };
      }
      const [created] = await tx
        .insert(outlets)
        .values({ ...values, createdAt: now })
        .returning();
      await tx
        .insert(venueSettings)
        .values({
          id: `outlet-${created.id}`,
          outletId: created.id,
          venueName: name,
          address: values.address,
          timezone: values.timezone,
        })
        .onConflictDoNothing();
      await tx.insert(menuCategories).values(
        [
          ['Coffee & Tea', 'local_cafe'],
          ['Mocktails & Cocktails', 'local_bar'],
          ['Billiard Bites', 'tapas'],
          ['Main Course', 'restaurant'],
          ['Pizza & Pasta', 'local_pizza'],
          ['Dessert', 'icecream'],
          ['Beer & Soft Drinks', 'sports_bar'],
        ].map(([categoryName, icon], index) => ({
          outletId: created.id,
          name: categoryName,
          icon,
          sortOrder: index + 1,
        })),
      );
      await tx.insert(memberTiers).values([
        {
          outletId: created.id,
          name: 'Bronze',
          minSpend: 0,
          discountBps: 0,
          pointsMultiplierBps: 10_000,
          sortOrder: 1,
        },
        {
          outletId: created.id,
          name: 'Silver',
          minSpend: 500_000,
          discountBps: 500,
          pointsMultiplierBps: 12_500,
          sortOrder: 2,
        },
        {
          outletId: created.id,
          name: 'Gold',
          minSpend: 2_000_000,
          discountBps: 1000,
          pointsMultiplierBps: 15_000,
          sortOrder: 3,
        },
      ]);
      await tx.insert(billiardRates).values([
        {
          outletId: created.id,
          name: 'Standard 9ft',
          pricePerHour: 50_000,
          minMinutes: 30,
          incrementMinutes: 15,
          sortOrder: 1,
        },
        {
          outletId: created.id,
          name: 'VIP 9ft',
          pricePerHour: 60_000,
          minMinutes: 30,
          incrementMinutes: 15,
          sortOrder: 2,
        },
      ]);
      await audit(tx, {
        staffId,
        action: 'outlet.created',
        entityType: 'outlet',
        entityId: created.id,
        outletId: created.id,
        detail: { code, name },
        at: now,
      });
      return { id: created.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('OUTLET_CODE_TAKEN', 'Kode outlet sudah dipakai.');
    }
    throw error;
  }
}
