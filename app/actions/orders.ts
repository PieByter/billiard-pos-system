'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { venueTables } from '@/lib/db/schema';
import { AppError } from '@/lib/errors';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  approveOrder,
  markOrderPreparing,
  markOrderServed,
  markStationReady,
  placeOrder,
  rejectOrder,
  toggleOrderItemDone,
  type PlaceOrderResult,
} from '@/lib/services/orders';
import {
  createServiceRequest,
  resolveServiceRequest,
  type ServiceRequestType,
} from '@/lib/services/service-requests';
import type { CartLine } from '@/lib/types';

const cartLineSchema = z.object({
  menuItemId: z.string().uuid('Item menu tidak valid.'),
  qty: z.coerce.number().int().min(1).max(50),
  note: z.string().max(240).optional(),
});

const cartSchema = z.array(cartLineSchema).min(1, 'Keranjang masih kosong.').max(30);

async function resolveTableIdByToken(token: string): Promise<string> {
  const parsed = parseOrThrow(
    z.object({ token: z.string().min(6).max(120) }),
    { token },
  );
  const db = await getDb();
  const [table] = await db
    .select({ id: venueTables.id })
    .from(venueTables)
    .where(and(eq(venueTables.qrToken, parsed.token), eq(venueTables.active, true)))
    .limit(1);
  if (!table) throw new AppError('TABLE_NOT_FOUND', 'QR meja tidak valid atau sudah diganti.');
  return table.id;
}

export async function placeCashierOrderAction(input: {
  tableId: string;
  items: CartLine[];
  note?: string | null;
  idempotencyKey?: string;
}): Promise<ActionResult<PlaceOrderResult>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        tableId: z.string().uuid(),
        items: cartSchema,
        note: z.string().max(500).optional().nullable(),
        idempotencyKey: z.string().min(8).max(120).optional(),
      }),
      input,
    );
    const result = await placeOrder({
      actor: { type: 'staff', id: staff.id, role: staff.role as 'owner' | 'cashier' },
      tableId: data.tableId,
      idempotencyKey: data.idempotencyKey ?? crypto.randomUUID(),
      items: data.items,
      note: data.note,
    });
    revalidateOps();
    return result;
  });
}

export async function placeCustomerOrderAction(input: {
  token: string;
  items: CartLine[];
  idempotencyKey: string;
  note?: string | null;
}): Promise<ActionResult<PlaceOrderResult>> {
  return runAction(async () => {
    const data = parseOrThrow(
      z.object({
        token: z.string().min(6).max(120),
        items: cartSchema,
        idempotencyKey: z.string().min(8).max(120),
        note: z.string().max(500).optional().nullable(),
      }),
      input,
    );
    const tableId = await resolveTableIdByToken(data.token);
    const result = await placeOrder({
      actor: { type: 'customer' },
      tableId,
      idempotencyKey: data.idempotencyKey,
      items: data.items,
      note: data.note,
    });
    revalidateOps();
    return result;
  });
}

export async function approveOrderAction(orderId: string): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const result = await approveOrder(orderId, staff.id);
    revalidateOps();
    return result;
  });
}

export async function rejectOrderAction(
  orderId: string,
  reason?: string,
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const result = await rejectOrder(orderId, staff.id, reason);
    revalidateOps();
    return result;
  });
}

export async function startPreparingAction(
  orderId: string,
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction();
    const result = await markOrderPreparing(orderId, staff.id);
    revalidateOps();
    return result;
  });
}

export async function toggleOrderItemAction(
  itemId: string,
  done: boolean,
): Promise<ActionResult<{ status: string; allDone: boolean }>> {
  return runAction(async () => {
    const staff = await requireStaffAction();
    const result = await toggleOrderItemDone(itemId, Boolean(done), staff.id);
    revalidateOps();
    return result;
  });
}

export async function markStationReadyAction(
  orderId: string,
  station: 'kitchen' | 'bar',
): Promise<ActionResult<{ status: string; allDone: boolean }>> {
  return runAction(async () => {
    const staff = await requireStaffAction();
    if (station !== 'kitchen' && station !== 'bar') {
      throw new AppError('INVALID_STATION', 'Station tidak valid.');
    }
    const result = await markStationReady(orderId, station, staff.id);
    revalidateOps();
    return result;
  });
}

export async function markOrderServedAction(
  orderId: string,
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction();
    const result = await markOrderServed(orderId, staff.id);
    revalidateOps();
    return result;
  });
}

export async function callWaiterAction(input: {
  token: string;
  type: ServiceRequestType;
  note?: string | null;
}): Promise<ActionResult<{ requestId: string; tableCode: string }>> {
  return runAction(async () => {
    const data = parseOrThrow(
      z.object({
        token: z.string().min(6).max(120),
        type: z.enum(['waiter', 'bill', 'assistance']),
        note: z.string().max(240).optional().nullable(),
      }),
      input,
    );
    const result = await createServiceRequest(data.token, data.type, data.note);
    revalidateOps();
    return result;
  });
}

export async function resolveServiceRequestAction(
  requestId: string,
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction();
    const result = await resolveServiceRequest(requestId, staff.id);
    revalidateOps();
    return result;
  });
}
