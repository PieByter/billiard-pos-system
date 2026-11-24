import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import QRCode from 'qrcode';
import { dbNow, getDb } from '@/lib/db';
import {
  auditLog,
  billiardRates,
  billiardSessions,
  bills,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  payments,
  profiles,
  serviceRequests,
  shifts,
  venueTables,
} from '@/lib/db/schema';
import type {
  AdminData,
  MenuAdminData,
  PaymentBreakdown,
  PayMethod,
  ReportData,
  ReportDay,
  ShiftReportData,
  TablesAdminData,
} from '@/lib/types';
import { getCashierData } from './cashier';
import {
  buildCategoryViews,
  buildMenuItemView,
  buildShiftView,
  daysAgoJakarta,
  jakartaDateKey,
  mapRate,
  startOfDayJakarta,
} from './shared';

const ALL_METHODS: PayMethod[] = ['cash', 'qris', 'transfer', 'edc'];

export async function getAdminData(): Promise<AdminData> {
  const db = await getDb();
  const serverNow = await dbNow(db);

  const [shiftRow] = await db
    .select({ shift: shifts, staffName: profiles.name })
    .from(shifts)
    .leftJoin(profiles, eq(shifts.staffId, profiles.id))
    .where(eq(shifts.status, 'open'))
    .limit(1);

  const since = shiftRow?.shift.openedAt ?? startOfDayJakarta(serverNow);

  const [
    methodRows,
    transactionRow,
    billiardRevenueRows,
    fnbRevenueRow,
    openBillRow,
    topTableRows,
    rateRows,
    auditRows,
    historyRows,
    menuCountRow,
    tableCountRow,
    serviceCountRow,
  ] = await Promise.all([
    db
      .select({
        method: payments.method,
        amount: sql<number>`coalesce(sum(${payments.amount}),0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(gte(payments.createdAt, since))
      .groupBy(payments.method),
    db
      .select({ total: sql<number>`count(distinct ${payments.billId})::int` })
      .from(payments)
      .where(gte(payments.createdAt, since)),
    db
      .select({
        amount: sql<number>`coalesce(sum(${billiardSessions.amount}),0)::int`,
        seconds: sql<number>`coalesce(sum(extract(epoch from (${billiardSessions.endedAt} - ${billiardSessions.startedAt})) - ${billiardSessions.pausedSeconds}),0)::int`,
        sessions: sql<number>`count(*)::int`,
      })
      .from(billiardSessions)
      .innerJoin(bills, eq(billiardSessions.billId, bills.id))
      .where(
        and(
          eq(bills.status, 'paid'),
          eq(billiardSessions.status, 'finished'),
          sql`${bills.closedAt} >= ${since.toISOString()}`,
        ),
      ),
    db
      .select({
        amount: sql<number>`coalesce(sum(${orderItems.priceSnapshot} * ${orderItems.qty}),0)::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(bills, eq(orders.billId, bills.id))
      .where(
        and(
          eq(bills.status, 'paid'),
          sql`${bills.closedAt} >= ${since.toISOString()}`,
          sql`${orders.status} <> 'cancelled'`,
        ),
      ),
    db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${bills.total}),0)::int`,
      })
      .from(bills)
      .where(eq(bills.status, 'open')),
    db
      .select({
        code: venueTables.code,
        zone: venueTables.zone,
        amount: sql<number>`coalesce(sum(${billiardSessions.amount}),0)::int`,
        seconds: sql<number>`coalesce(sum(extract(epoch from (${billiardSessions.endedAt} - ${billiardSessions.startedAt})) - ${billiardSessions.pausedSeconds}),0)::int`,
        sessions: sql<number>`count(*)::int`,
      })
      .from(billiardSessions)
      .innerJoin(bills, eq(billiardSessions.billId, bills.id))
      .innerJoin(venueTables, eq(billiardSessions.tableId, venueTables.id))
      .where(
        and(
          eq(bills.status, 'paid'),
          eq(billiardSessions.status, 'finished'),
          sql`${bills.closedAt} >= ${since.toISOString()}`,
        ),
      )
      .groupBy(venueTables.code, venueTables.zone)
      .orderBy(desc(sql`coalesce(sum(${billiardSessions.amount}),0)`))
      .limit(1),
    db
      .select({
        id: billiardRates.id,
        name: billiardRates.name,
        description: billiardRates.description,
        pricePerHour: billiardRates.pricePerHour,
        minMinutes: billiardRates.minMinutes,
        incrementMinutes: billiardRates.incrementMinutes,
        active: billiardRates.active,
        sortOrder: billiardRates.sortOrder,
        tableCount: sql<number>`count(${venueTables.id})::int`,
      })
      .from(billiardRates)
      .leftJoin(
        venueTables,
        and(eq(venueTables.rateId, billiardRates.id), eq(venueTables.kind, 'billiard')),
      )
      .groupBy(billiardRates.id)
      .orderBy(asc(billiardRates.sortOrder)),
    db
      .select({
        log: auditLog,
        staffName: profiles.name,
        staffRole: profiles.role,
      })
      .from(auditLog)
      .leftJoin(profiles, eq(auditLog.staffId, profiles.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(15),
    db
      .select({ shift: shifts, staffName: profiles.name })
      .from(shifts)
      .leftJoin(profiles, eq(shifts.staffId, profiles.id))
      .where(eq(shifts.status, 'closed'))
      .orderBy(desc(shifts.closedAt))
      .limit(5),
    db.select({ total: sql<number>`count(*)::int` }).from(menuItems),
    db.select({ total: sql<number>`count(*)::int` }).from(venueTables),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(serviceRequests)
      .where(eq(serviceRequests.status, 'open')),
  ]);

  const methodMap = new Map(
    methodRows.map((row) => [row.method, { amount: row.amount, count: row.count }]),
  );
  const paymentBreakdown: PaymentBreakdown[] = ALL_METHODS.map((method) => ({
    method,
    amount: methodMap.get(method)?.amount ?? 0,
    count: methodMap.get(method)?.count ?? 0,
  }));
  const revenue = paymentBreakdown.reduce((sum, row) => sum + row.amount, 0);
  const cashRevenue = methodMap.get('cash')?.amount ?? 0;
  const nonCashRevenue = revenue - cashRevenue;
  const billiardRevenue = billiardRevenueRows[0]?.amount ?? 0;
  const fnbRevenue = fnbRevenueRow[0]?.amount ?? 0;
  const playSeconds = billiardRevenueRows[0]?.seconds ?? 0;
  const playSessions = billiardRevenueRows[0]?.sessions ?? 0;
  const openingCash = shiftRow?.shift.openingCash ?? 0;
  const expectedCash = openingCash + cashRevenue;

  return {
    serverNow: serverNow.toISOString(),
    shift: shiftRow
      ? buildShiftView(shiftRow.shift, shiftRow.staffName ?? 'Staff', expectedCash)
      : null,
    shiftStats: {
      revenue,
      billiardRevenue,
      fnbRevenue,
      cashRevenue,
      nonCashRevenue,
      transactionCount: transactionRow[0]?.total ?? 0,
      openBills: openBillRow[0]?.count ?? 0,
      openBillTotal: openBillRow[0]?.total ?? 0,
      cashInDrawer: expectedCash,
      expectedCash,
      avgPlaySeconds:
        playSessions > 0 ? Math.round(playSeconds / playSessions) : null,
      totalPlaySeconds: playSeconds,
      topTable: topTableRows[0]
        ? {
            code: topTableRows[0].code,
            amount: topTableRows[0].amount,
            seconds: topTableRows[0].seconds,
          }
        : null,
      paymentBreakdown,
    },
    rates: rateRows.map((rate) => ({
      ...mapRate(rate),
      tableCount: rate.tableCount,
    })),
    audits: auditRows.map((row) => ({
      id: row.log.id,
      staffName: row.staffName ?? 'Sistem',
      staffRole: row.staffRole ?? 'system',
      action: row.log.action,
      entityType: row.log.entityType,
      entityId: row.log.entityId,
      detail: row.log.detail,
      createdAt: row.log.createdAt.toISOString(),
    })),
    shiftHistory: historyRows.map((row) =>
      buildShiftView(row.shift, row.staffName ?? 'Staff'),
    ),
    menuCount: menuCountRow[0]?.total ?? 0,
    tableCount: tableCountRow[0]?.total ?? 0,
    openServiceRequests: serviceCountRow[0]?.total ?? 0,
  };
}

export async function getReportData(days = 7): Promise<ReportData> {
  const db = await getDb();
  const serverNow = await dbNow(db);
  const start = startOfDayJakarta(new Date(serverNow.getTime() - (days - 1) * 86_400_000));

  const paymentDay = sql<string>`to_char(${payments.createdAt} at time zone 'Asia/Jakarta','YYYY-MM-DD')`;
  const billDay = sql<string>`to_char(${bills.closedAt} at time zone 'Asia/Jakarta','YYYY-MM-DD')`;

  const [revenueRows, billiardRows, fnbRows, topItemRows, topTableRows, mixRows] =
    await Promise.all([
      db
        .select({
          day: paymentDay,
          revenue: sql<number>`coalesce(sum(${payments.amount}),0)::int`,
          transactions: sql<number>`count(distinct ${payments.billId})::int`,
        })
        .from(payments)
        .where(gte(payments.createdAt, start))
        .groupBy(paymentDay),
      db
        .select({
          day: billDay,
          revenue: sql<number>`coalesce(sum(${billiardSessions.amount}),0)::int`,
        })
        .from(billiardSessions)
        .innerJoin(bills, eq(billiardSessions.billId, bills.id))
        .where(
          and(
            eq(bills.status, 'paid'),
            eq(billiardSessions.status, 'finished'),
            sql`${bills.closedAt} >= ${start.toISOString()}`,
          ),
        )
        .groupBy(billDay),
      db
        .select({
          day: billDay,
          revenue: sql<number>`coalesce(sum(${orderItems.priceSnapshot} * ${orderItems.qty}),0)::int`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(bills, eq(orders.billId, bills.id))
        .where(
          and(
            eq(bills.status, 'paid'),
            sql`${bills.closedAt} >= ${start.toISOString()}`,
            sql`${orders.status} <> 'cancelled'`,
          ),
        )
        .groupBy(billDay),
      db
        .select({
          name: orderItems.nameSnapshot,
          qty: sql<number>`sum(${orderItems.qty})::int`,
          revenue: sql<number>`sum(${orderItems.priceSnapshot} * ${orderItems.qty})::int`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(bills, eq(orders.billId, bills.id))
        .where(
          and(
            eq(bills.status, 'paid'),
            sql`${bills.closedAt} >= ${start.toISOString()}`,
            sql`${orders.status} <> 'cancelled'`,
          ),
        )
        .groupBy(orderItems.nameSnapshot)
        .orderBy(desc(sql`sum(${orderItems.qty})`))
        .limit(6),
      db
        .select({
          code: venueTables.code,
          zone: venueTables.zone,
          revenue: sql<number>`coalesce(sum(${billiardSessions.amount}),0)::int`,
          sessions: sql<number>`count(*)::int`,
        })
        .from(billiardSessions)
        .innerJoin(bills, eq(billiardSessions.billId, bills.id))
        .innerJoin(venueTables, eq(billiardSessions.tableId, venueTables.id))
        .where(
          and(
            eq(bills.status, 'paid'),
            eq(billiardSessions.status, 'finished'),
            sql`${bills.closedAt} >= ${start.toISOString()}`,
          ),
        )
        .groupBy(venueTables.code, venueTables.zone)
        .orderBy(desc(sql`coalesce(sum(${billiardSessions.amount}),0)`))
        .limit(6),
      db
        .select({
          method: payments.method,
          amount: sql<number>`coalesce(sum(${payments.amount}),0)::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(payments)
        .where(gte(payments.createdAt, start))
        .groupBy(payments.method),
    ]);

  const revenueByDay = new Map(revenueRows.map((row) => [row.day, row]));
  const billiardByDay = new Map(billiardRows.map((row) => [row.day, row.revenue]));
  const fnbByDay = new Map(fnbRows.map((row) => [row.day, row.revenue]));
  const dayEntries: ReportDay[] = daysAgoJakarta(days, serverNow).map((date) => {
    const key = jakartaDateKey(date);
    return {
      date: key,
      revenue: revenueByDay.get(key)?.revenue ?? 0,
      transactionCount: revenueByDay.get(key)?.transactions ?? 0,
      billiardRevenue: billiardByDay.get(key) ?? 0,
      fnbRevenue: fnbByDay.get(key) ?? 0,
    };
  });

  const revenue = dayEntries.reduce((sum, day) => sum + day.revenue, 0);
  const transactions = dayEntries.reduce((sum, day) => sum + day.transactionCount, 0);
  const billiard = dayEntries.reduce((sum, day) => sum + day.billiardRevenue, 0);
  const fnb = dayEntries.reduce((sum, day) => sum + day.fnbRevenue, 0);
  const mixTotal = mixRows.reduce((sum, row) => sum + row.amount, 0);

  return {
    days: dayEntries,
    topItems: topItemRows,
    topTables: topTableRows,
    paymentMix: ALL_METHODS.map((method) => {
      const row = mixRows.find((entry) => entry.method === method);
      return {
        method,
        amount: row?.amount ?? 0,
        count: row?.count ?? 0,
        share: mixTotal ? Math.round(((row?.amount ?? 0) / mixTotal) * 1000) / 10 : 0,
      };
    }),
    totals: {
      revenue,
      transactions,
      avgBill: transactions ? Math.round(revenue / transactions) : 0,
      billiard,
      fnb,
    },
  };
}

export async function getShiftReport(shiftId: string): Promise<ShiftReportData | null> {
  const db = await getDb();
  const serverNow = await dbNow(db);
  const [row] = await db
    .select({ shift: shifts, staffName: profiles.name })
    .from(shifts)
    .leftJoin(profiles, eq(shifts.staffId, profiles.id))
    .where(eq(shifts.id, shiftId))
    .limit(1);
  if (!row) return null;

  const end = row.shift.closedAt ?? serverNow;
  const paymentRows = await db
    .select({
      payment: payments,
      billNumber: bills.billNumber,
      tableCode: venueTables.code,
    })
    .from(payments)
    .innerJoin(bills, eq(payments.billId, bills.id))
    .innerJoin(venueTables, eq(bills.tableId, venueTables.id))
    .where(
      sql`${payments.createdAt} >= ${row.shift.openedAt.toISOString()} and ${payments.createdAt} <= ${end.toISOString()}`,
    )
    .orderBy(asc(payments.createdAt));

  const billRows = await db
    .select({
      id: bills.id,
      billNumber: bills.billNumber,
      tableCode: venueTables.code,
      guestName: bills.guestName,
      total: bills.total,
      closedAt: bills.closedAt,
    })
    .from(bills)
    .innerJoin(venueTables, eq(bills.tableId, venueTables.id))
    .where(
      and(
        eq(bills.status, 'paid'),
        sql`${bills.closedAt} >= ${row.shift.openedAt.toISOString()}`,
        sql`${bills.closedAt} <= ${end.toISOString()}`,
      ),
    )
    .orderBy(asc(bills.closedAt));

  const totals = ALL_METHODS.map((method) => {
    const matching = paymentRows.filter((entry) => entry.payment.method === method);
    return {
      method,
      amount: matching.reduce((sum, entry) => sum + entry.payment.amount, 0),
      count: matching.length,
    };
  });
  const totalRevenue = totals.reduce((sum, total) => sum + total.amount, 0);
  const cashRevenue = totals.find((total) => total.method === 'cash')?.amount ?? 0;

  return {
    shift: buildShiftView(row.shift, row.staffName ?? 'Staff'),
    staffName: row.staffName ?? 'Staff',
    serverNow: serverNow.toISOString(),
    payments: paymentRows.map((entry) => ({
      id: entry.payment.id,
      billNumber: entry.billNumber,
      tableCode: entry.tableCode,
      method: entry.payment.method,
      amount: entry.payment.amount,
      createdAt: entry.payment.createdAt.toISOString(),
    })),
    totals,
    totalRevenue,
    cashRevenue,
    expectedCash: row.shift.openingCash + cashRevenue,
    bills: billRows.map((bill) => ({
      id: bill.id,
      billNumber: bill.billNumber,
      tableCode: bill.tableCode,
      guestName: bill.guestName,
      total: bill.total,
      closedAt: bill.closedAt?.toISOString() ?? null,
    })),
  };
}

export async function getMenuAdminData(): Promise<MenuAdminData> {
  const db = await getDb();
  const [categoryRows, itemRows] = await Promise.all([
    db.select().from(menuCategories).orderBy(asc(menuCategories.sortOrder)),
    db
      .select({ item: menuItems, categoryName: menuCategories.name })
      .from(menuItems)
      .leftJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
      .orderBy(asc(menuItems.sortOrder)),
  ]);

  return {
    categories: buildCategoryViews(categoryRows),
    items: itemRows.map((row) => buildMenuItemView(row.item, row.categoryName ?? 'Tanpa kategori')),
  };
}

export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export async function getTablesAdminData(): Promise<TablesAdminData> {
  const db = await getDb();
  const [cashier, rateRows] = await Promise.all([
    getCashierData(),
    db.select().from(billiardRates).orderBy(asc(billiardRates.sortOrder)),
  ]);

  const baseUrl = appBaseUrl();
  const tables = await Promise.all(
    cashier.tables.map(async (table) => {
      const customerUrl = `${baseUrl}/t/${table.qrToken}`;
      const qrDataUrl = await QRCode.toDataURL(customerUrl, {
        margin: 1,
        width: 480,
        color: { dark: '#0b1326', light: '#ffffff' },
      });
      return {
        ...table,
        qrDataUrl,
        customerUrl,
        rateName: table.rate?.name ?? null,
        activeSession: table.bill?.activeSession ?? null,
      };
    }),
  );

  return {
    tables,
    rates: rateRows.map(mapRate),
  };
}
