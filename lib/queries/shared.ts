import type { Bill, BilliardSession, Order, OrderItem } from '@/lib/db/schema';
import {
  billableElapsedSeconds,
  computeBillTotals,
  computeSessionAmountFromSeconds,
} from '@/lib/billing';
import { VENUE_TIMEZONE } from '@/lib/constants';
import type {
  BillView,
  MenuItemView,
  OrderItemView,
  OrderView,
  RateView,
  SessionView,
  ShiftView,
} from '@/lib/types';
import type { MenuCategory, MenuItem, Shift } from '@/lib/db/schema';

export function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function buildSessionView(session: BilliardSession, now: Date): SessionView {
  const rate = {
    ratePerHour: session.ratePerHour,
    minMinutes: session.minMinutes,
    incrementMinutes: session.incrementMinutes,
  };
  let at: Date;
  if (session.status === 'finished') {
    at = new Date(session.endedAt ?? now);
  } else if (session.status === 'paused') {
    at = new Date(session.pausedAt ?? now);
  } else {
    at = now;
  }
  const baseElapsedSeconds = billableElapsedSeconds(
    session.startedAt,
    at,
    session.pausedSeconds,
  );
  const estimate =
    session.amount ?? computeSessionAmountFromSeconds(baseElapsedSeconds, rate).amount;

  return {
    id: session.id,
    status: session.status,
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: iso(session.endedAt),
    pausedAt: iso(session.pausedAt),
    pausedSeconds: session.pausedSeconds,
    baseElapsedSeconds,
    targetMinutes: session.targetMinutes,
    ratePerHour: session.ratePerHour,
    minMinutes: session.minMinutes,
    incrementMinutes: session.incrementMinutes,
    amount: session.amount,
    estimate,
  };
}

export function buildOrderView(order: Order, items: OrderItem[]): OrderView {
  const viewItems: OrderItemView[] = items.map((item) => ({
    id: item.id,
    menuItemId: item.menuItemId,
    name: item.nameSnapshot,
    qty: item.qty,
    price: item.priceSnapshot,
    note: item.note,
    station: item.station,
    done: Boolean(item.doneAt),
  }));
  const subtotal = viewItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  return {
    id: order.id,
    number: order.orderNumber,
    source: order.source,
    status: order.status,
    createdAt: new Date(order.createdAt).toISOString(),
    acceptedAt: iso(order.acceptedAt),
    preparingAt: iso(order.preparingAt),
    readyAt: iso(order.readyAt),
    servedAt: iso(order.servedAt),
    cancelledAt: iso(order.cancelledAt),
    note: order.note,
    items: viewItems,
    subtotal,
  };
}

export function buildBillView(
  bill: Bill,
  sessions: BilliardSession[],
  orders: Order[],
  items: OrderItem[],
  now: Date,
): BillView {
  const sessionViews = sessions.map((session) => buildSessionView(session, now));
  const activeSession = sessionViews.find((session) => session.status !== 'finished') ?? null;
  const sessionSubtotal = sessionViews.reduce(
    (sum, session) =>
      sum + (session.status === 'finished' ? (session.amount ?? session.estimate) : session.estimate),
    0,
  );

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }
  const orderViews = orders.map((order) => buildOrderView(order, itemsByOrder.get(order.id) ?? []));
  const validOrders = orderViews.filter((order) => order.status !== 'cancelled');
  const ordersSubtotal = validOrders.reduce((sum, order) => sum + order.subtotal, 0);
  const pendingOrdersCount = orderViews.filter((order) => order.status === 'pending').length;

  const totalDiscountAmount =
    bill.discountAmount +
    bill.memberDiscountAmount +
    bill.promoDiscountAmount +
    bill.pointsDiscountAmount +
    bill.voucherDiscountAmount;
  const totals = computeBillTotals({
    subtotal: sessionSubtotal + ordersSubtotal,
    discountAmount: totalDiscountAmount,
    taxRateBps: bill.taxRateBps,
    serviceRateBps: bill.serviceRateBps,
  });

  return {
    id: bill.id,
    number: bill.billNumber,
    guestName: bill.guestName,
    status: bill.status,
    openedAt: new Date(bill.openedAt).toISOString(),
    sessions: sessionViews,
    activeSession,
    orders: orderViews,
    sessionSubtotal,
    ordersSubtotal,
    subtotal: totals.subtotal,
    discountAmount: bill.discountAmount,
    memberId: bill.memberId,
    memberDiscountAmount: bill.memberDiscountAmount,
    promotionCode: bill.promotionCode,
    promoDiscountAmount: bill.promoDiscountAmount,
    pointsRedeemed: bill.pointsRedeemed,
    pointsDiscountAmount: bill.pointsDiscountAmount,
    voucherCode: bill.voucherCode,
    voucherDiscountAmount: bill.voucherDiscountAmount,
    totalDiscountAmount: totals.discountAmount,
    penaltyAmount: bill.penaltyAmount,
    taxRateBps: bill.taxRateBps,
    serviceRateBps: bill.serviceRateBps,
    taxAmount: totals.taxAmount,
    serviceAmount: totals.serviceAmount,
    total: totals.total + bill.penaltyAmount,
    pendingOrdersCount,
  };
}

export function mapRate(rate: {
  id: string;
  name: string;
  description: string | null;
  pricePerHour: number;
  minMinutes: number;
  incrementMinutes: number;
  active: boolean;
  sortOrder: number;
}): RateView {
  return {
    id: rate.id,
    name: rate.name,
    description: rate.description,
    pricePerHour: rate.pricePerHour,
    minMinutes: rate.minMinutes,
    incrementMinutes: rate.incrementMinutes,
    active: rate.active,
    sortOrder: rate.sortOrder,
  };
}

export function buildMenuItemView(
  item: MenuItem,
  categoryName: string,
): MenuItemView {
  return {
    id: item.id,
    categoryId: item.categoryId,
    categoryName,
    name: item.name,
    description: item.description,
    price: item.price,
    stock: item.stock,
    station: item.station,
    imageIcon: item.imageIcon,
    bestSeller: item.isBestSeller,
    available: item.isAvailable,
    soldOut: item.stock !== null && item.stock <= 0,
    sortOrder: item.sortOrder,
  };
}

export function buildCategoryViews(categories: MenuCategory[]) {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: category.icon,
    sortOrder: category.sortOrder,
    active: category.active,
  }));
}

export function buildShiftView(
  shift: Shift,
  staffName: string,
  expectedCash: number | null = null,
): ShiftView {
  return {
    id: shift.id,
    staffId: shift.staffId,
    staffName,
    status: shift.status,
    openingCash: shift.openingCash,
    expectedCash: expectedCash ?? shift.expectedCash,
    actualCash: shift.actualCash,
    difference: shift.difference,
    notes: shift.notes,
    openedAt: new Date(shift.openedAt).toISOString(),
    closedAt: iso(shift.closedAt),
  };
}

/** Awal hari menurut zona waktu venue (WIB, UTC+7), dikembalikan sebagai Date UTC. */
export function startOfDayJakarta(date: Date): Date {
  const offsetMs = 7 * 60 * 60 * 1000;
  const wib = new Date(date.getTime() + offsetMs);
  const startWib = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate());
  return new Date(startWib - offsetMs);
}

export function jakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VENUE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function daysAgoJakarta(days: number, from = new Date()): Date[] {
  const result: Date[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    result.push(new Date(from.getTime() - index * 86_400_000));
  }
  return result;
}
