import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import {
  billiardSessions,
  bills,
  orderItems,
  orders,
  payments,
  printJobs,
  venueSettings,
  venueTables,
  type PrintJob,
} from '@/lib/db/schema';
import { formatRp } from '@/lib/billing';
import { PAY_METHOD_LABELS } from '@/lib/constants';
import { escPosToText, type EscPosDocument } from '@/lib/print/escpos';
import { getActiveOutletId } from '@/lib/outlet';
import { audit } from './audit';

function line(left: string, right: string, width = 42): string {
  const rightText = right.slice(0, width);
  const leftWidth = Math.max(0, width - rightText.length - 1);
  return `${left.slice(0, leftWidth).padEnd(leftWidth)} ${rightText}`;
}

function divider(width = 42) {
  return '-'.repeat(width);
}

function localTime(value: Date | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

async function insertJob(
  tx: DbTransaction,
  input: {
    outletId: string;
    type: PrintJob['type'];
    referenceType?: string | null;
    referenceId?: string | null;
    title: string;
    document: EscPosDocument;
    createdBy?: string | null;
  },
) {
  const now = await dbNow(tx);
  const [job] = await tx
    .insert(printJobs)
    .values({
      outletId: input.outletId,
      type: input.type,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      title: input.title,
      payload: {
        text: escPosToText(input.document),
        title: input.document.title,
        subtitle: input.document.subtitle ?? null,
        lines: input.document.lines,
        footer: input.document.footer ?? null,
        width: input.document.width ?? 42,
      },
      status: 'queued',
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return job;
}

export async function enqueueBillPrintJob(
  tx: DbTransaction,
  billId: string,
  options: { type?: PrintJob['type']; createdBy?: string | null } = {},
) {
  const [row] = await tx
    .select({ bill: bills, table: venueTables, settings: venueSettings })
    .from(bills)
    .innerJoin(venueTables, eq(bills.tableId, venueTables.id))
    .leftJoin(venueSettings, eq(venueSettings.outletId, bills.outletId))
    .where(eq(bills.id, billId))
    .limit(1);
  if (!row) return null;

  const [sessions, orderRows, paymentRows] = await Promise.all([
    tx.select().from(billiardSessions).where(eq(billiardSessions.billId, billId)),
    tx
      .select()
      .from(orders)
      .where(and(eq(orders.billId, billId), sql`${orders.status} <> 'cancelled'`)),
    tx.select().from(payments).where(eq(payments.billId, billId)),
  ]);
  const items = orderRows.length
    ? await tx
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderRows.map((order) => order.id)))
    : [];

  const lines: string[] = [
    row.settings?.address ?? '',
    divider(),
    line('Bill', row.bill.billNumber),
    line('Meja', `${row.table.code} - ${row.table.zone}`),
    line('Guest', row.bill.guestName ?? 'Walk-in'),
    line('Buka', localTime(row.bill.openedAt)),
    line('Tutup', localTime(row.bill.closedAt)),
    divider(),
  ];
  let subtotal = 0;
  for (const session of sessions) {
    const amount = session.amount ?? 0;
    subtotal += amount;
    const minutes = session.endedAt
      ? Math.max(
          0,
          Math.ceil(
            (session.endedAt.getTime() - session.startedAt.getTime()) / 60_000 -
              session.pausedSeconds / 60,
          ),
        )
      : 0;
    lines.push(line(`Sesi billiard ${minutes}m`, formatRp(amount)));
  }
  for (const item of items) {
    const amount = item.priceSnapshot * item.qty;
    subtotal += amount;
    lines.push(line(`${item.qty}x ${item.nameSnapshot}`, formatRp(amount)));
    if (item.note) lines.push(`   * ${item.note}`);
  }
  lines.push(divider());
  lines.push(line('Subtotal', formatRp(subtotal)));
  const totalDiscount =
    row.bill.discountAmount +
    row.bill.memberDiscountAmount +
    row.bill.promoDiscountAmount +
    row.bill.pointsDiscountAmount +
    row.bill.voucherDiscountAmount;
  if (totalDiscount > 0) lines.push(line('Diskon', `-${formatRp(totalDiscount)}`));
  if (row.bill.penaltyAmount > 0) lines.push(line('Denda', formatRp(row.bill.penaltyAmount)));
  if (row.bill.taxAmount > 0) {
    lines.push(line(`PB1 ${(row.bill.taxRateBps / 100).toFixed(0)}%`, formatRp(row.bill.taxAmount)));
  }
  if (row.bill.serviceAmount > 0) {
    lines.push(
      line(`Service ${(row.bill.serviceRateBps / 100).toFixed(0)}%`, formatRp(row.bill.serviceAmount)),
    );
  }
  lines.push(divider());
  lines.push(line('TOTAL', formatRp(row.bill.total)));
  if (paymentRows.length > 0) {
    lines.push(divider());
    for (const payment of paymentRows) {
      lines.push(
        line(PAY_METHOD_LABELS[payment.method] ?? payment.method, formatRp(payment.amount)),
      );
    }
  }
  lines.push(divider());
  lines.push('Terima kasih sudah bermain di Cue & Tap.');

  return insertJob(tx, {
    outletId: row.bill.outletId,
    type: options.type ?? 'receipt',
    referenceType: 'bill',
    referenceId: billId,
    title: `Struk ${row.bill.billNumber}`,
    document: {
      title: 'CUE & TAP',
      subtitle: row.settings?.venueName ?? 'Billiard Hall & Lounge',
      lines,
      footer: row.settings?.receiptFooter ?? 'Sampai jumpa lagi!',
    },
    createdBy: options.createdBy ?? null,
  });
}

export async function enqueueKitchenPrintJobs(
  tx: DbTransaction,
  orderId: string,
  createdBy?: string | null,
) {
  const [row] = await tx
    .select({ order: orders, table: venueTables })
    .from(orders)
    .innerJoin(venueTables, eq(orders.tableId, venueTables.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return [];
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length === 0) return [];
  const stations = [...new Set(items.map((item) => item.station))];
  const created: PrintJob[] = [];
  for (const station of stations) {
    const stationItems = items.filter((item) => item.station === station);
    const lines = [
      line('Order', row.order.orderNumber),
      line('Meja', `${row.table.code} - ${row.table.zone}`),
      line('Waktu', localTime(row.order.createdAt)),
      divider(),
      ...stationItems.map((item) => `${item.qty}x ${item.nameSnapshot}`),
      ...stationItems.filter((item) => item.note).map((item) => `   * ${item.note}`),
      divider(),
      row.order.note ? `Catatan: ${row.order.note}` : 'Tanpa catatan',
    ];
    const job = await insertJob(tx, {
      outletId: row.order.outletId,
      type: 'kitchen',
      referenceType: 'order',
      referenceId: orderId,
      title: `${station === 'bar' ? 'BAR' : 'KITCHEN'} TICKET`,
      document: {
        title: station === 'bar' ? 'BAR TICKET' : 'KITCHEN TICKET',
        subtitle: row.table.code,
        lines,
        footer: 'Cue & Tap POS',
      },
      createdBy: createdBy ?? null,
    });
    created.push(job);
  }
  return created;
}

export async function queueTestPrint(staffId: string) {
  const outletId = await getActiveOutletId();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const job = await insertJob(tx, {
      outletId,
      type: 'test',
      referenceType: 'system',
      referenceId: null,
      title: 'Test print Cue & Tap',
      document: {
        title: 'CUE & TAP',
        subtitle: 'TEST PRINT',
        lines: ['Printer thermal terhubung.', 'Antrean print agent berjalan.', divider()],
        footer: 'OK',
      },
      createdBy: staffId,
    });
    return { jobId: job.id };
  });
}

export async function queueBillReprint(billId: string, staffId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const outletId = await getActiveOutletId();
    const [bill] = await tx
      .select({ outletId: bills.outletId })
      .from(bills)
      .where(eq(bills.id, billId))
      .limit(1);
    if (!bill || bill.outletId !== outletId) throw new Error('Bill tidak ditemukan.');
    const job = await enqueueBillPrintJob(tx, billId, {
      type: 'receipt',
      createdBy: staffId,
    });
    if (!job) throw new Error('Bill tidak ditemukan.');
    await audit(tx, {
      staffId,
      action: 'print.bill_queued',
      entityType: 'print_job',
      entityId: job.id,
      detail: { billId, jobType: job.type },
      at: new Date(),
    });
    return { jobId: job.id };
  });
}

export async function claimPrintJobs(agentId: string, limit = 10) {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(50, limit));
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const staleProcessingAt = new Date(now.getTime() - 2 * 60_000);
    const rows = await tx
      .select()
      .from(printJobs)
      .where(
        and(
          lt(printJobs.attempts, 5),
          or(
            inArray(printJobs.status, ['queued', 'failed']),
            and(
              eq(printJobs.status, 'processing'),
              lt(printJobs.updatedAt, staleProcessingAt),
            ),
          ),
        ),
      )
      .orderBy(asc(printJobs.createdAt))
      .limit(safeLimit);
    const claimed: PrintJob[] = [];
    for (const row of rows) {
      const [updated] = await tx
        .update(printJobs)
        .set({
          status: 'processing',
          agentId,
          attempts: row.attempts + 1,
          updatedAt: now,
        })
        .where(and(eq(printJobs.id, row.id), inArray(printJobs.status, ['queued', 'failed'])))
        .returning();
      if (updated) claimed.push(updated);
    }
    return claimed;
  });
}

export async function completePrintJob(
  jobId: string,
  agentId: string,
  ok: boolean,
  error?: string | null,
) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [updated] = await tx
      .update(printJobs)
      .set({
        status: ok ? 'printed' : 'failed',
        agentId,
        lastError: ok ? null : error?.slice(0, 500) || 'Gagal cetak.',
        printedAt: ok ? now : null,
        updatedAt: now,
      })
      .where(eq(printJobs.id, jobId))
      .returning();
    if (!updated) throw new Error('Print job tidak ditemukan.');
    return { status: updated.status };
  });
}

export async function retryPrintJob(jobId: string, staffId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [updated] = await tx
      .update(printJobs)
      .set({ status: 'queued', attempts: 0, lastError: null, updatedAt: now })
      .where(eq(printJobs.id, jobId))
      .returning();
    if (!updated) throw new Error('Print job tidak ditemukan.');
    await audit(tx, {
      staffId,
      action: 'print.retry',
      entityType: 'print_job',
      entityId: jobId,
      detail: { type: updated.type },
      at: now,
    });
    return { id: updated.id };
  });
}

export async function getPrintJobPayload(jobId: string) {
  const db = await getDb();
  const outletId = await getActiveOutletId();
  const [job] = await db
    .select()
    .from(printJobs)
    .where(and(eq(printJobs.id, jobId), eq(printJobs.outletId, outletId)))
    .limit(1);
  if (!job) throw new Error('Print job tidak ditemukan.');
  return { id: job.id, type: job.type, title: job.title, payload: job.payload };
}

export async function getPrintQueueData() {
  const db = await getDb();
  const outletId = await getActiveOutletId();
  const rows = await db
    .select()
    .from(printJobs)
    .where(eq(printJobs.outletId, outletId))
    .orderBy(sql`${printJobs.createdAt} desc`)
    .limit(100);
  return {
    agentConfigured: Boolean(process.env.PRINT_AGENT_TOKEN?.trim()),
    jobs: rows.map((job) => ({
      id: job.id,
      type: job.type,
      title: job.title,
      status: job.status,
      attempts: job.attempts,
      lastError: job.lastError,
      referenceId: job.referenceId,
      createdAt: job.createdAt.toISOString(),
      printedAt: job.printedAt?.toISOString() ?? null,
    })),
  };
}
