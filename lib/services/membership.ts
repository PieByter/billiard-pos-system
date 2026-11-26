import { and, desc, eq, ne } from 'drizzle-orm';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import {
  billSplits,
  bills,
  loyaltyLedger,
  memberTiers,
  members,
  type Member,
  type MemberTier,
} from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { memberCode } from '@/lib/ids';
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

export type MemberTierInput = {
  id?: string;
  name: string;
  minSpend: number;
  discountBps: number;
  pointsMultiplierBps: number;
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
          active: input.active ?? true,
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        })
        .where(eq(memberTiers.id, input.id))
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
        name,
        minSpend: input.minSpend,
        discountBps: input.discountBps,
        pointsMultiplierBps: input.pointsMultiplierBps,
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
  active?: boolean;
};

async function tierForSpend(tx: DbTransaction, spend: number): Promise<MemberTier | null> {
  const [tier] = await tx
    .select()
    .from(memberTiers)
    .where(and(eq(memberTiers.active, true), eq(memberTiers.minSpend, spend)))
    .limit(1);
  if (tier) return tier;
  const tiers = await tx
    .select()
    .from(memberTiers)
    .where(eq(memberTiers.active, true))
    .orderBy(desc(memberTiers.minSpend));
  return tiers.find((entry) => entry.minSpend <= spend) ?? null;
}

export async function saveMember(staffId: string, input: MemberInput) {
  const name = input.name.trim();
  const phone = input.phone.trim().replace(/\s+/g, '');
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama member wajib diisi.');
  if (phone.length < 6) throw new AppError('INVALID_PHONE', 'Nomor telepon member tidak valid.');

  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      if (input.id) {
        const [target] = await tx.select().from(members).where(eq(members.id, input.id)).limit(1);
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
      const tier = await tierForSpend(tx, 0);
      let created: Member | null = null;
      for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
        const [row] = await tx
          .insert(members)
          .values({
            code: memberCode(),
            name,
            phone,
            email: input.email?.trim() || null,
            note: input.note?.trim() || null,
            consent: input.consent ?? false,
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
    if (!member) throw new AppError('MEMBER_NOT_FOUND', 'Member tidak ditemukan.');

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
    await tx
      .update(bills)
      .set({ memberId: null, memberDiscountAmount: 0 })
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
    bill.subtotal - bill.discountAmount - bill.memberDiscountAmount - bill.promoDiscountAmount,
  );
  const multiplier = memberRow.tier?.pointsMultiplierBps ?? 10_000;
  const points = Math.floor((netBase / 1000) * (multiplier / 10_000));
  if (points <= 0) return null;

  const now = await dbNow(tx);
  const newSpend = memberRow.member.totalSpend + bill.total;
  const nextTier = await tierForSpend(tx, newSpend);
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
