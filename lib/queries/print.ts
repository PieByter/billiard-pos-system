import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb, dbNow } from '@/lib/db';
import {
  billiardSessions,
  bills,
  orderItems,
  orders,
  payments,
  profiles,
  refunds,
  venueTables,
  type StationType,
} from '@/lib/db/schema';
import { getActiveOutletId } from '@/lib/outlet';
import { loadVenueSettings } from '@/lib/services/settings';
import { buildBillView } from './shared';

export async function getBillPrintData(billId: string) {
  const db = await getDb();
  const serverNow = await dbNow(db);
  const [row] = await db
    .select({ bill: bills, table: venueTables })
    .from(bills)
    .innerJoin(venueTables, eq(bills.tableId, venueTables.id))
    .where(eq(bills.id, billId))
    .limit(1);
  if (!row) return null;
  const outletId = await getActiveOutletId();
  if (row.bill.outletId !== outletId) return null;

  const [sessions, orderRows, staffRows] = await Promise.all([
    db
      .select()
      .from(billiardSessions)
      .where(eq(billiardSessions.billId, billId))
      .orderBy(asc(billiardSessions.startedAt)),
    db.select().from(orders).where(eq(orders.billId, billId)).orderBy(asc(orders.createdAt)),
    db.select().from(profiles),
  ]);
  const orderIds = orderRows.map((order) => order.id);
  const items = orderIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];
  const [paymentRows, refundRows, venue] = await Promise.all([
    db
      .select({ payment: payments, staffName: profiles.name })
      .from(payments)
      .leftJoin(profiles, eq(payments.receivedBy, profiles.id))
      .where(eq(payments.billId, billId))
      .orderBy(asc(payments.createdAt)),
    db
      .select({ refund: refunds, staffName: profiles.name })
      .from(refunds)
      .leftJoin(profiles, eq(refunds.approvedBy, profiles.id))
      .where(eq(refunds.billId, billId))
      .orderBy(asc(refunds.createdAt)),
    loadVenueSettings(row.bill.outletId),
  ]);

  const staffById = new Map(staffRows.map((staff) => [staff.id, staff.name]));
  const view = buildBillView(row.bill, sessions, orderRows, items, serverNow);
  const paid = paymentRows.reduce((sum, entry) => sum + entry.payment.amount, 0);
  const refunded = refundRows.reduce((sum, entry) => sum + entry.refund.amount, 0);

  return {
    bill: view,
    table: row.table,
    payments: paymentRows.map((entry) => ({
      id: entry.payment.id,
      billSplitId: entry.payment.billSplitId,
      method: entry.payment.method,
      amount: entry.payment.amount,
      tendered: entry.payment.tendered,
      staffName: entry.staffName,
      createdAt: entry.payment.createdAt.toISOString(),
    })),
    paid,
    refunded,
    refunds: refundRows.map((entry) => ({
      id: entry.refund.id,
      amount: entry.refund.amount,
      category: entry.refund.category,
      reason: entry.refund.reason,
      restocked: entry.refund.restocked,
      staffName: entry.staffName,
      createdAt: entry.refund.createdAt.toISOString(),
    })),
    venue,
    openedByName: row.bill.openedBy ? staffById.get(row.bill.openedBy) ?? null : null,
    closedByName: row.bill.closedBy ? staffById.get(row.bill.closedBy) ?? null : null,
    printedAt: serverNow.toISOString(),
  };
}

export async function getKitchenPrintData(
  orderId: string,
  station: StationType | 'all',
) {
  const db = await getDb();
  const serverNow = await dbNow(db);
  const [row] = await db
    .select({ order: orders, table: venueTables })
    .from(orders)
    .innerJoin(venueTables, eq(orders.tableId, venueTables.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return null;
  const outletId = await getActiveOutletId();
  if (row.order.outletId !== outletId) return null;

  const items =
    station === 'all'
      ? await db.select().from(orderItems).where(eq(orderItems.orderId, orderId))
      : await db
          .select()
          .from(orderItems)
          .where(and(eq(orderItems.orderId, orderId), eq(orderItems.station, station)));

  if (items.length === 0) return null;

  return {
    order: row.order,
    table: row.table,
    items,
    station,
    printedAt: serverNow.toISOString(),
  };
}
