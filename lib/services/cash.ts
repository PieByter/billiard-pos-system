import { and, asc, eq, sql } from 'drizzle-orm';
import { dbNow, getDb } from '@/lib/db';
import { cashMovements, shifts } from '@/lib/db/schema';
import { AppError } from '@/lib/errors';
import { getActiveOutletId } from '@/lib/outlet';
import { audit } from './audit';

export type CashMovementType =
  | 'drop'
  | 'petty_cash'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out';

const SIGN: Record<CashMovementType, 1 | -1> = {
  drop: -1,
  petty_cash: -1,
  adjustment: 1,
  transfer_in: 1,
  transfer_out: -1,
};

export async function addCashMovement(
  staffId: string,
  input: { shiftId?: string; type: CashMovementType; amount: number; reason: string },
) {
  const amount = Math.round(Number(input.amount));
  const reason = input.reason.trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('INVALID_AMOUNT', 'Nominal movement kas tidak valid.');
  }
  if (!reason) throw new AppError('REASON_REQUIRED', 'Alasan movement kas wajib diisi.');

  const outletId = await getActiveOutletId();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [shift] = await tx
      .select()
      .from(shifts)
      .where(
        input.shiftId
          ? eq(shifts.id, input.shiftId)
          : and(eq(shifts.status, 'open'), eq(shifts.outletId, outletId)),
      )
      .limit(1);
    if (!shift) throw new AppError('NO_OPEN_SHIFT', 'Tidak ada shift aktif.');
    if (shift.status !== 'open') throw new AppError('SHIFT_CLOSED', 'Shift sudah ditutup.');

    const [created] = await tx
      .insert(cashMovements)
      .values({
        outletId: shift.outletId,
        shiftId: shift.id,
        type: input.type,
        amount: SIGN[input.type] * amount,
        reason,
        createdBy: staffId,
        createdAt: now,
      })
      .returning();
    await audit(tx, {
      staffId,
      action: 'shift.cash_movement',
      entityType: 'shift',
      entityId: shift.id,
      detail: { type: input.type, amount: SIGN[input.type] * amount, reason },
      at: now,
    });
    return { id: created.id, amount: created.amount };
  });
}

export async function listCashMovements(shiftId: string) {
  const db = await getDb();
  return db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.shiftId, shiftId))
    .orderBy(asc(cashMovements.createdAt));
}

export async function cashMovementTotalForShift(shiftId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${cashMovements.amount}),0)::int` })
    .from(cashMovements)
    .where(eq(cashMovements.shiftId, shiftId));
  return row?.total ?? 0;
}
