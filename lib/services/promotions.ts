import { and, eq, ne, sql } from 'drizzle-orm';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import {
  billPromotions,
  billSplits,
  bills,
  promotions,
  type Promotion,
} from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { getActiveOutletId } from '@/lib/outlet';
import { audit } from './audit';
import { recalcBillTotals } from './bill';
import {
  calculatePromotionDiscount,
  getBundleBase,
  getPromotionBase,
  memberPromotionUses,
  promotionWindowMatches,
  syncBillPromotionAggregate,
} from './promotion-engine';

export { calculatePromotionDiscount } from './promotion-engine';

async function hasSplits(tx: DbTransaction, billId: string) {
  const [row] = await tx
    .select({ id: billSplits.id })
    .from(billSplits)
    .where(eq(billSplits.billId, billId))
    .limit(1);
  return Boolean(row);
}

export type PromotionInput = {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  type: 'percent' | 'fixed' | 'bundle';
  value: number;
  minSpend: number;
  maxDiscount?: number | null;
  maxUses?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  appliesTo: 'all' | 'billiard' | 'fnb';
  memberOnly?: boolean;
  stackable?: boolean;
  autoApply?: boolean;
  daysOfWeek?: number[];
  startMinute?: number;
  endMinute?: number;
  maxUsesPerMember?: number | null;
  bundlePrice?: number | null;
  bundleItemIds?: string[];
  active?: boolean;
};

function validateWindow(promo: PromotionInput) {
  const start = promo.startMinute ?? 0;
  const end = promo.endMinute ?? 1440;
  if (start < 0 || start > 1439 || end < 1 || end > 1440) {
    throw new AppError('INVALID_WINDOW', 'Window happy hour tidak valid.');
  }
  if (start === end) {
    throw new AppError('INVALID_WINDOW', 'Jam mulai dan selesai tidak boleh sama.');
  }
}

function assertPromotionUsable(
  promo: Promotion,
  bill: typeof bills.$inferSelect,
  now: Date,
  manual: boolean,
) {
  if (!promo.active) throw new AppError('PROMO_NOT_FOUND', 'Kode promo tidak aktif.');
  if (promo.validFrom && promo.validFrom > now) {
    throw new AppError('PROMO_NOT_STARTED', 'Promo belum berlaku.');
  }
  if (promo.validTo && promo.validTo < now) {
    throw new AppError('PROMO_EXPIRED', 'Promo sudah kedaluwarsa.');
  }
  if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
    throw new AppError('PROMO_QUOTA', 'Kuota promo sudah habis.');
  }
  if (promo.memberOnly && !bill.memberId) {
    throw new AppError('PROMO_MEMBER_ONLY', 'Promo ini hanya untuk member.');
  }
  if (manual && promo.autoApply && !promotionWindowMatches(promo, now)) {
    throw new AppError(
      'PROMO_OUTSIDE_WINDOW',
      'Promo otomatis ini hanya berlaku pada window happy hour yang ditentukan.',
    );
  }
}

export async function applyPromotionToBill(staffId: string, billId: string, codeRaw: string) {
  const code = codeRaw.trim().toUpperCase();
  if (!code) throw new AppError('INVALID_CODE', 'Kode promo wajib diisi.');
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    if (await hasSplits(tx, billId)) {
      throw new AppError('BILL_SPLIT_LOCKED', 'Promo tidak bisa diubah setelah split.');
    }
    const [promo] = await tx
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.code, code),
          eq(promotions.outletId, bill.outletId),
        ),
      )
      .limit(1);
    if (!promo) throw new AppError('PROMO_NOT_FOUND', 'Kode promo tidak aktif.');
    assertPromotionUsable(promo, bill, now, true);

    if (promo.maxUsesPerMember !== null && bill.memberId) {
      const used = await memberPromotionUses(tx, bill.memberId, promo.id);
      if (used >= promo.maxUsesPerMember) {
        throw new AppError(
          'PROMO_MEMBER_QUOTA',
          'Member ini sudah mencapai batas pemakaian promo.',
        );
      }
    }

    const existing = await tx
      .select()
      .from(billPromotions)
      .where(eq(billPromotions.billId, billId));
    if (existing.some((row) => row.promotionId === promo.id)) {
      throw new AppError('PROMO_ALREADY_APPLIED', 'Promo ini sudah terpasang di bill.');
    }
    const blocking = existing.find((row) => !row.autoApplied);
    if (blocking) {
      const blockingPromo = await tx
        .select({ stackable: promotions.stackable })
        .from(promotions)
        .where(eq(promotions.id, blocking.promotionId))
        .limit(1);
      if (!blockingPromo[0]?.stackable) {
        throw new AppError(
          'PROMO_NOT_STACKABLE',
          'Promo sebelumnya tidak bisa digabung. Hapus promo lama terlebih dahulu.',
        );
      }
    }
    if (!promo.stackable && existing.length > 0) {
      await tx.delete(billPromotions).where(eq(billPromotions.billId, billId));
    }

    const base = await getPromotionBase(tx, billId, promo.appliesTo);
    const bundle =
      promo.type === 'bundle'
        ? await getBundleBase(tx, billId, promo.bundleItemIds)
        : { base: 0, complete: true };
    if (promo.type === 'bundle' && !bundle.complete) {
      throw new AppError(
        'PROMO_BUNDLE_INCOMPLETE',
        'Semua menu dalam paket bundle harus ada di bill.',
      );
    }
    if (base < promo.minSpend) {
      throw new AppError(
        'PROMO_MIN_SPEND',
        `Minimal belanja promo ${promo.minSpend} untuk cakupan ini.`,
      );
    }
    const discount = calculatePromotionDiscount(promo, base, bundle.base);
    if (discount <= 0) throw new AppError('PROMO_ZERO', 'Promo tidak menghasilkan diskon.');

    await tx
      .insert(billPromotions)
      .values({
        outletId: bill.outletId,
        billId,
        promotionId: promo.id,
        code: promo.code,
        name: promo.name,
        discountAmount: discount,
        autoApplied: false,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [billPromotions.billId, billPromotions.promotionId],
        set: { discountAmount: discount, autoApplied: false },
      });
    const aggregate = await syncBillPromotionAggregate(tx, billId);
    const updated = await recalcBillTotals(tx, billId, now);
    await audit(tx, {
      staffId,
      action: 'bill.promotion_applied',
      entityType: 'bill',
      entityId: billId,
      detail: {
        billNumber: bill.billNumber,
        code: promo.code,
        base,
        discount,
        stackedDiscount: aggregate.total,
        total: updated.total,
      },
      at: now,
    });
    return { code: promo.code, discount, total: updated.total };
  });
}

export async function removePromotionFromBill(
  staffId: string,
  billId: string,
  codeRaw?: string | null,
) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    if (await hasSplits(tx, billId)) {
      throw new AppError('BILL_SPLIT_LOCKED', 'Promo tidak bisa diubah setelah split.');
    }
    const code = codeRaw?.trim().toUpperCase();
    if (code) {
      await tx
        .delete(billPromotions)
        .where(and(eq(billPromotions.billId, billId), eq(billPromotions.code, code)));
    } else {
      await tx.delete(billPromotions).where(eq(billPromotions.billId, billId));
    }
    await syncBillPromotionAggregate(tx, billId);
    const updated = await recalcBillTotals(tx, billId, now);
    await audit(tx, {
      staffId,
      action: 'bill.promotion_removed',
      entityType: 'bill',
      entityId: billId,
      detail: { billNumber: bill.billNumber, code: code ?? 'ALL' },
      at: now,
    });
    return { total: updated.total };
  });
}

export async function consumePromotionForBill(
  tx: DbTransaction,
  billId: string,
  staffId: string | null,
) {
  const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
  if (!bill) return null;
  const rows = await tx
    .select()
    .from(billPromotions)
    .where(and(eq(billPromotions.billId, billId), sql`${billPromotions.consumedAt} is null`));
  if (rows.length === 0) return null;
  const now = await dbNow(tx);
  for (const row of rows) {
    await tx
      .update(promotions)
      .set({ usesCount: sql`${promotions.usesCount} + 1`, updatedAt: now })
      .where(eq(promotions.id, row.promotionId));
    await tx
      .update(billPromotions)
      .set({ consumedAt: now })
      .where(eq(billPromotions.id, row.id));
  }
  const [updatedBill] = await tx
    .update(bills)
    .set({ promotionConsumedAt: now })
    .where(eq(bills.id, billId))
    .returning();
  await audit(tx, {
    staffId,
    action: 'bill.promotion_consumed',
    entityType: 'bill',
    entityId: billId,
    detail: {
      billNumber: bill.billNumber,
      codes: rows.map((row) => row.code),
    },
    at: now,
  });
  return updatedBill;
}

export async function savePromotion(staffId: string, input: PromotionInput) {
  const outletId = await getActiveOutletId();
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) {
    throw new AppError('INVALID_CODE', 'Kode promo 3-24 karakter, huruf/angka/dash.');
  }
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama promo wajib diisi.');
  if (input.type === 'percent' && (input.value < 1 || input.value > 10_000)) {
    throw new AppError('INVALID_VALUE', 'Persentase promo 1-10000 bps.');
  }
  if (input.type === 'fixed' && input.value < 1) {
    throw new AppError('INVALID_VALUE', 'Nominal promo tidak valid.');
  }
  if (input.type === 'bundle') {
    if (!input.bundlePrice || input.bundlePrice < 1) {
      throw new AppError('INVALID_BUNDLE', 'Harga bundle wajib diisi.');
    }
    if (!input.bundleItemIds || input.bundleItemIds.length < 2) {
      throw new AppError('INVALID_BUNDLE', 'Bundle minimal terdiri dari 2 menu.');
    }
  }
  if (input.autoApply) validateWindow(input);
  const validFrom = input.validFrom ? new Date(input.validFrom) : null;
  const validTo = input.validTo ? new Date(input.validTo) : null;
  if (validFrom && validTo && validFrom >= validTo) {
    throw new AppError('INVALID_PERIOD', 'Tanggal mulai harus sebelum tanggal selesai.');
  }

  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      const values = {
        outletId,
        code,
        name,
        description: input.description?.trim() || null,
        type: input.type,
        value: Math.round(input.type === 'bundle' ? input.bundlePrice ?? input.value : input.value),
        minSpend: Math.max(0, Math.round(input.minSpend)),
        maxDiscount: input.maxDiscount ? Math.max(0, Math.round(input.maxDiscount)) : null,
        maxUses: input.maxUses ?? null,
        validFrom,
        validTo,
        appliesTo: input.appliesTo,
        memberOnly: input.memberOnly ?? false,
        stackable: input.stackable ?? false,
        autoApply: input.autoApply ?? false,
        daysOfWeek: input.daysOfWeek?.length ? input.daysOfWeek : [1, 2, 3, 4, 5, 6, 7],
        startMinute: input.startMinute ?? 0,
        endMinute: input.endMinute ?? 1440,
        maxUsesPerMember: input.maxUsesPerMember ?? null,
        bundlePrice: input.type === 'bundle' ? input.bundlePrice ?? null : null,
        bundleItemIds: input.type === 'bundle' ? input.bundleItemIds ?? [] : [],
        active: input.active ?? true,
        updatedAt: now,
      };
      if (input.id) {
        const [updated] = await tx
          .update(promotions)
          .set(values)
          .where(and(eq(promotions.id, input.id), eq(promotions.outletId, outletId)))
          .returning();
        if (!updated) throw new AppError('PROMO_NOT_FOUND', 'Promosi tidak ditemukan.');
        await audit(tx, {
          staffId,
          action: 'promotion.updated',
          entityType: 'promotion',
          entityId: updated.id,
          detail: { code, name, type: input.type, stackable: values.stackable },
          at: now,
        });
        return { id: updated.id };
      }
      const [created] = await tx
        .insert(promotions)
        .values({ ...values, createdAt: now })
        .returning();
      await audit(tx, {
        staffId,
        action: 'promotion.created',
        entityType: 'promotion',
        entityId: created.id,
        detail: { code, name, type: input.type, stackable: values.stackable },
        at: now,
      });
      return { id: created.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError('CODE_TAKEN', 'Kode promo sudah dipakai.');
    throw error;
  }
}

export async function togglePromotion(staffId: string, promotionId: string) {
  const outletId = await getActiveOutletId();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [promo] = await tx
      .select()
      .from(promotions)
      .where(and(eq(promotions.id, promotionId), eq(promotions.outletId, outletId)))
      .limit(1);
    if (!promo) throw new AppError('PROMO_NOT_FOUND', 'Promosi tidak ditemukan.');
    const [updated] = await tx
      .update(promotions)
      .set({ active: !promo.active, updatedAt: now })
      .where(eq(promotions.id, promotionId))
      .returning();
    await audit(tx, {
      staffId,
      action: updated.active ? 'promotion.activated' : 'promotion.deactivated',
      entityType: 'promotion',
      entityId: promotionId,
      detail: { code: promo.code },
      at: now,
    });
    return { active: updated.active };
  });
}
