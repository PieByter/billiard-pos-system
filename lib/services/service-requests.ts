import { and, count, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { serviceRequests, venueTables } from '@/lib/db/schema';
import { AppError } from '@/lib/errors';
import { audit } from './audit';

export type ServiceRequestType = 'waiter' | 'bill' | 'assistance';

export async function createServiceRequest(
  token: string,
  type: ServiceRequestType,
  note?: string | null,
) {
  if (!['waiter', 'bill', 'assistance'].includes(type)) {
    throw new AppError('INVALID_TYPE', 'Jenis panggilan tidak valid.');
  }

  const db = await getDb();
  return db.transaction(async (tx) => {
    const [table] = await tx
      .select()
      .from(venueTables)
      .where(and(eq(venueTables.qrToken, token), eq(venueTables.active, true)))
      .limit(1);
    if (!table) throw new AppError('TABLE_NOT_FOUND', 'QR meja tidak valid.');

    const [recent] = await tx
      .select({ total: count() })
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.tableId, table.id),
          gte(serviceRequests.createdAt, sql`now() - interval '5 minutes'`),
        ),
      );
    if ((recent?.total ?? 0) >= 3) {
      throw new AppError('RATE_LIMITED', 'Panggilan terlalu sering. Tunggu beberapa menit.');
    }

    const [request] = await tx
      .insert(serviceRequests)
      .values({
        tableId: table.id,
        type,
        status: 'open',
        note: note?.trim().slice(0, 240) || null,
      })
      .returning();

    await audit(tx, {
      staffId: null,
      action: 'service.requested',
      entityType: 'service_request',
      entityId: request.id,
      detail: { table: table.code, type, note: note ?? null },
    });

    return { requestId: request.id, tableCode: table.code };
  });
}

export async function resolveServiceRequest(requestId: string, staffId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, requestId))
      .limit(1);
    if (!request) throw new AppError('REQUEST_NOT_FOUND', 'Panggilan tidak ditemukan.');
    if (request.status === 'done') {
      return { requestId, status: 'done' as const };
    }
    const [updated] = await tx
      .update(serviceRequests)
      .set({ status: 'done', resolvedAt: new Date(), resolvedBy: staffId })
      .where(and(eq(serviceRequests.id, requestId), eq(serviceRequests.status, 'open')))
      .returning();
    if (!updated) throw new AppError('REQUEST_RESOLVED', 'Panggilan sudah diselesaikan.');
    await audit(tx, {
      staffId,
      action: 'service.resolved',
      entityType: 'service_request',
      entityId: requestId,
      detail: { type: request.type },
    });
    return { requestId, status: 'done' as const };
  });
}
