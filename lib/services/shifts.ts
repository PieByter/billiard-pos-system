import { and, count, eq, gte, sql } from 'drizzle-orm';
import { getDb, dbNow } from '@/lib/db';
import { bills, cashMovements, payments, refunds, shifts } from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { audit } from './audit';

export async function openShift(staffId: string, openingCash: number) {
  const cash = Math.round(Number(openingCash));
  if (!Number.isFinite(cash) || cash < 0) {
    throw new AppError('INVALID_CASH', 'Modal kas awal tidak valid.');
  }
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      const [existing] = await tx
        .select({ id: shifts.id })
        .from(shifts)
        .where(eq(shifts.status, 'open'))
        .limit(1);
      if (existing) throw new AppError('SHIFT_ALREADY_OPEN', 'Masih ada shift yang terbuka.');

      const [shift] = await tx
        .insert(shifts)
        .values({
          staffId,
          status: 'open',
          openingCash: cash,
          openedAt: now,
        })
        .returning();

      await audit(tx, {
        staffId,
        action: 'shift.open',
        entityType: 'shift',
        entityId: shift.id,
        detail: { openingCash: cash },
        at: now,
      });

      return { shiftId: shift.id, openingCash: cash };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('SHIFT_ALREADY_OPEN', 'Shift lain baru saja dibuka.');
    }
    throw error;
  }
}

export async function closeShift(
  staffId: string,
  actualCash: number,
  notes?: string | null,
) {
  const actual = Math.round(Number(actualCash));
  if (!Number.isFinite(actual) || actual < 0) {
    throw new AppError('INVALID_CASH', 'Jumlah kas fisik tidak valid.');
  }

  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [shift] = await tx
      .select()
      .from(shifts)
      .where(eq(shifts.status, 'open'))
      .limit(1);
    if (!shift) throw new AppError('NO_OPEN_SHIFT', 'Tidak ada shift yang sedang terbuka.');

    const [openBill] = await tx
      .select({ total: count() })
      .from(bills)
      .where(eq(bills.status, 'open'));
    if ((openBill?.total ?? 0) > 0) {
      throw new AppError(
        'OPEN_BILLS_REMAIN',
        `Masih ada ${openBill?.total} bill open. Tutup semua bill sebelum menutup shift.`,
      );
    }

    const [cashRow] = await tx
      .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
      .from(payments)
      .where(
        and(
          eq(payments.method, 'cash'),
          gte(payments.createdAt, shift.openedAt),
        ),
      );
    const [cashRefundRow] = await tx
      .select({ total: sql<number>`coalesce(sum(${refunds.amount}), 0)::int` })
      .from(refunds)
      .innerJoin(payments, eq(refunds.paymentId, payments.id))
      .where(
        and(
          eq(payments.method, 'cash'),
          gte(refunds.createdAt, shift.openedAt),
        ),
      );

    const [cashMovementRow] = await tx
      .select({ total: sql<number>`coalesce(sum(${cashMovements.amount}),0)::int` })
      .from(cashMovements)
      .where(eq(cashMovements.shiftId, shift.id));
    const cashSales = cashRow?.total ?? 0;
    const cashRefunds = cashRefundRow?.total ?? 0;
    const cashMovementTotal = cashMovementRow?.total ?? 0;
    const expected = shift.openingCash + cashSales - cashRefunds + cashMovementTotal;
    const difference = actual - expected;

    const [closed] = await tx
      .update(shifts)
      .set({
        status: 'closed',
        expectedCash: expected,
        actualCash: actual,
        difference,
        notes: notes?.trim().slice(0, 800) || null,
        closedAt: now,
      })
      .where(and(eq(shifts.id, shift.id), eq(shifts.status, 'open')))
      .returning();

    if (!closed) throw new AppError('SHIFT_CLOSED', 'Shift baru saja ditutup pengguna lain.');

    await audit(tx, {
      staffId,
      action: 'shift.close',
      entityType: 'shift',
      entityId: shift.id,
      detail: {
        openingCash: shift.openingCash,
        cashSales,
        cashRefunds,
        cashMovementTotal,
        expectedCash: expected,
        actualCash: actual,
        difference,
      },
      at: now,
    });

    return {
      shiftId: shift.id,
      expectedCash: expected,
      actualCash: actual,
      difference,
    };
  });
}
