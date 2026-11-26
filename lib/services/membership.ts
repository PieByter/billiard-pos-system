import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import {
  billSplits,
  bills,
  cashMovements,
  loyaltyLedger,
  memberDeposits,
  memberTiers,
  members,
  shifts,
  vouchers,
  type Bill,
  type Member,
  type MemberTier,
} from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { memberCode, randomCode } from '@/lib/ids';
import { getActiveOutletId } from '@/lib/outlet';
import { audit } from './audit';
import { recalcBillTotals } from './bill';

export const POINT_VALUE_RUPIAH = 100;

async function hasSplits(tx: DbTransaction, billId: string) {
  const [row] = await tx
    .select({ id: billSplits.id })
    .from(billSplits)
    .where(eq(billSplits.billId, billId))
    .limit(1);
  return Boolean(row);
}

export type MemberTierInput = {
  id?: string;
  name: string;
  minSpend: number;
  discountBps: number;
  pointsMultiplierBps: number;
  benefits?: string | null;
  active?: boolean;
  sortOrder?: number;
};

export async function saveMemberTier(staffId: string, input: MemberTierInput) {
  const name = input.name.trim();
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama tier wajib diisi.');
  if (input.minSpend < 0 || input.discountBps < 0 || input.discountBps > 10_000) {
    throw new AppError('INVALID_TIER', 'Nilai tier tidak valid.');
  }
  if (input.pointsMultiplierBps < 1 || input.pointsMultiplierBps > 100_000) {
    throw new AppError('INVALID_MULTIPLIER', 'Multiplier poin tidak valid.');
  }
  const outletId = await getActiveOutletId();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    if (input.id) {
      const [updated] = await tx
        .update(memberTiers)
        .set({
          name,
          minSpend: input.minSpend,
          discountBps: input.discountBps,
          pointsMultiplierBps: input.pointsMultiplierBps,
          benefits: input.benefits?.trim() || null,
          active: input.active ?? true,
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        })
        .where(and(eq(memberTiers.id, input.id), eq(memberTiers.outletId, outletId)))
        .returning();
      if (!updated) throw new AppError('TIER_NOT_FOUND', 'Tier tidak ditemukan.');
      await audit(tx, {
        staffId,
        action: 'member_tier.updated',
        entityType: 'member_tier',
        entityId: updated.id,
        detail: { name, discountBps: input.discountBps },
        at: now,
      });
      return { id: updated.id };
    }
    const [created] = await tx
      .insert(memberTiers)
      .values({
        outletId,
        name,
        minSpend: input.minSpend,
        discountBps: input.discountBps,
        pointsMultiplierBps: input.pointsMultiplierBps,
        benefits: input.benefits?.trim() || null,
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? 99,
      })
      .returning();
    await audit(tx, {
      staffId,
      action: 'member_tier.created',
      entityType: 'member_tier',
      entityId: created.id,
      detail: { name, discountBps: input.discountBps },
      at: now,
    });
    return { id: created.id };
  });
}

export type MemberInput = {
  id?: string;
  name: string;
  phone: string;
  email?: string | null;
  note?: string | null;
  consent?: boolean;
  notifyEmail?: boolean;
  notifyWhatsapp?: boolean;
  active?: boolean;
};

async function tierForSpend(
  tx: DbTransaction,
  spend: number,
  outletId: string,
): Promise<MemberTier | null> {
  const [tier] = await tx
    .select()
    .from(memberTiers)
    .where(
      and(
        eq(memberTiers.active, true),
        eq(memberTiers.minSpend, spend),
        eq(memberTiers.outletId, outletId),
      ),
    )
    .limit(1);
  if (tier) return tier;
  const tiers = await tx
    .select()
    .from(memberTiers)
    .where(and(eq(memberTiers.active, true), eq(memberTiers.outletId, outletId)))
    .orderBy(desc(memberTiers.minSpend));
  return tiers.find((entry) => entry.minSpend <= spend) ?? null;
}

export async function saveMember(staffId: string, input: MemberInput) {
  const name = input.name.trim();
  const phone = input.phone.trim().replace(/\s+/g, '');
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama member wajib diisi.');
  if (phone.length < 6) throw new AppError('INVALID_PHONE', 'Nomor telepon member tidak valid.');
  const outletId = await getActiveOutletId();

  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      if (input.id) {
        const [target] = await tx
          .select()
          .from(members)
          .where(and(eq(members.id, input.id), eq(members.outletId, outletId)))
          .limit(1);
        if (!target) throw new AppError('MEMBER_NOT_FOUND', 'Member tidak ditemukan.');
        const [duplicate] = await tx
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.phone, phone), ne(members.id, target.id)))
          .limit(1);
        if (duplicate) throw new AppError('PHONE_TAKEN', 'Nomor telepon sudah dipakai member lain.');
        const [updated] = await tx
          .update(members)
          .set({
            name,
            phone,
            email: input.email?.trim() || null,
            note: input.note?.trim() || null,
            consent: input.consent ?? target.consent,
            notifyEmail: input.notifyEmail ?? target.notifyEmail,
            notifyWhatsapp: input.notifyWhatsapp ?? target.notifyWhatsapp,
            active: input.active ?? target.active,
            updatedAt: now,
          })
          .where(eq(members.id, target.id))
          .returning();
        await audit(tx, {
          staffId,
          action: 'member.updated',
          entityType: 'member',
          entityId: updated.id,
          detail: { code: updated.code, name, phone },
          at: now,
        });
        return { id: updated.id, code: updated.code };
      }

      const [duplicate] = await tx
        .select({ id: members.id })
        .from(members)
        .where(eq(members.phone, phone))
        .limit(1);
      if (duplicate) throw new AppError('PHONE_TAKEN', 'Nomor telepon sudah dipakai member lain.');
      const tier = await tierForSpend(tx, 0, outletId);
      let created: Member | null = null;
      for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
        const [row] = await tx
          .insert(members)
          .values({
            outletId,
            code: memberCode(),
            name,
            phone,
            email: input.email?.trim() || null,
            note: input.note?.trim() || null,
            consent: input.consent ?? false,
            notifyEmail: input.notifyEmail ?? true,
            notifyWhatsapp: input.notifyWhatsapp ?? true,
            active: input.active ?? true,
            tierId: tier?.id ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning();
        created = row ?? null;
      }
      if (!created) throw new AppError('MEMBER_CODE', 'Gagal membuat kode member.');
      await audit(tx, {
        staffId,
        action: 'member.created',
        entityType: 'member',
        entityId: created.id,
        detail: { code: created.code, name, phone },
        at: now,
      });
      return { id: created.id, code: created.code };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('PHONE_TAKEN', 'Nomor telepon sudah dipakai member lain.');
    }
    throw error;
  }
}

export async function attachMemberToBill(staffId: string, billId: string, memberId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    if (await hasSplits(tx, billId)) {
      throw new AppError('BILL_SPLIT_LOCKED', 'Member tidak bisa diubah setelah split.');
    }
    const [member] = await tx
      .select({ member: members, tier: memberTiers })
      .from(members)
      .leftJoin(memberTiers, eq(members.tierId, memberTiers.id))
      .where(and(eq(members.id, memberId), eq(members.active, true)))
      .limit(1);
    if (!member || member.member.outletId !== bill.outletId) {
      throw new AppError('MEMBER_NOT_FOUND', 'Member tidak ditemukan di outlet ini.');
    }
    if (
      bill.memberId &&
      bill.memberId !== member.member.id &&
      (bill.pointsRedeemed > 0 || bill.voucherId)
    ) {
      throw new AppError(
        'BILL_BENEFIT_LOCKED',
        'Batalkan tukar poin/voucher sebelum mengganti member bill.',
      );
    }

    await tx.update(bills).set({ memberId: member.member.id }).where(eq(bills.id, billId));
    const updated = await recalcBillTotals(tx, billId, now);
    await audit(tx, {
      staffId,
      action: 'bill.member_attached',
      entityType: 'bill',
      entityId: billId,
      detail: {
        billNumber: bill.billNumber,
        memberCode: member.member.code,
        memberName: member.member.name,
        tier: member.tier?.name ?? null,
        discount: updated.bill.memberDiscountAmount,
      },
      at: now,
    });
    return {
      memberId: member.member.id,
      memberName: member.member.name,
      tierName: member.tier?.name ?? null,
      discount: updated.bill.memberDiscountAmount,
      total: updated.total,
    };
  });
}

export async function detachMemberFromBill(staffId: string, billId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    if (await hasSplits(tx, billId)) {
      throw new AppError('BILL_SPLIT_LOCKED', 'Member tidak bisa diubah setelah split.');
    }
    await restoreBillBenefits(tx, bill, staffId, now);
    await tx
      .update(bills)
      .set({
        memberId: null,
        memberDiscountAmount: 0,
        pointsRedeemed: 0,
        pointsDiscountAmount: 0,
        voucherId: null,
        voucherCode: null,
        voucherDiscountAmount: 0,
      })
      .where(eq(bills.id, billId));
    const updated = await recalcBillTotals(tx, billId, now);
    await audit(tx, {
      staffId,
      action: 'bill.member_detached',
      entityType: 'bill',
      entityId: billId,
      detail: { billNumber: bill.billNumber, memberId: bill.memberId },
      at: now,
    });
    return { total: updated.total };
  });
}

async function restoreBillBenefits(
  tx: DbTransaction,
  bill: Bill,
  staffId: string | null,
  now: Date,
) {
  if (bill.pointsRedeemed > 0 && bill.memberId) {
    await tx
      .update(members)
      .set({ points: sql`${members.points} + ${bill.pointsRedeemed}`, updatedAt: now })
      .where(eq(members.id, bill.memberId));
    await tx.insert(loyaltyLedger).values({
      memberId: bill.memberId,
      billId: bill.id,
      type: 'adjust',
      points: bill.pointsRedeemed,
      note: `Poin dikembalikan dari ${bill.billNumber}`,
      createdBy: staffId,
      createdAt: now,
    });
  }
  if (bill.voucherId) {
    await tx
      .update(vouchers)
      .set({ usedAt: null, billId: null })
      .where(eq(vouchers.id, bill.voucherId));
  }
}

export async function restoreMemberBenefitsForBill(
  tx: DbTransaction,
  billId: string,
  staffId: string | null,
) {
  const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
  if (!bill) return;
  const now = await dbNow(tx);
  await restoreBillBenefits(tx, bill, staffId, now);
  await tx
    .update(bills)
    .set({
      pointsRedeemed: 0,
      pointsDiscountAmount: 0,
      voucherId: null,
      voucherCode: null,
      voucherDiscountAmount: 0,
    })
    .where(eq(bills.id, billId));
}

export async function redeemMemberPoints(staffId: string, billId: string, pointsRaw: number) {
  const points = Math.round(Number(pointsRaw));
  if (!Number.isFinite(points) || points <= 0) {
    throw new AppError('INVALID_POINTS', 'Jumlah poin tidak valid.');
  }
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    if (await hasSplits(tx, billId)) {
      throw new AppError('BILL_SPLIT_LOCKED', 'Poin tidak bisa ditukar setelah split.');
    }
    if (!bill.memberId) throw new AppError('MEMBER_REQUIRED', 'Pasang member ke bill terlebih dahulu.');
    const [member] = await tx.select().from(members).where(eq(members.id, bill.memberId)).limit(1);
    if (!member || !member.active) throw new AppError('MEMBER_NOT_FOUND', 'Member tidak aktif.');
    if (points > member.points) {
      throw new AppError('POINTS_NOT_ENOUGH', `Poin member hanya ${member.points}.`);
    }
    const remaining =
      bill.subtotal -
      bill.discountAmount -
      bill.memberDiscountAmount -
      bill.promoDiscountAmount -
      bill.pointsDiscountAmount -
      bill.voucherDiscountAmount;
    const value = points * POINT_VALUE_RUPIAH;
    if (value > remaining) {
      throw new AppError(
        'POINTS_TOO_MANY',
        `Maksimal tukar poin untuk bill ini ${Math.floor(Math.max(0, remaining) / POINT_VALUE_RUPIAH)} poin.`,
      );
    }
    await tx
      .update(members)
      .set({ points: member.points - points, updatedAt: now })
      .where(eq(members.id, member.id));
    await tx.insert(loyaltyLedger).values({
      memberId: member.id,
      billId,
      type: 'redeem',
      points: -points,
      note: `Tukar ${points} poin di ${bill.billNumber}`,
      createdBy: staffId,
      createdAt: now,
    });
    await tx
      .update(bills)
      .set({
        pointsRedeemed: bill.pointsRedeemed + points,
        pointsDiscountAmount: bill.pointsDiscountAmount + value,
      })
      .where(eq(bills.id, billId));
    const updated = await recalcBillTotals(tx, billId, now);
    await audit(tx, {
      staffId,
      action: 'bill.points_redeemed',
      entityType: 'bill',
      entityId: billId,
      detail: { billNumber: bill.billNumber, points, value, total: updated.total },
      at: now,
    });
    return { points, value, total: updated.total, pointsLeft: member.points - points };
  });
}

export async function cancelPointsRedemption(staffId: string, billId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    if (await hasSplits(tx, billId)) {
      throw new AppError('BILL_SPLIT_LOCKED', 'Poin tidak bisa diubah setelah split.');
    }
    if (!bill.memberId || bill.pointsRedeemed <= 0) {
      throw new AppError('NO_POINTS', 'Bill ini tidak memakai poin.');
    }
    await restoreBillBenefits(tx, bill, staffId, now);
    await tx
      .update(bills)
      .set({ pointsRedeemed: 0, pointsDiscountAmount: 0 })
      .where(eq(bills.id, billId));
    const updated = await recalcBillTotals(tx, billId, now);
    return { total: updated.total };
  });
}

export type VoucherInput = {
  memberId?: string | null;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  minSpend?: number;
  expiresAt?: string | null;
  code?: string | null;
};

export async function issueVoucher(staffId: string, input: VoucherInput) {
  const outletId = await getActiveOutletId();
  const name = input.name.trim();
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama voucher wajib diisi.');
  if (input.type === 'percent' && (input.value < 1 || input.value > 10_000)) {
    throw new AppError('INVALID_VALUE', 'Persentase voucher 1-10000 bps.');
  }
  if (input.type === 'fixed' && input.value < 1) {
    throw new AppError('INVALID_VALUE', 'Nominal voucher tidak valid.');
  }
  const code = (input.code?.trim() || `VCH-${randomCode(6)}`).toUpperCase();
  if (!/^[A-Z0-9-]{4,24}$/.test(code)) {
    throw new AppError('INVALID_CODE', 'Kode voucher 4-24 karakter.');
  }
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      const [created] = await tx
        .insert(vouchers)
        .values({
          outletId,
          code,
          memberId: input.memberId || null,
          name,
          type: input.type,
          value: Math.round(input.value),
          minSpend: Math.max(0, Math.round(input.minSpend ?? 0)),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdBy: staffId,
          createdAt: now,
        })
        .returning();
      await audit(tx, {
        staffId,
        action: 'voucher.issued',
        entityType: 'voucher',
        entityId: created.id,
        detail: { code: created.code, memberId: created.memberId, value: created.value },
        at: now,
      });
      return { id: created.id, code: created.code };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError('CODE_TAKEN', 'Kode voucher sudah dipakai.');
    throw error;
  }
}

export async function applyVoucherToBill(staffId: string, billId: string, codeRaw: string) {
  const code = codeRaw.trim().toUpperCase();
  if (!code) throw new AppError('INVALID_CODE', 'Kode voucher wajib diisi.');
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    if (await hasSplits(tx, billId)) {
      throw new AppError('BILL_SPLIT_LOCKED', 'Voucher tidak bisa diubah setelah split.');
    }
    const [voucher] = await tx
      .select()
      .from(vouchers)
      .where(and(eq(vouchers.code, code), eq(vouchers.outletId, bill.outletId)))
      .limit(1);
    if (!voucher || !voucher.active || voucher.usedAt) {
      throw new AppError('VOUCHER_NOT_FOUND', 'Voucher tidak aktif atau sudah dipakai.');
    }
    if (voucher.expiresAt && voucher.expiresAt < now) {
      throw new AppError('VOUCHER_EXPIRED', 'Voucher sudah kedaluwarsa.');
    }
    if (voucher.memberId && voucher.memberId !== bill.memberId) {
      throw new AppError('VOUCHER_MEMBER', 'Voucher ini khusus untuk member lain.');
    }
    if (bill.subtotal < voucher.minSpend) {
      throw new AppError('VOUCHER_MIN_SPEND', `Minimal belanja voucher ${voucher.minSpend}.`);
    }
    const base =
      bill.subtotal -
      bill.discountAmount -
      bill.memberDiscountAmount -
      bill.promoDiscountAmount -
      bill.pointsDiscountAmount -
      (bill.voucherId === voucher.id ? 0 : bill.voucherDiscountAmount);
    const rawDiscount =
      voucher.type === 'percent'
        ? Math.round((Math.max(0, base) * voucher.value) / 10_000)
        : voucher.value;
    const discount = Math.min(Math.max(0, base), rawDiscount);
    if (discount <= 0) throw new AppError('VOUCHER_ZERO', 'Voucher tidak menghasilkan diskon.');

    if (bill.voucherId) {
      await tx
        .update(vouchers)
        .set({ usedAt: null, billId: null })
        .where(eq(vouchers.id, bill.voucherId));
    }
    await tx
      .update(vouchers)
      .set({ usedAt: now, billId })
      .where(eq(vouchers.id, voucher.id));
    await tx
      .update(bills)
      .set({
        voucherId: voucher.id,
        voucherCode: voucher.code,
        voucherDiscountAmount: discount,
      })
      .where(eq(bills.id, billId));
    const updated = await recalcBillTotals(tx, billId, now);
    await audit(tx, {
      staffId,
      action: 'bill.voucher_applied',
      entityType: 'bill',
      entityId: billId,
      detail: { billNumber: bill.billNumber, code: voucher.code, discount, total: updated.total },
      at: now,
    });
    return { code: voucher.code, discount, total: updated.total };
  });
}

export async function cancelVoucherFromBill(staffId: string, billId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill tidak ditemukan.');
    if (bill.status !== 'open') throw new AppError('BILL_NOT_OPEN', 'Bill sudah ditutup.');
    if (await hasSplits(tx, billId)) {
      throw new AppError('BILL_SPLIT_LOCKED', 'Voucher tidak bisa diubah setelah split.');
    }
    if (bill.voucherId) {
      await tx
        .update(vouchers)
        .set({ usedAt: null, billId: null })
        .where(eq(vouchers.id, bill.voucherId));
    }
    await tx
      .update(bills)
      .set({ voucherId: null, voucherCode: null, voucherDiscountAmount: 0 })
      .where(eq(bills.id, billId));
    const updated = await recalcBillTotals(tx, billId, now);
    await audit(tx, {
      staffId,
      action: 'bill.voucher_removed',
      entityType: 'bill',
      entityId: billId,
      detail: { billNumber: bill.billNumber, code: bill.voucherCode },
      at: now,
    });
    return { total: updated.total };
  });
}

export async function topUpMemberBalance(
  staffId: string,
  input: {
    memberId: string;
    amount: number;
    method: 'cash' | 'qris' | 'transfer' | 'edc';
    note?: string | null;
  },
) {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('INVALID_AMOUNT', 'Nominal top up tidak valid.');
  }
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [member] = await tx.select().from(members).where(eq(members.id, input.memberId)).limit(1);
    if (!member || !member.active) throw new AppError('MEMBER_NOT_FOUND', 'Member tidak ditemukan.');
    const [updated] = await tx
      .update(members)
      .set({ balance: member.balance + amount, updatedAt: now })
      .where(eq(members.id, member.id))
      .returning();
    await tx.insert(memberDeposits).values({
      outletId: member.outletId,
      memberId: member.id,
      type: 'topup',
      method: input.method,
      amount,
      note: input.note?.trim() || null,
      createdBy: staffId,
      createdAt: now,
    });
    if (input.method === 'cash') {
      const [shift] = await tx
        .select()
        .from(shifts)
        .where(and(eq(shifts.status, 'open'), eq(shifts.outletId, member.outletId)))
        .limit(1);
      if (shift) {
        await tx.insert(cashMovements).values({
          outletId: member.outletId,
          shiftId: shift.id,
          type: 'adjustment',
          amount,
          reason: `Top up saldo ${member.code} (${member.name})`,
          createdBy: staffId,
          createdAt: now,
        });
      }
    }
    await audit(tx, {
      staffId,
      action: 'member.balance_topup',
      entityType: 'member',
      entityId: member.id,
      detail: { amount, method: input.method, balance: updated.balance },
      at: now,
    });
    return { balance: updated.balance };
  });
}

/** Dipakai payment service: potong saldo member secara atomik. */
export async function consumeMemberBalance(
  tx: DbTransaction,
  bill: Bill,
  amount: number,
  staffId: string | null,
  now: Date,
) {
  if (!bill.memberId) throw new AppError('MEMBER_REQUIRED', 'Pembayaran saldo butuh member.');
  const [member] = await tx.select().from(members).where(eq(members.id, bill.memberId)).limit(1);
  if (!member || !member.active) throw new AppError('MEMBER_NOT_FOUND', 'Member tidak aktif.');
  if (member.balance < amount) {
    throw new AppError(
      'BALANCE_NOT_ENOUGH',
      `Saldo ${member.name} hanya ${member.balance}, kurang ${amount - member.balance}.`,
    );
  }
  const [updated] = await tx
    .update(members)
    .set({ balance: member.balance - amount, updatedAt: now })
    .where(eq(members.id, member.id))
    .returning();
  await tx.insert(memberDeposits).values({
    outletId: bill.outletId,
    memberId: member.id,
    type: 'usage',
    method: 'balance',
    amount: -amount,
    billId: bill.id,
    note: `Bayar ${bill.billNumber}`,
    createdBy: staffId,
    createdAt: now,
  });
  return { memberId: member.id, memberName: member.name, balance: updated.balance };
}

/** Refund ke saldo member (bukan tunai). */
export async function refundToMemberBalance(
  tx: DbTransaction,
  bill: Bill,
  amount: number,
  staffId: string | null,
  now: Date,
) {
  if (!bill.memberId) return null;
  const [member] = await tx.select().from(members).where(eq(members.id, bill.memberId)).limit(1);
  if (!member) return null;
  const [updated] = await tx
    .update(members)
    .set({ balance: member.balance + amount, updatedAt: now })
    .where(eq(members.id, member.id))
    .returning();
  await tx.insert(memberDeposits).values({
    outletId: bill.outletId,
    memberId: member.id,
    type: 'refund',
    method: 'balance',
    amount,
    billId: bill.id,
    note: `Refund ${bill.billNumber}`,
    createdBy: staffId,
    createdAt: now,
  });
  return { balance: updated.balance };
}

export async function getMemberBenefitsForBill(billId: string) {
  const db = await getDb();
  const [bill] = await db.select().from(bills).where(eq(bills.id, billId)).limit(1);
  if (!bill?.memberId) return null;
  const [memberRow] = await db
    .select({ member: members, tier: memberTiers })
    .from(members)
    .leftJoin(memberTiers, eq(members.tierId, memberTiers.id))
    .where(eq(members.id, bill.memberId))
    .limit(1);
  if (!memberRow) return null;
  const voucherRows = await db
    .select()
    .from(vouchers)
    .where(
      and(
        eq(vouchers.memberId, memberRow.member.id),
        eq(vouchers.outletId, bill.outletId),
        eq(vouchers.active, true),
        sql`${vouchers.usedAt} is null`,
      ),
    )
    .orderBy(desc(vouchers.createdAt));
  const remaining =
    bill.subtotal -
    bill.discountAmount -
    bill.memberDiscountAmount -
    bill.promoDiscountAmount -
    bill.voucherDiscountAmount;
  const maxRedeemablePoints = Math.min(
    memberRow.member.points,
    Math.floor(Math.max(0, remaining) / POINT_VALUE_RUPIAH),
  );
  return {
    memberId: memberRow.member.id,
    memberName: memberRow.member.name,
    memberCode: memberRow.member.code,
    tierName: memberRow.tier?.name ?? null,
    points: memberRow.member.points,
    balance: memberRow.member.balance,
    maxRedeemablePoints,
    maxRedeemableValue: maxRedeemablePoints * POINT_VALUE_RUPIAH,
    vouchers: voucherRows.map((voucher) => ({
      id: voucher.id,
      code: voucher.code,
      memberId: voucher.memberId,
      memberName: memberRow.member.name,
      name: voucher.name,
      type: voucher.type,
      value: voucher.value,
      minSpend: voucher.minSpend,
      expiresAt: voucher.expiresAt?.toISOString() ?? null,
      usedAt: voucher.usedAt?.toISOString() ?? null,
      billId: voucher.billId,
      active: voucher.active,
      createdAt: voucher.createdAt.toISOString(),
    })),
  };
}

export async function awardMembershipForBill(
  tx: DbTransaction,
  billId: string,
  staffId: string | null,
) {
  const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).limit(1);
  if (!bill?.memberId) return null;

  const [existing] = await tx
    .select({ id: loyaltyLedger.id })
    .from(loyaltyLedger)
    .where(and(eq(loyaltyLedger.billId, billId), eq(loyaltyLedger.type, 'earn')))
    .limit(1);
  if (existing) return null;

  const [memberRow] = await tx
    .select({ member: members, tier: memberTiers })
    .from(members)
    .leftJoin(memberTiers, eq(members.tierId, memberTiers.id))
    .where(and(eq(members.id, bill.memberId), eq(members.active, true)))
    .limit(1);
  if (!memberRow) return null;

  const netBase = Math.max(
    0,
    bill.subtotal -
      bill.discountAmount -
      bill.memberDiscountAmount -
      bill.promoDiscountAmount -
      bill.pointsDiscountAmount -
      bill.voucherDiscountAmount,
  );
  const multiplier = memberRow.tier?.pointsMultiplierBps ?? 10_000;
  const points = Math.floor((netBase / 1000) * (multiplier / 10_000));
  if (points <= 0) return null;

  const now = await dbNow(tx);
  const newSpend = memberRow.member.totalSpend + bill.total;
  const nextTier = await tierForSpend(tx, newSpend, bill.outletId);
  await tx.insert(loyaltyLedger).values({
    memberId: memberRow.member.id,
    billId,
    type: 'earn',
    points,
    note: `Earn dari ${bill.billNumber}`,
    createdBy: staffId,
    createdAt: now,
  });
  await tx
    .update(members)
    .set({
      points: memberRow.member.points + points,
      totalSpend: newSpend,
      tierId: nextTier?.id ?? memberRow.member.tierId,
      updatedAt: now,
    })
    .where(eq(members.id, memberRow.member.id));
  await audit(tx, {
    staffId,
    action: 'member.points_earned',
    entityType: 'member',
    entityId: memberRow.member.id,
    detail: { billNumber: bill.billNumber, points, newSpend, tier: nextTier?.name ?? null },
    at: now,
  });
  return { points, memberId: memberRow.member.id };
}
