import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import {
  billSplits,
  billiardSessions,
  bills,
  orderItems,
  orders,
  promotions,
  type Promotion,
} from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { audit } from './audit';
import { recalcBillTotals } from './bill';

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
  type: 'percent' | 'fixed';
  value: number;
  minSpend: number;
  maxDiscount?: number | null;
  maxUses?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  appliesTo: 'all' | 'billiard' | 'fnb';
  memberOnly?: boolean;
  active?: boolean;
};

export function calculatePromotionDiscount(promo: Promotion, base: number): number {
  if (base <= 0) return 0;
  const raw =
    promo.type === 'percent'
      ? Math.round((base * Math.max(0, promo.value)) / 10_000)
      : Math.max(0, promo.value);
  const capped = promo.maxDiscount ? Math.min(raw, promo.maxDiscount) : raw;
  return Math.min(base, capped);
}

async function promotionBase(
  tx: DbTransaction,
  billId: string,
  scope: 'all' | 'billiard' | 'fnb',
): Promise<number> {
  if (scope === 'all') {
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    return bill?.subtotal ?? 0;
  }
  if (scope === 'billiard') {
    const rows = await tx
      .select()
      .from(billiardSessions)
      .where(eq(billiardSessions.billId, billId));
    return rows.reduce((sum, session) => sum + (session.amount ?? 0), 0);
  }
  const orderRows = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.billId, billId), ne(orders.status, 'cancelled')));
  if (orderRows.length === 0) return 0;
  const itemRows = await tx
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderRows.map((order) => order.id)));
  return itemRows.reduce((sum, item) => sum + item.priceSnapshot * item.qty, 0);
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
    const [promo] = await tx.select().from(promotions).where(eq(promotions.code, code)).limit(1);
    if (!promo || !promo.active) throw new AppError('PROMO_NOT_FOUND', 'Kode promo tidak aktif.');
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
    const base = await promotionBase(tx, billId, promo.appliesTo);
    if (base < promo.minSpend) {
      throw new AppError(
        'PROMO_MIN_SPEND',
        `Minimal belanja promo ${promo.minSpend} untuk cakupan ini.`,
      );
    }
    const discount = calculatePromotionDiscount(promo, base);
    if (discount <= 0) throw new AppError('PROMO_ZERO', 'Promo tidak menghasilkan diskon.');
    await tx
      .update(bills)
      .set({
        promotionId: promo.id,
        promotionCode: promo.code,
        promoDiscountAmount: discount,
      })
      .where(eq(bills.id, billId));
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
        total: updated.total,
      },
      at: now,
    });
    return { code: promo.code, discount, total: updated.total };
  });
}

export async function removePromotionFromBill(staffId: string, billId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    if (await hasSplits(tx, billId)) {
      throw new AppError('BILL_SPLIT_LOCKED', 'Promo tidak bisa diubah setelah split.');
    }
    await tx
      .update(bills)
      .set({ promotionId: null, promotionCode: null, promoDiscountAmount: 0 })
      .where(eq(bills.id, billId));
    const updated = await recalcBillTotals(tx, billId, now);
    await audit(tx, {
      staffId,
      action: 'bill.promotion_removed',
      entityType: 'bill',
      entityId: billId,
      detail: { billNumber: bill.billNumber },
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
  if (!bill?.promotionId || bill.promotionConsumedAt) return null;
  const now = await dbNow(tx);
  await tx
    .update(promotions)
    .set({ usesCount: sql`${promotions.usesCount} + 1`, updatedAt: now })
    .where(eq(promotions.id, bill.promotionId));
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
    detail: { billNumber: bill.billNumber, code: bill.promotionCode },
    at: now,
  });
  return updatedBill;
}

export async function savePromotion(staffId: string, input: PromotionInput) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) {
    throw new AppError('INVALID_CODE', 'Kode promo 3–24 karakter, huruf/angka/dash.');
  }
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama promo wajib diisi.');
  if (input.type === 'percent' && (input.value < 1 || input.value > 10_000)) {
    throw new AppError('INVALID_VALUE', 'Persentase promo 1–10000 bps.');
  }
  if (input.type === 'fixed' && input.value < 1) {
    throw new AppError('INVALID_VALUE', 'Nominal promo tidak valid.');
  }
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
        code,
        name,
        description: input.description?.trim() || null,
        type: input.type,
        value: Math.round(input.value),
        minSpend: Math.max(0, Math.round(input.minSpend)),
        maxDiscount: input.maxDiscount ? Math.max(0, Math.round(input.maxDiscount)) : null,
        maxUses: input.maxUses ?? null,
        validFrom,
        validTo,
        appliesTo: input.appliesTo,
        memberOnly: input.memberOnly ?? false,
        active: input.active ?? true,
        updatedAt: now,
      };
      if (input.id) {
        const [updated] = await tx
          .update(promotions)
          .set(values)
          .where(eq(promotions.id, input.id))
          .returning();
        if (!updated) throw new AppError('PROMO_NOT_FOUND', 'Promosi tidak ditemukan.');
        await audit(tx, {
          staffId,
          action: 'promotion.updated',
          entityType: 'promotion',
          entityId: updated.id,
          detail: { code, name },
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
        detail: { code, name },
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
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [promo] = await tx
      .select()
      .from(promotions)
      .where(eq(promotions.id, promotionId))
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
