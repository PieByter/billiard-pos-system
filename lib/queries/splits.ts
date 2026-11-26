import { asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { billSplitItems, billSplits } from '@/lib/db/schema';
import type { BillSplitItemView, SplitBillData } from '@/lib/types';
import { getBillPrintData } from './print';

export async function getSplitPrintData(splitId: string) {
  const db = await getDb();
  const [split] = await db.select().from(billSplits).where(eq(billSplits.id, splitId)).limit(1);
  if (!split) return null;
  const data = await getSplitBillData(split.billId);
  if (!data) return null;
  const selected = data.splits.find((item) => item.id === splitId);
  if (!selected) return null;
  return { data, split: selected };
}

export async function getSplitBillData(billId: string): Promise<SplitBillData | null> {
  const printData = await getBillPrintData(billId);
  if (!printData) return null;

  const db = await getDb();
  const splitRows = await db
    .select()
    .from(billSplits)
    .where(eq(billSplits.billId, billId))
    .orderBy(asc(billSplits.createdAt));
  const splitIds = splitRows.map((split) => split.id);
  const allItemRows = splitIds.length
    ? await db
        .select()
        .from(billSplitItems)
        .where(inArray(billSplitItems.splitId, splitIds))
        .orderBy(asc(billSplitItems.createdAt))
    : [];
  const itemsBySplit = new Map<string, typeof allItemRows>();
  for (const item of allItemRows) {
    const list = itemsBySplit.get(item.splitId) ?? [];
    list.push(item);
    itemsBySplit.set(item.splitId, list);
  }

  const orderItemsById = new Map(
    printData.bill.orders.flatMap((order) => order.items).map((item) => [item.id, item]),
  );
  const sessionsById = new Map(
    printData.bill.sessions.map((session, index) => [
      session.id,
      { session, index },
    ]),
  );
  const paymentsBySplit = new Map<string, number>();
  for (const payment of printData.payments) {
    if (!payment.billSplitId) continue;
    paymentsBySplit.set(
      payment.billSplitId,
      (paymentsBySplit.get(payment.billSplitId) ?? 0) + payment.amount,
    );
  }

  return {
    bill: printData.bill,
    table: {
      code: printData.table.code,
      zone: printData.table.zone,
      kind: printData.table.kind,
    },
    serverNow: printData.printedAt,
    payments: printData.payments,
    splits: splitRows.map((split) => {
      const items: BillSplitItemView[] = (itemsBySplit.get(split.id) ?? []).map((item) => {
        if (item.itemType === 'session') {
          const sessionEntry = item.sessionId ? sessionsById.get(item.sessionId) : null;
          return {
            id: item.id,
            type: 'session' as const,
            refId: item.sessionId ?? '',
            name: sessionEntry ? `Sesi Billiard #${sessionEntry.index + 1}` : 'Sesi Billiard',
            qty: 1,
            amount: item.amount,
          };
        }
        const orderItem = item.orderItemId ? orderItemsById.get(item.orderItemId) : null;
        return {
          id: item.id,
          type: 'order_item' as const,
          refId: item.orderItemId ?? '',
          name: orderItem?.name ?? 'Item',
          qty: orderItem?.qty ?? 1,
          amount: item.amount,
        };
      });
      return {
        id: split.id,
        label: split.label,
        status: split.status,
        subtotal: split.subtotal,
        discountAmount: split.discountAmount,
        taxAmount: split.taxAmount,
        serviceAmount: split.serviceAmount,
        total: split.total,
        paidAmount: paymentsBySplit.get(split.id) ?? 0,
        paidAt: split.paidAt?.toISOString() ?? null,
        items,
      };
    }),
  };
}
