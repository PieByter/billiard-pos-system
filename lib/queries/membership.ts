import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  memberDeposits,
  memberTiers,
  members,
  menuItems,
  promotions,
  vouchers,
} from '@/lib/db/schema';
import { getActiveOutletId } from '@/lib/outlet';
import type {
  MemberAdminData,
  MemberTierView,
  MemberView,
  PromotionView,
  PromotionsAdminData,
} from '@/lib/types';

function mapMember(row: {
  member: typeof members.$inferSelect;
  tierName: string | null;
}): MemberView {
  return {
    id: row.member.id,
    code: row.member.code,
    name: row.member.name,
    phone: row.member.phone,
    email: row.member.email,
    tierId: row.member.tierId,
    tierName: row.tierName,
    points: row.member.points,
    totalSpend: row.member.totalSpend,
    balance: row.member.balance,
    active: row.member.active,
    consent: row.member.consent,
    notifyEmail: row.member.notifyEmail,
    notifyWhatsapp: row.member.notifyWhatsapp,
    note: row.member.note,
    createdAt: row.member.createdAt.toISOString(),
  };
}

export async function getMemberAdminData(): Promise<MemberAdminData> {
  const db = await getDb();
  const outletId = await getActiveOutletId();
  const [tierRows, memberRows, voucherRows, depositRows] = await Promise.all([
    db
      .select()
      .from(memberTiers)
      .where(eq(memberTiers.outletId, outletId))
      .orderBy(asc(memberTiers.sortOrder)),
    db
      .select({ member: members, tierName: memberTiers.name })
      .from(members)
      .leftJoin(memberTiers, eq(members.tierId, memberTiers.id))
      .where(eq(members.outletId, outletId))
      .orderBy(desc(members.totalSpend), asc(members.name)),
    db
      .select({ voucher: vouchers, memberName: members.name })
      .from(vouchers)
      .leftJoin(members, eq(vouchers.memberId, members.id))
      .where(eq(vouchers.outletId, outletId))
      .orderBy(desc(vouchers.createdAt))
      .limit(100),
    db
      .select({ deposit: memberDeposits, memberName: members.name })
      .from(memberDeposits)
      .innerJoin(members, eq(memberDeposits.memberId, members.id))
      .where(eq(memberDeposits.outletId, outletId))
      .orderBy(desc(memberDeposits.createdAt))
      .limit(100),
  ]);
  return {
    tiers: tierRows.map(
      (tier): MemberTierView => ({
        id: tier.id,
        name: tier.name,
        minSpend: tier.minSpend,
        discountBps: tier.discountBps,
        pointsMultiplierBps: tier.pointsMultiplierBps,
        benefits: tier.benefits,
        active: tier.active,
        sortOrder: tier.sortOrder,
      }),
    ),
    members: memberRows.map(mapMember),
    vouchers: voucherRows.map((row) => ({
      id: row.voucher.id,
      code: row.voucher.code,
      memberId: row.voucher.memberId,
      memberName: row.memberName,
      name: row.voucher.name,
      type: row.voucher.type,
      value: row.voucher.value,
      minSpend: row.voucher.minSpend,
      expiresAt: row.voucher.expiresAt?.toISOString() ?? null,
      usedAt: row.voucher.usedAt?.toISOString() ?? null,
      billId: row.voucher.billId,
      active: row.voucher.active,
      createdAt: row.voucher.createdAt.toISOString(),
    })),
    deposits: depositRows.map((row) => ({
      id: row.deposit.id,
      memberId: row.deposit.memberId,
      type: row.deposit.type,
      method: row.deposit.method,
      amount: row.deposit.amount,
      note: row.deposit.note,
      createdAt: row.deposit.createdAt.toISOString(),
    })),
  };
}

export async function searchMembers(term: string): Promise<MemberView[]> {
  const db = await getDb();
  const outletId = await getActiveOutletId();
  const query = term.trim();
  const rows = await db
    .select({ member: members, tierName: memberTiers.name })
    .from(members)
    .leftJoin(memberTiers, eq(members.tierId, memberTiers.id))
    .where(
      and(
        eq(members.outletId, outletId),
        query
          ? or(
              ilike(members.name, `%${query}%`),
              ilike(members.phone, `%${query}%`),
              ilike(members.code, `%${query}%`),
            )
          : undefined,
      ),
    )
    .orderBy(asc(members.name))
    .limit(20);
  return rows.map(mapMember);
}

export async function getPromotionsAdminData(): Promise<PromotionsAdminData> {
  const db = await getDb();
  const outletId = await getActiveOutletId();
  const [rows, menuRows] = await Promise.all([
    db
      .select()
      .from(promotions)
      .where(eq(promotions.outletId, outletId))
      .orderBy(desc(promotions.createdAt)),
    db
      .select({ id: menuItems.id, name: menuItems.name, price: menuItems.price })
      .from(menuItems)
      .where(eq(menuItems.outletId, outletId))
      .orderBy(asc(menuItems.name)),
  ]);
  return {
    menuItems: menuRows,
    promotions: rows.map(
      (promo): PromotionView => ({
        id: promo.id,
        code: promo.code,
        name: promo.name,
        description: promo.description,
        type: promo.type,
        value: promo.value,
        minSpend: promo.minSpend,
        maxDiscount: promo.maxDiscount,
        maxUses: promo.maxUses,
        usesCount: promo.usesCount,
        validFrom: promo.validFrom?.toISOString() ?? null,
        validTo: promo.validTo?.toISOString() ?? null,
        appliesTo: promo.appliesTo,
        memberOnly: promo.memberOnly,
        stackable: promo.stackable,
        autoApply: promo.autoApply,
        daysOfWeek: promo.daysOfWeek,
        startMinute: promo.startMinute,
        endMinute: promo.endMinute,
        maxUsesPerMember: promo.maxUsesPerMember,
        bundlePrice: promo.bundlePrice,
        bundleItemIds: promo.bundleItemIds,
        active: promo.active,
      }),
    ),
  };
}
