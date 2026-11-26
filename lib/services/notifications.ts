import { and, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import {
  bills,
  members,
  notificationOutbox,
  notificationTemplates,
  orders,
  reservations,
  venueTables,
  type Member,
} from '@/lib/db/schema';
import { formatRp } from '@/lib/billing';
import { getNotificationConfig, deliverNotification, type NotificationChannel } from '@/lib/notifications/provider';
import { getActiveOutletId } from '@/lib/outlet';
import type { NotificationTemplateView, NotificationsData } from '@/lib/types';
import { audit } from './audit';

type TemplateKey = NotificationTemplateView['templateKey'];

type TemplateDefinition = {
  name: string;
  subject: string;
  body: string;
};

const DEFAULT_TEMPLATES: Record<TemplateKey, TemplateDefinition> = {
  receipt: {
    name: 'E-receipt bill',
    subject: 'Struk {{billNumber}} · Cue & Tap',
    body: [
      'Halo {{memberName}}, terima kasih sudah bermain di Cue & Tap.',
      '',
      'Bill: {{billNumber}}',
      'Meja: {{tableCode}}',
      'Total: {{total}}',
      'Status: LUNAS',
      '',
      'Simpan pesan ini sebagai bukti pembayaran.',
    ].join('\n'),
  },
  order_ready: {
    name: 'Order siap',
    subject: 'Pesanan {{orderNumber}} siap · Cue & Tap',
    body: 'Halo {{memberName}}, pesanan {{orderNumber}} di meja {{tableCode}} sudah siap diantar.',
  },
  reservation: {
    name: 'Konfirmasi reservasi',
    subject: 'Reservasi {{reservationCode}} · Cue & Tap',
    body: 'Halo {{guestName}}, reservasi {{reservationCode}} di meja {{tableCode}} pada {{startAt}} sudah dikonfirmasi.',
  },
  reservation_reminder: {
    name: 'Reminder reservasi',
    subject: 'Reminder reservasi {{reservationCode}} · Cue & Tap',
    body: 'Halo {{guestName}}, reservasi {{reservationCode}} di meja {{tableCode}} dimulai {{startAt}}. Sampai jumpa!',
  },
  test: {
    name: 'Test notifikasi',
    subject: 'Test notifikasi Cue & Tap',
    body: 'Halo {{memberName}}, ini pesan test dari Cue & Tap.',
  },
};

export function renderNotificationTemplate(
  body: string,
  variables: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

async function getTemplate(
  tx: DbTransaction,
  outletId: string,
  templateKey: TemplateKey,
): Promise<{
  subject: string;
  body: string;
  channel: NotificationChannel | null;
}> {
  const [row] = await tx
    .select()
    .from(notificationTemplates)
    .where(
      and(
        eq(notificationTemplates.outletId, outletId),
        eq(notificationTemplates.templateKey, templateKey),
        eq(notificationTemplates.active, true),
      ),
    )
    .limit(1);
  const fallback = DEFAULT_TEMPLATES[templateKey];
  return {
    subject: row?.subject ?? fallback.subject,
    body: row?.body ?? fallback.body,
    channel: row?.channel ?? null,
  };
}

async function receiptRecipient(tx: DbTransaction, billId: string) {
  const [row] = await tx
    .select({
      bill: bills,
      tableCode: venueTables.code,
      member: members,
    })
    .from(bills)
    .innerJoin(venueTables, eq(bills.tableId, venueTables.id))
    .leftJoin(members, eq(bills.memberId, members.id))
    .where(eq(bills.id, billId))
    .limit(1);
  return row ?? null;
}

function chooseChannel(
  email: string | null | undefined,
  phone: string | null | undefined,
  member?: Member | null,
  preferred?: NotificationChannel | null,
): NotificationChannel {
  const config = getNotificationConfig();
  const emailAllowed = Boolean(email) && member?.notifyEmail !== false;
  const phoneAllowed = Boolean(phone) && member?.notifyWhatsapp !== false;
  if (preferred === 'email' && config.emailEnabled && emailAllowed) return 'email';
  if (preferred === 'whatsapp' && config.whatsappEnabled && phoneAllowed) return 'whatsapp';
  if (preferred === 'log') return 'log';
  if (config.emailEnabled && emailAllowed) return 'email';
  if (config.whatsappEnabled && phoneAllowed) return 'whatsapp';
  return 'log';
}

export async function enqueueReceiptForBill(tx: DbTransaction, billId: string) {
  const row = await receiptRecipient(tx, billId);
  if (!row?.member || !row.member.consent) return null;
  const email = row.member.email;
  const phone = row.member.phone;
  if (!email && !phone) return null;
  const [existing] = await tx
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(and(eq(notificationOutbox.billId, billId), eq(notificationOutbox.type, 'receipt')))
    .limit(1);
  if (existing) return null;

  const template = await getTemplate(tx, row.bill.outletId, 'receipt');
  const channel = chooseChannel(email, phone, row.member, template.channel);
  if (channel === 'email' && !row.member.notifyEmail) return null;
  if (channel === 'whatsapp' && !row.member.notifyWhatsapp) return null;
  const recipient = channel === 'email' ? email! : phone!;
  const variables = {
    memberName: row.member.name,
    billNumber: row.bill.billNumber,
    tableCode: row.tableCode,
    total: formatRp(row.bill.total),
    status: 'LUNAS',
  };
  const body = renderNotificationTemplate(template.body, variables);
  const now = await dbNow(tx);
  const [created] = await tx
    .insert(notificationOutbox)
    .values({
      outletId: row.bill.outletId,
      channel,
      type: 'receipt',
      templateKey: 'receipt',
      recipient,
      subject: renderNotificationTemplate(template.subject, variables),
      body,
      billId,
      memberId: row.member.id,
      metadata: { billNumber: row.bill.billNumber, total: row.bill.total },
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await audit(tx, {
    staffId: null,
    action: 'notification.receipt_queued',
    entityType: 'bill',
    entityId: billId,
    detail: { channel, recipient, notificationId: created.id },
    at: now,
  });
  return created;
}

export async function enqueueOrderReadyNotification(tx: DbTransaction, orderId: string) {
  const [row] = await tx
    .select({
      order: orders,
      bill: bills,
      tableCode: venueTables.code,
      member: members,
    })
    .from(orders)
    .innerJoin(bills, eq(orders.billId, bills.id))
    .innerJoin(venueTables, eq(orders.tableId, venueTables.id))
    .leftJoin(members, eq(bills.memberId, members.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row?.member || !row.member.consent) return null;
  const email = row.member.email;
  const phone = row.member.phone;
  if (!email && !phone) return null;
  const [existing] = await tx
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.orderId, orderId),
        eq(notificationOutbox.type, 'order_ready'),
      ),
    )
    .limit(1);
  if (existing) return null;

  const template = await getTemplate(tx, row.bill.outletId, 'order_ready');
  const channel = chooseChannel(email, phone, row.member, template.channel);
  if (channel === 'email' && !row.member.notifyEmail) return null;
  if (channel === 'whatsapp' && !row.member.notifyWhatsapp) return null;
  const recipient = channel === 'email' ? email! : phone!;
  const variables = {
    memberName: row.member.name,
    orderNumber: row.order.orderNumber,
    tableCode: row.tableCode,
  };
  const now = await dbNow(tx);
  const [created] = await tx
    .insert(notificationOutbox)
    .values({
      outletId: row.bill.outletId,
      channel,
      type: 'order_ready',
      templateKey: 'order_ready',
      recipient,
      subject: renderNotificationTemplate(template.subject, variables),
      body: renderNotificationTemplate(template.body, variables),
      orderId,
      billId: row.bill.id,
      memberId: row.member.id,
      metadata: { orderNumber: row.order.orderNumber },
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return created;
}

export async function processNotificationOutbox(limit = 20) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        inArray(notificationOutbox.status, ['pending', 'failed']),
        lt(notificationOutbox.attempts, 5),
      ),
    )
    .orderBy(desc(notificationOutbox.createdAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await deliverNotification({
        channel: row.channel,
        recipient: row.recipient,
        subject: row.subject,
        body: row.body,
      });
      const now = await dbNow(db);
      if (result.ok) {
        sent += 1;
        await db
          .update(notificationOutbox)
          .set({
            status: 'sent',
            attempts: row.attempts + 1,
            sentAt: now,
            updatedAt: now,
            lastError: null,
          })
          .where(eq(notificationOutbox.id, row.id));
      } else {
        failed += 1;
        await db
          .update(notificationOutbox)
          .set({
            status: 'failed',
            attempts: row.attempts + 1,
            lastError: result.error ?? 'Gagal kirim.',
            updatedAt: now,
          })
          .where(eq(notificationOutbox.id, row.id));
      }
    } catch (error) {
      failed += 1;
      await db
        .update(notificationOutbox)
        .set({
          status: 'failed',
          attempts: row.attempts + 1,
          lastError: error instanceof Error ? error.message : 'Gagal kirim.',
          updatedAt: new Date(),
        })
        .where(eq(notificationOutbox.id, row.id));
    }
  }
  return { processed: rows.length, sent, failed };
}

export async function retryNotification(notificationId: string) {
  const db = await getDb();
  const [updated] = await db
    .update(notificationOutbox)
    .set({ status: 'pending', attempts: 0, lastError: null, updatedAt: new Date() })
    .where(eq(notificationOutbox.id, notificationId))
    .returning();
  return { id: updated?.id ?? notificationId };
}

export async function saveNotificationTemplate(
  staffId: string,
  input: {
    templateKey: TemplateKey;
    name: string;
    channel?: NotificationChannel | null;
    subject?: string | null;
    body: string;
    active?: boolean;
  },
) {
  const name = input.name.trim();
  const body = input.body.trim();
  if (name.length < 2) throw new Error('Nama template wajib diisi.');
  if (body.length < 5) throw new Error('Isi template terlalu pendek.');
  const outletId = await getActiveOutletId();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [saved] = await tx
      .insert(notificationTemplates)
      .values({
        outletId,
        templateKey: input.templateKey,
        name,
        channel: input.channel ?? null,
        subject: input.subject?.trim() || null,
        body,
        active: input.active ?? true,
        updatedBy: staffId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [notificationTemplates.outletId, notificationTemplates.templateKey],
        set: {
          name,
          channel: input.channel ?? null,
          subject: input.subject?.trim() || null,
          body,
          active: input.active ?? true,
          updatedBy: staffId,
          updatedAt: now,
        },
      })
      .returning();
    await audit(tx, {
      staffId,
      action: 'notification_template.saved',
      entityType: 'notification_template',
      entityId: saved.id,
      detail: { templateKey: input.templateKey, channel: input.channel ?? null },
      at: now,
    });
    return { id: saved.id };
  });
}

export async function enqueueReservationReminder(reservationId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [row] = await tx
      .select({ reservation: reservations, tableCode: venueTables.code })
      .from(reservations)
      .innerJoin(venueTables, eq(reservations.tableId, venueTables.id))
      .where(eq(reservations.id, reservationId))
      .limit(1);
    if (!row) return null;
    if (!['pending', 'confirmed'].includes(row.reservation.status)) return null;
    if (!row.reservation.phone) return null;
    if (row.reservation.startAt < now) return null;
    if (row.reservation.startAt.getTime() > now.getTime() + 24 * 60 * 60_000) return null;
    const [existing] = await tx
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.type, 'reservation_reminder'),
          sql`${notificationOutbox.metadata}->>'reservationId' = ${row.reservation.id}`,
        ),
      )
      .limit(1);
    if (existing) return null;

    const template = await getTemplate(tx, row.reservation.outletId, 'reservation_reminder');
    const channel = chooseChannel(null, row.reservation.phone, null, template.channel);
    const startAt = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(row.reservation.startAt);
    const variables = {
      guestName: row.reservation.guestName,
      reservationCode: row.reservation.code,
      tableCode: row.tableCode,
      startAt,
    };
    const [created] = await tx
      .insert(notificationOutbox)
      .values({
        outletId: row.reservation.outletId,
        channel,
        type: 'reservation_reminder',
        templateKey: 'reservation_reminder',
        recipient: row.reservation.phone,
        subject: renderNotificationTemplate(template.subject, variables),
        body: renderNotificationTemplate(template.body, variables),
        metadata: { reservationId: row.reservation.id, code: row.reservation.code },
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created;
  });
}

export async function runNotificationCron() {
  const db = await getDb();
  const now = await dbNow(db);
  const upcoming = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        inArray(reservations.status, ['pending', 'confirmed']),
        gte(reservations.startAt, now),
        lte(reservations.startAt, new Date(now.getTime() + 24 * 60 * 60_000)),
        sql`${reservations.phone} is not null`,
      ),
    )
    .limit(100);
  let reminders = 0;
  for (const row of upcoming) {
    const created = await enqueueReservationReminder(row.id);
    if (created) reminders += 1;
  }
  const processed = await processNotificationOutbox(50);
  return { reminders, ...processed };
}

export async function getNotificationsData(): Promise<NotificationsData> {
  const db = await getDb();
  const outletId = await getActiveOutletId();
  const [items, pending, sent, failed, templateRows] = await Promise.all([
    db
      .select({
        notification: notificationOutbox,
        billNumber: bills.billNumber,
        orderNumber: orders.orderNumber,
      })
      .from(notificationOutbox)
      .leftJoin(bills, eq(notificationOutbox.billId, bills.id))
      .leftJoin(orders, eq(notificationOutbox.orderId, orders.id))
      .where(eq(notificationOutbox.outletId, outletId))
      .orderBy(desc(notificationOutbox.createdAt))
      .limit(100),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.status, 'pending'), eq(notificationOutbox.outletId, outletId))),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.status, 'sent'), eq(notificationOutbox.outletId, outletId))),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.status, 'failed'), eq(notificationOutbox.outletId, outletId))),
    db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.outletId, outletId)),
  ]);
  const templateByKey = new Map(templateRows.map((row) => [row.templateKey, row]));
  const templates: NotificationTemplateView[] = (
    Object.keys(DEFAULT_TEMPLATES) as TemplateKey[]
  ).map((key) => {
    const custom = templateByKey.get(key);
    if (custom) {
      return {
        id: custom.id,
        templateKey: key,
        name: custom.name,
        channel: custom.channel,
        subject: custom.subject,
        body: custom.body,
        active: custom.active,
        isDefault: false,
      };
    }
    return {
      id: null,
      templateKey: key,
      name: DEFAULT_TEMPLATES[key].name,
      channel: null,
      subject: DEFAULT_TEMPLATES[key].subject,
      body: DEFAULT_TEMPLATES[key].body,
      active: true,
      isDefault: true,
    };
  });

  return {
    config: getNotificationConfig(),
    templates,
    stats: {
      pending: pending[0]?.total ?? 0,
      sent: sent[0]?.total ?? 0,
      failed: failed[0]?.total ?? 0,
    },
    items: items.map((row) => ({
      id: row.notification.id,
      channel: row.notification.channel,
      type: row.notification.type,
      recipient: row.notification.recipient,
      subject: row.notification.subject,
      body: row.notification.body,
      status: row.notification.status,
      attempts: row.notification.attempts,
      lastError: row.notification.lastError,
      billNumber: row.billNumber,
      orderNumber: row.orderNumber,
      createdAt: row.notification.createdAt.toISOString(),
      sentAt: row.notification.sentAt?.toISOString() ?? null,
    })),
  };
}
