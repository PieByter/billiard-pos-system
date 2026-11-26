import type { DbTransaction } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { getActiveOutletId } from '@/lib/outlet';

export type AuditInput = {
  staffId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail?: Record<string, unknown>;
  outletId?: string;
  at?: Date;
};

/** Audit log append-only. Semua aksi sensitif wajib memanggil ini. */
export async function audit(tx: DbTransaction, input: AuditInput): Promise<void> {
  const outletId = input.outletId ?? (await getActiveOutletId());
  await tx.insert(auditLog).values({
    outletId,
    staffId: input.staffId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    detail: input.detail,
    createdAt: input.at ?? new Date(),
  });
}
