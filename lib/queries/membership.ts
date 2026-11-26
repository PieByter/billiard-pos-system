import { asc, desc, eq, ilike, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { memberTiers, members, promotions } from '@/lib/db/schema';
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
    active: row.member.active,
    consent: row.member.consent,
    note: row.member.note,
    createdAt: row.member.createdAt.toISOString(),
  };
}

export async function getMemberAdminData(): Promise<MemberAdminData> {
  const db = await getDb();
  const [tierRows, memberRows] = await Promise.all([
    db.select().from(memberTiers).orderBy(asc(memberTiers.sortOrder)),
    db
      .select({ member: members, tierName: memberTiers.name })
      .from(members)
      .leftJoin(memberTiers, eq(members.tierId, memberTiers.id))
      .orderBy(desc(members.totalSpend), asc(members.name)),
  ]);
  return {
    tiers: tierRows.map(
      (tier): MemberTierView => ({
        id: tier.id,
        name: tier.name,
        minSpend: tier.minSpend,
        discountBps: tier.discountBps,
        pointsMultiplierBps: tier.pointsMultiplierBps,
        active: tier.active,
        sortOrder: tier.sortOrder,
      }),
    ),
    members: memberRows.map(mapMember),
  };
}

export async function searchMembers(term: string): Promise<MemberView[]> {
  const db = await getDb();
  const query = term.trim();
  const rows = await db
    .select({ member: members, tierName: memberTiers.name })
    .from(members)
    .leftJoin(memberTiers, eq(members.tierId, memberTiers.id))
    .where(
      query
        ? or(
            ilike(members.name, `%${query}%`),
            ilike(members.phone, `%${query}%`),
            ilike(members.code, `%${query}%`),
          )
        : undefined,
    )
    .orderBy(asc(members.name))
    .limit(20);
  return rows.map(mapMember);
}

export async function getPromotionsAdminData(): Promise<PromotionsAdminData> {
  const db = await getDb();
  const rows = await db.select().from(promotions).orderBy(desc(promotions.createdAt));
  return {
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
        active: promo.active,
      }),
    ),
  };
}
