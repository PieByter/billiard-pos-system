import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { DbTransaction } from '@/lib/db';
import {
  billPromotions,
  billiardSessions,
  bills,
  orderItems,
  orders,
  promotions,
  type Bill,
  type Promotion,
} from '@/lib/db/schema';

export type PromotionWindow = {
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
};

/** Senin = 1 ... Minggu = 7, menit sejak 00:00 waktu Jakarta. */
export function jakartaDayMinute(now: Date): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const day = weekdayMap[get('weekday')] ?? 1;
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return { day, minute: hour * 60 + minute };
}

export function promotionWindowMatches(window: PromotionWindow, now: Date): boolean {
  const { day, minute } = jakartaDayMinute(now);
  if (!window.daysOfWeek.includes(day)) return false;
  const start = Math.max(0, Math.min(1440, window.startMinute));
  const end = Math.max(0, Math.min(1440, window.endMinute));
  if (start === end) return true;
  if (start < end) return minute >= start && minute < end;
  // Overnight, contoh 22:00 -> 02:00.
  return minute >= start || minute < end;
}

export function calculatePromotionDiscount(
  promo: Pick<Promotion, 'type' | 'value' | 'maxDiscount' | 'bundlePrice'>,
  base: number,
  bundleBase = 0,
): number {
  if (base <= 0) return 0;
  const raw =
    promo.type === 'percent'
      ? Math.round((base * Math.max(0, promo.value)) / 10_000)
      : promo.type === 'bundle'
        ? Math.max(0, bundleBase - Math.max(0, promo.bundlePrice ?? promo.value))
        : Math.max(0, promo.value);
  const capped = promo.maxDiscount ? Math.min(raw, promo.maxDiscount) : raw;
  return Math.min(base, capped);
}

export async function getPromotionBase(
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

export async function getBundleBase(
  tx: DbTransaction,
  billId: string,
  menuItemIds: string[],
): Promise<{ base: number; complete: boolean }> {
  if (menuItemIds.length === 0) return { base: 0, complete: false };
  const orderRows = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.billId, billId), ne(orders.status, 'cancelled')));
  if (orderRows.length === 0) return { base: 0, complete: false };
  const rows = await tx
    .select()
    .from(orderItems)
    .where(
      and(
        inArray(orderItems.orderId, orderRows.map((order) => order.id)),
        inArray(orderItems.menuItemId, menuItemIds),
      ),
    );
  const present = new Set(rows.map((row) => row.menuItemId));
  const complete = menuItemIds.every((id) => present.has(id));
  const base = rows.reduce((sum, item) => sum + item.priceSnapshot * item.qty, 0);
  return { base, complete };
}

export async function memberPromotionUses(
  tx: DbTransaction,
  memberId: string,
  promotionId: string,
): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(billPromotions)
    .where(
      and(
        eq(billPromotions.promotionId, promotionId),
        sql`${billPromotions.consumedAt} is not null`,
        sql`${billPromotions.billId} in (
          select ${bills.id} from ${bills}
          where ${bills.memberId} = ${memberId}
        )`,
      ),
    );
  return row?.total ?? 0;
}

export async function listBillPromotions(tx: DbTransaction, billId: string) {
  return tx.select().from(billPromotions).where(eq(billPromotions.billId, billId));
}

export async function syncBillPromotionAggregate(tx: DbTransaction, billId: string) {
  const rows = await listBillPromotions(tx, billId);
  const total = rows.reduce((sum, row) => sum + row.discountAmount, 0);
  await tx
    .update(bills)
    .set({
      promoDiscountAmount: total,
      promotionCode: rows.length ? rows.map((row) => row.code).join(' + ') : null,
      promotionId: rows[0]?.promotionId ?? null,
    })
    .where(eq(bills.id, billId));
  return { rows, total };
}

/**
 * Promo happy hour/otomatis dievaluasi ulang setiap kali bill dihitung.
 * Promo yang tidak lagi masuk window akan dilepas; yang masuk akan dipasang.
 */
export async function syncAutoPromotions(
  tx: DbTransaction,
  bill: Bill,
  now: Date,
): Promise<void> {
  if (bill.status !== 'open') return;
  const manualRows = await tx
    .select({ promotionId: billPromotions.promotionId })
    .from(billPromotions)
    .where(and(eq(billPromotions.billId, bill.id), eq(billPromotions.autoApplied, false)));
  if (manualRows.length > 0) {
    const manualPromos = await tx
      .select({ stackable: promotions.stackable })
      .from(promotions)
      .where(inArray(promotions.id, manualRows.map((row) => row.promotionId)));
    if (manualPromos.some((promo) => !promo.stackable)) return;
  }
  const candidates = await tx
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.outletId, bill.outletId),
        eq(promotions.active, true),
        eq(promotions.autoApply, true),
      ),
    );

  const eligible = new Map<string, number>();
  for (const promo of candidates) {
    if (!promotionWindowMatches(promo, now)) continue;
    if (promo.memberOnly && !bill.memberId) continue;
    if (manualRows.length > 0 && !promo.stackable) continue;
    if (promo.validFrom && promo.validFrom > now) continue;
    if (promo.validTo && promo.validTo < now) continue;
    if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) continue;
    if (promo.maxUsesPerMember !== null && bill.memberId) {
      const used = await memberPromotionUses(tx, bill.memberId, promo.id);
      if (used >= promo.maxUsesPerMember) continue;
    }
    const base = await getPromotionBase(tx, bill.id, promo.appliesTo);
    const bundle =
      promo.type === 'bundle'
        ? await getBundleBase(tx, bill.id, promo.bundleItemIds)
        : { base: 0, complete: true };
    if (promo.type === 'bundle' && !bundle.complete) continue;
    const discount = calculatePromotionDiscount(promo, base, bundle.base);
    if (discount > 0) eligible.set(promo.id, discount);
  }

  const existingAuto = await tx
    .select()
    .from(billPromotions)
    .where(and(eq(billPromotions.billId, bill.id), eq(billPromotions.autoApplied, true)));

  for (const row of existingAuto) {
    const next = eligible.get(row.promotionId);
    if (next === undefined) {
      await tx.delete(billPromotions).where(eq(billPromotions.id, row.id));
    } else if (next !== row.discountAmount) {
      await tx
        .update(billPromotions)
        .set({ discountAmount: next })
        .where(eq(billPromotions.id, row.id));
      eligible.delete(row.promotionId);
    } else {
      eligible.delete(row.promotionId);
    }
  }

  for (const [promotionId, discount] of eligible) {
    const promo = candidates.find((entry) => entry.id === promotionId);
    if (!promo) continue;
    await tx
      .insert(billPromotions)
      .values({
        outletId: bill.outletId,
        billId: bill.id,
        promotionId: promo.id,
        code: promo.code,
        name: promo.name,
        discountAmount: discount,
        autoApplied: true,
      })
      .onConflictDoUpdate({
        target: [billPromotions.billId, billPromotions.promotionId],
        set: { discountAmount: discount, autoApplied: true },
      });
  }
}
