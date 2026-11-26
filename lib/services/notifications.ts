import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import {
  bills,
  members,
  notificationOutbox,
  orders,
  venueTables,
} from '@/lib/db/schema';
import { formatRp } from '@/lib/billing';
import { getNotificationConfig, deliverNotification, type NotificationChannel } from '@/lib/notifications/provider';
import type { NotificationsData } from '@/lib/types';
import { audit } from './audit';

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
): NotificationChannel {
  const config = getNotificationConfig();
  if (config.emailEnabled && email) return 'email';
  if (config.whatsappEnabled && phone) return 'whatsapp';
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

  const channel = chooseChannel(email, phone);
  const recipient = channel === 'email' ? email! : phone!;
  const body = [
    `Halo ${row.member.name}, terima kasih sudah bermain di Cue & Tap.`,
    '',
    `Bill: ${row.bill.billNumber}`,
    `Meja: ${row.tableCode}`,
    `Total: ${formatRp(row.bill.total)}`,
    `Status: LUNAS`,
    '',
    'Simpan pesan ini sebagai bukti pembayaran.',
  ].join('\n');
  const now = await dbNow(tx);
  const [created] = await tx
    .insert(notificationOutbox)
    .values({
      channel,
      type: 'receipt',
      recipient,
      subject: `Struk ${row.bill.billNumber} · Cue & Tap`,
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

  const channel = chooseChannel(email, phone);
  const recipient = channel === 'email' ? email! : phone!;
  const now = await dbNow(tx);
  const [created] = await tx
    .insert(notificationOutbox)
    .values({
      channel,
      type: 'order_ready',
      recipient,
      subject: `Pesanan ${row.order.orderNumber} siap · Cue & Tap`,
      body: `Halo ${row.member.name}, pesanan ${row.order.orderNumber} di meja ${row.tableCode} sudah siap diantar.`,
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

export async function getNotificationsData(): Promise<NotificationsData> {
  const db = await getDb();
  const [items, pending, sent, failed] = await Promise.all([
    db
      .select({
        notification: notificationOutbox,
        billNumber: bills.billNumber,
        orderNumber: orders.orderNumber,
      })
      .from(notificationOutbox)
      .leftJoin(bills, eq(notificationOutbox.billId, bills.id))
      .leftJoin(orders, eq(notificationOutbox.orderId, orders.id))
      .orderBy(desc(notificationOutbox.createdAt))
      .limit(100),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.status, 'pending')),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.status, 'sent')),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.status, 'failed')),
  ]);

  return {
    config: getNotificationConfig(),
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
