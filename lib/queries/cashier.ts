import { and, asc, eq, inArray } from 'drizzle-orm';
import { dbNow, getDb } from '@/lib/db';
import { getActiveOutletId } from '@/lib/outlet';
import {
  billiardRates,
  billiardSessions,
  bills,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  profiles,
  serviceRequests,
  shifts,
  venueTables,
  type BilliardSession,
  type Order,
  type OrderItem,
} from '@/lib/db/schema';
import type {
  CashierData,
  CashierMetrics,
  MenuItemView,
  ServiceRequestView,
  TableView,
} from '@/lib/types';
import {
  buildBillView,
  buildCategoryViews,
  buildMenuItemView,
  buildShiftView,
} from './shared';

export async function getCashierData(): Promise<CashierData> {
  const db = await getDb();
  const serverNow = await dbNow(db);
  const outletId = await getActiveOutletId();

  const [tableRows, rateRows, billRows, shiftRows, categoryRows, menuRows, serviceRows] =
    await Promise.all([
      db
        .select()
        .from(venueTables)
        .where(and(eq(venueTables.active, true), eq(venueTables.outletId, outletId)))
        .orderBy(asc(venueTables.kind), asc(venueTables.sortOrder)),
      db
        .select()
        .from(billiardRates)
        .where(eq(billiardRates.outletId, outletId))
        .orderBy(asc(billiardRates.sortOrder)),
      db
        .select()
        .from(bills)
        .where(and(eq(bills.status, 'open'), eq(bills.outletId, outletId))),
      db
        .select({ shift: shifts, staffName: profiles.name })
        .from(shifts)
        .leftJoin(profiles, eq(shifts.staffId, profiles.id))
        .where(and(eq(shifts.status, 'open'), eq(shifts.outletId, outletId)))
        .limit(1),
      db
        .select()
        .from(menuCategories)
        .where(
          and(eq(menuCategories.active, true), eq(menuCategories.outletId, outletId)),
        )
        .orderBy(asc(menuCategories.sortOrder)),
      db
        .select()
        .from(menuItems)
        .where(eq(menuItems.outletId, outletId))
        .orderBy(asc(menuItems.sortOrder)),
      db
        .select({ request: serviceRequests, tableCode: venueTables.code })
        .from(serviceRequests)
        .leftJoin(venueTables, eq(serviceRequests.tableId, venueTables.id))
        .where(
          and(eq(serviceRequests.status, 'open'), eq(serviceRequests.outletId, outletId)),
        )
        .orderBy(asc(serviceRequests.createdAt)),
    ]);

  const billIds = billRows.map((bill) => bill.id);

  const allOrders: Order[] = billIds.length
    ? await db.select().from(orders).where(inArray(orders.billId, billIds))
    : [];
  const allSessions: BilliardSession[] = billIds.length
    ? await db
        .select()
        .from(billiardSessions)
        .where(inArray(billiardSessions.billId, billIds))
    : [];
  const orderIds = allOrders.map((order) => order.id);
  const allItems: OrderItem[] = orderIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of allItems) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }
  const ordersByBill = new Map<string, Order[]>();
  for (const order of allOrders) {
    const list = ordersByBill.get(order.billId) ?? [];
    list.push(order);
    ordersByBill.set(order.billId, list);
  }
  const sessionsByBill = new Map<string, BilliardSession[]>();
  for (const session of allSessions) {
    const list = sessionsByBill.get(session.billId) ?? [];
    list.push(session);
    sessionsByBill.set(session.billId, list);
  }

  const billViewByTable = new Map(
    billRows.map((bill) => {
      const billOrders = ordersByBill.get(bill.id) ?? [];
      const billItems = billOrders.flatMap((order) => itemsByOrder.get(order.id) ?? []);
      return [
        bill.tableId,
        buildBillView(
          bill,
          sessionsByBill.get(bill.id) ?? [],
          billOrders,
          billItems,
          serverNow,
        ),
      ] as const;
    }),
  );

  const ratesById = new Map(rateRows.map((rate) => [rate.id, rate]));
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const menuViews: MenuItemView[] = menuRows
    .filter((item) => categoryById.has(item.categoryId))
    .map((item) => buildMenuItemView(item, categoryById.get(item.categoryId)!.name))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const requestsByTable = new Map<string, ServiceRequestView[]>();
  for (const row of serviceRows) {
    const request: ServiceRequestView = {
      id: row.request.id,
      tableId: row.request.tableId,
      tableCode: row.tableCode ?? '—',
      type: row.request.type,
      note: row.request.note,
      createdAt: row.request.createdAt.toISOString(),
    };
    const list = requestsByTable.get(request.tableId) ?? [];
    list.push(request);
    requestsByTable.set(request.tableId, list);
  }

  const tables: TableView[] = tableRows.map((table) => {
    const bill = billViewByTable.get(table.id) ?? null;
    const rate = table.rateId ? ratesById.get(table.rateId) : null;
    let state: TableView['state'];
    if (bill?.activeSession?.status === 'running') state = 'running';
    else if (bill?.activeSession?.status === 'paused') state = 'paused';
    else if (bill) state = 'occupied';
    else if (table.maintenanceAt) state = 'maintenance';
    else if (table.needsCleaningAt) state = 'cleaning';
    else state = 'available';

    return {
      id: table.id,
      code: table.code,
      kind: table.kind,
      zone: table.zone,
      capacity: table.capacity,
      allowSelfOrder: table.allowSelfOrder,
      qrToken: table.qrToken,
      rate: rate
        ? {
            id: rate.id,
            name: rate.name,
            description: rate.description,
            pricePerHour: rate.pricePerHour,
            minMinutes: rate.minMinutes,
            incrementMinutes: rate.incrementMinutes,
            active: rate.active,
            sortOrder: rate.sortOrder,
          }
        : null,
      needsCleaningAt: table.needsCleaningAt?.toISOString() ?? null,
      maintenanceAt: table.maintenanceAt?.toISOString() ?? null,
      maintenanceNote: table.maintenanceNote,
      state,
      bill,
      serviceRequests: requestsByTable.get(table.id) ?? [],
      pendingOrdersCount: bill?.pendingOrdersCount ?? 0,
    };
  });

  const billiard = tables.filter((table) => table.kind === 'billiard');
  const cafe = tables.filter((table) => table.kind === 'cafe');
  const billViews = Array.from(billViewByTable.values());
  const metrics: CashierMetrics = {
    billiardTotal: billiard.length,
    billiardRunning: billiard.filter((table) => table.state === 'running').length,
    billiardPaused: billiard.filter((table) => table.state === 'paused').length,
    billiardAvailable: billiard.filter((table) => table.state === 'available').length,
    billiardCleaning: billiard.filter((table) => table.state === 'cleaning').length,
    cafeTotal: cafe.length,
    cafeOccupied: cafe.filter((table) => Boolean(table.bill)).length,
    openBillCount: billViews.length,
    openBillTotal: billViews.reduce((sum, bill) => sum + bill.total, 0),
    pendingCount: billViews.reduce((sum, bill) => sum + bill.pendingOrdersCount, 0),
    serviceRequestCount: serviceRows.length,
  };

  return {
    serverNow: serverNow.toISOString(),
    tables,
    metrics,
    shift: shiftRows[0]
      ? buildShiftView(shiftRows[0].shift, shiftRows[0].staffName ?? 'Staff')
      : null,
    categories: buildCategoryViews(categoryRows),
    menuItems: menuViews,
    serviceRequests: Array.from(requestsByTable.values()).flat(),
  };
}
