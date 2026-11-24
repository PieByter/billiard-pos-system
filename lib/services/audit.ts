import type { DbTransaction } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';

export type AuditInput = {
  staffId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail?: Record<string, unknown>;
  at?: Date;
};

/** Audit log append-only. Semua aksi sensitif wajib memanggil ini. */
export async function audit(tx: DbTransaction, input: AuditInput): Promise<void> {
  await tx.insert(auditLog).values({
    staffId: input.staffId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    detail: input.detail,
    createdAt: input.at ?? new Date(),
  });
}
