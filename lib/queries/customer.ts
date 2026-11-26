import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { dbNow, getDb } from '@/lib/db';
import {
  billiardSessions,
  bills,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  serviceRequests,
  venueTables,
} from '@/lib/db/schema';
import type {
  CustomerData,
  CustomerOrderView,
  MenuItemView,
  PublicOrderStatusResponse,
} from '@/lib/types';
import { loadVenueSettings } from '@/lib/services/settings';
import {
  buildBillView,
  buildCategoryViews,
  buildMenuItemView,
} from './shared';

type CustomerContext = {
  table: typeof venueTables.$inferSelect;
  bill: typeof bills.$inferSelect | null;
  orders: Array<typeof orders.$inferSelect>;
  items: Array<typeof orderItems.$inferSelect>;
  billView: ReturnType<typeof buildBillView> | null;
  serverNow: Date;
  hasOpenServiceRequest: boolean;
};

async function loadContext(token: string): Promise<CustomerContext | null> {
  const db = await getDb();
  const [table] = await db
    .select()
    .from(venueTables)
    .where(and(eq(venueTables.qrToken, token), eq(venueTables.active, true)))
    .limit(1);
  if (!table) return null;

  const serverNow = await dbNow(db);
  const [billRow] = await db
    .select()
    .from(bills)
    .where(and(eq(bills.tableId, table.id), eq(bills.status, 'open')))
    .limit(1);

  let orderRows: Array<typeof orders.$inferSelect> = [];
  let itemRows: Array<typeof orderItems.$inferSelect> = [];
  let sessions: Array<typeof billiardSessions.$inferSelect> = [];

  if (billRow) {
    [orderRows, sessions] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(eq(orders.billId, billRow.id))
        .orderBy(desc(orders.createdAt)),
      db
        .select()
        .from(billiardSessions)
        .where(eq(billiardSessions.billId, billRow.id))
        .orderBy(asc(billiardSessions.startedAt)),
    ]);
    if (orderRows.length) {
      itemRows = await db
        .select()
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            orderRows.map((order) => order.id),
          ),
        );
    }
  }

  const billView = billRow
    ? buildBillView(billRow, sessions, orderRows, itemRows, serverNow)
    : null;

  const [activeRequest] = await db
    .select({ id: serviceRequests.id })
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.tableId, table.id),
        eq(serviceRequests.status, 'open'),
      ),
    )
    .limit(1);

  return {
    table,
    bill: billRow ?? null,
    orders: orderRows,
    items: itemRows,
    billView,
    serverNow,
    hasOpenServiceRequest: Boolean(activeRequest),
  };
}

function toCustomerOrders(
  orderRows: Array<typeof orders.$inferSelect>,
  itemRows: Array<typeof orderItems.$inferSelect>,
): CustomerOrderView[] {
  return orderRows.map((order) => {
    const items = itemRows.filter((item) => item.orderId === order.id);
    return {
      id: order.id,
      number: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
      preparingAt: order.preparingAt?.toISOString() ?? null,
      readyAt: order.readyAt?.toISOString() ?? null,
      servedAt: order.servedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      items: items.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.nameSnapshot,
        qty: item.qty,
        note: item.note,
        station: item.station,
      })),
      subtotal: items.reduce((sum, item) => sum + item.priceSnapshot * item.qty, 0),
    };
  });
}

export async function getCustomerData(token: string): Promise<CustomerData | null> {
  const context = await loadContext(token);
  if (!context) return null;
  const db = await getDb();

  const [categoryRows, itemRows, venue] = await Promise.all([
    db
      .select()
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.active, true),
          eq(menuCategories.outletId, context.table.outletId),
        ),
      )
      .orderBy(asc(menuCategories.sortOrder)),
    db
      .select({ item: menuItems, categoryName: menuCategories.name })
      .from(menuItems)
      .innerJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
      .where(
        and(
          eq(menuCategories.active, true),
          eq(menuItems.isAvailable, true),
          eq(menuItems.outletId, context.table.outletId),
        ),
      )
      .orderBy(asc(menuItems.sortOrder)),
    loadVenueSettings(context.table.outletId),
  ]);

  const itemViews: MenuItemView[] = itemRows.map((row) =>
    buildMenuItemView(row.item, row.categoryName),
  );

  return {
    table: {
      code: context.table.code,
      zone: context.table.zone,
      kind: context.table.kind,
      capacity: context.table.capacity,
      allowSelfOrder: context.table.allowSelfOrder,
      qrToken: context.table.qrToken,
    },
    venueName: venue.venueName,
    categories: buildCategoryViews(categoryRows),
    items: itemViews,
    orders: toCustomerOrders(context.orders, context.items),
    bill: context.billView
      ? {
          id: context.billView.id,
          number: context.billView.number,
          subtotal: context.billView.subtotal,
          total: context.billView.total,
          openedAt: context.billView.openedAt,
        }
      : null,
    serverNow: context.serverNow.toISOString(),
    openServiceRequest: context.hasOpenServiceRequest,
  };
}

export async function getCustomerOrdersByToken(
  token: string,
): Promise<PublicOrderStatusResponse | null> {
  const context = await loadContext(token);
  if (!context) return null;
  return {
    serverNow: context.serverNow.toISOString(),
    orders: toCustomerOrders(context.orders, context.items),
    bill: context.billView
      ? {
          id: context.billView.id,
          number: context.billView.number,
          subtotal: context.billView.subtotal,
          total: context.billView.total,
          openedAt: context.billView.openedAt,
        }
      : null,
  };
}
