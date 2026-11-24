import { asc, eq, inArray, sql } from 'drizzle-orm';
import { dbNow, getDb } from '@/lib/db';
import { orderItems, orders, venueTables } from '@/lib/db/schema';
import type { KdsData, KdsMetrics, KdsOrderView } from '@/lib/types';
import { buildOrderView, startOfDayJakarta } from './shared';

export async function getKdsData(): Promise<KdsData> {
  const db = await getDb();
  const serverNow = await dbNow(db);

  const rows = await db
    .select({
      order: orders,
      tableCode: venueTables.code,
      tableZone: venueTables.zone,
      tableKind: venueTables.kind,
    })
    .from(orders)
    .innerJoin(venueTables, eq(orders.tableId, venueTables.id))
    .where(inArray(orders.status, ['accepted', 'preparing', 'ready']))
    .orderBy(asc(orders.createdAt));

  const orderIds = rows.map((row) => row.order.id);
  const itemRows = orderIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];
  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  const kdsOrders: KdsOrderView[] = rows.map((row) => {
    const items = itemsByOrder.get(row.order.id) ?? [];
    const view = buildOrderView(row.order, items);
    const allItemsDone = items.length > 0 && items.every((item) => item.doneAt !== null);
    return {
      ...view,
      tableCode: row.tableCode,
      tableZone: row.tableZone,
      tableKind: row.tableKind,
      waitSeconds: Math.max(
        0,
        Math.floor((serverNow.getTime() - new Date(row.order.createdAt).getTime()) / 1000),
      ),
      stationItemsDone: items.filter((item) => item.doneAt !== null).length,
      stationItemsTotal: items.length,
      allItemsDone,
    };
  });

  const servedToday = await db
    .select({ createdAt: orders.createdAt, servedAt: orders.servedAt })
    .from(orders)
    .where(
      sql`${orders.servedAt} is not null and ${orders.servedAt} >= ${startOfDayJakarta(serverNow)}`,
    );

  const serveDurations = servedToday
    .map((row) =>
      row.servedAt
        ? Math.max(0, Math.floor((row.servedAt.getTime() - row.createdAt.getTime()) / 1000))
        : null,
    )
    .filter((value): value is number => value !== null);

  const avgServeSeconds =
    serveDurations.length > 0
      ? Math.round(serveDurations.reduce((sum, value) => sum + value, 0) / serveDurations.length)
      : null;

  const metrics: KdsMetrics = {
    activeTickets: kdsOrders.length,
    avgServeSeconds,
    overdueCount: kdsOrders.filter(
      (order) => order.status !== 'ready' && order.waitSeconds > 12 * 60,
    ).length,
    readyCount: kdsOrders.filter((order) => order.status === 'ready').length,
    kitchenCount: kdsOrders.filter((order) =>
      order.items.some((item) => item.station === 'kitchen'),
    ).length,
    barCount: kdsOrders.filter((order) => order.items.some((item) => item.station === 'bar'))
      .length,
  };

  return {
    serverNow: serverNow.toISOString(),
    orders: kdsOrders,
    metrics,
  };
}
