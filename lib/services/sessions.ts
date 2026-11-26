import { and, eq, ne } from 'drizzle-orm';
import { getDb, dbNow, type DbTransaction } from '@/lib/db';
import {
  billiardSessions,
  bills,
  orders,
  penalties,
  penaltyRules,
  venueTables,
} from '@/lib/db/schema';
import {
  billableElapsedSeconds,
  computeSessionAmount,
  computeSessionAmountFromSeconds,
} from '@/lib/billing';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { ensureOpenBill, recalcBillTotals } from './bill';
import { audit } from './audit';
import { resolveRateForTable } from './rate-schedules';
import { hasBillSplits } from './splits';

export async function startBilliardSession(
  tableId: string,
  staffId: string,
  guestName?: string | null,
  targetMinutes?: number | null,
) {
  const target =
    targetMinutes === null || targetMinutes === undefined
      ? null
      : Math.round(Number(targetMinutes));
  if (target !== null && (target < 15 || target > 720)) {
    throw new AppError('INVALID_TARGET', 'Target durasi harus 15-720 menit.');
  }
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      const resolved = await resolveRateForTable(tx, tableId, now);
      const row = { table: resolved.table, rate: resolved.rate };
      if (row.table.kind !== 'billiard') {
        throw new AppError('WRONG_TABLE_KIND', 'Meja ini bukan meja billiard.');
      }
      if (row.table.maintenanceAt) {
        throw new AppError('TABLE_MAINTENANCE', 'Meja sedang dalam maintenance.');
      }
      if (!row.rate || !row.rate.active) {
        throw new AppError('NO_RATE', 'Meja belum punya tarif billiard aktif.');
      }

      const [active] = await tx
        .select({ id: billiardSessions.id })
        .from(billiardSessions)
        .where(
          and(
            eq(billiardSessions.tableId, tableId),
            ne(billiardSessions.status, 'finished'),
          ),
        )
        .limit(1);
      if (active) {
        throw new AppError('TABLE_ALREADY_RUNNING', `Meja ${row.table.code} sedang berjalan.`);
      }

      const bill = await ensureOpenBill(tx, tableId, staffId);
      if (await hasBillSplits(tx, bill.id)) {
        throw new AppError('BILL_SPLIT_LOCKED', 'Bill sudah di-split. Selesaikan pembayaran split.');
      }
      const cleanGuest = guestName?.trim().slice(0, 80) || null;
      if (cleanGuest && !bill.guestName) {
        await tx.update(bills).set({ guestName: cleanGuest }).where(eq(bills.id, bill.id));
      }

      const [session] = await tx
        .insert(billiardSessions)
        .values({
          outletId: bill.outletId,
          billId: bill.id,
          tableId,
          status: 'running',
          startedAt: now,
          targetMinutes: target,
          ratePerHour: row.rate.pricePerHour,
          minMinutes: row.rate.minMinutes,
          incrementMinutes: row.rate.incrementMinutes,
          startedBy: staffId,
        })
        .returning();

      await tx
        .update(venueTables)
        .set({ needsCleaningAt: null })
        .where(eq(venueTables.id, tableId));

      const { total } = await recalcBillTotals(tx, bill.id, now);

      await audit(tx, {
        staffId,
        action: 'session.start',
        entityType: 'billiard_session',
        entityId: session.id,
        detail: {
          table: row.table.code,
          rate: row.rate.pricePerHour,
          guest: cleanGuest,
          billNumber: bill.billNumber,
          targetMinutes: target,
        },
        at: now,
      });

      return {
        sessionId: session.id,
        billId: bill.id,
        billNumber: bill.billNumber,
        total,
        ratePerHour: row.rate.pricePerHour,
        startedAt: now.toISOString(),
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('TABLE_ALREADY_RUNNING', 'Meja ini baru saja dimulai oleh kasir lain.');
    }
    throw error;
  }
}

export async function pauseBilliardSession(tableId: string, staffId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [session] = await tx
      .select()
      .from(billiardSessions)
      .where(
        and(
          eq(billiardSessions.tableId, tableId),
          ne(billiardSessions.status, 'finished'),
        ),
      )
      .limit(1);
    if (!session) throw new AppError('NO_ACTIVE_SESSION', 'Tidak ada sesi billiard aktif.');
    if (session.status === 'paused') return { sessionId: session.id, status: 'paused' as const };

    await tx
      .update(billiardSessions)
      .set({ status: 'paused', pausedAt: now })
      .where(eq(billiardSessions.id, session.id));
    await recalcBillTotals(tx, session.billId, now);
    await audit(tx, {
      staffId,
      action: 'session.pause',
      entityType: 'billiard_session',
      entityId: session.id,
      detail: { tableId },
      at: now,
    });
    return { sessionId: session.id, status: 'paused' as const };
  });
}

export async function resumeBilliardSession(tableId: string, staffId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [session] = await tx
      .select()
      .from(billiardSessions)
      .where(
        and(
          eq(billiardSessions.tableId, tableId),
          ne(billiardSessions.status, 'finished'),
        ),
      )
      .limit(1);
    if (!session) throw new AppError('NO_ACTIVE_SESSION', 'Tidak ada sesi billiard aktif.');
    if (session.status === 'running') return { sessionId: session.id, status: 'running' as const };

    const pausedExtra = session.pausedAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(session.pausedAt).getTime()) / 1000))
      : 0;
    await tx
      .update(billiardSessions)
      .set({
        status: 'running',
        pausedAt: null,
        pausedSeconds: session.pausedSeconds + pausedExtra,
      })
      .where(eq(billiardSessions.id, session.id));
    await recalcBillTotals(tx, session.billId, now);
    await audit(tx, {
      staffId,
      action: 'session.resume',
      entityType: 'billiard_session',
      entityId: session.id,
      detail: { tableId, pausedExtraSeconds: pausedExtra },
      at: now,
    });
    return { sessionId: session.id, status: 'running' as const };
  });
}

export async function stopBilliardSession(tableId: string, staffId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [session] = await tx
      .select()
      .from(billiardSessions)
      .where(
        and(
          eq(billiardSessions.tableId, tableId),
          ne(billiardSessions.status, 'finished'),
        ),
      )
      .limit(1);
    if (!session) throw new AppError('NO_ACTIVE_SESSION', 'Tidak ada sesi billiard aktif.');
    const [table] = await tx
      .select({ code: venueTables.code, outletId: venueTables.outletId })
      .from(venueTables)
      .where(eq(venueTables.id, tableId))
      .limit(1);

    const pausedExtra = session.pausedAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(session.pausedAt).getTime()) / 1000))
      : 0;
    const totalPaused = session.pausedSeconds + pausedExtra;
    const billed = computeSessionAmount(
      session.startedAt,
      now,
      totalPaused,
      {
        ratePerHour: session.ratePerHour,
        minMinutes: session.minMinutes,
        incrementMinutes: session.incrementMinutes,
      },
    );

    await tx
      .update(billiardSessions)
      .set({
        status: 'finished',
        pausedAt: null,
        pausedSeconds: totalPaused,
        endedAt: now,
        amount: billed.amount,
        endedBy: staffId,
      })
      .where(eq(billiardSessions.id, session.id));

    const overtimePenalty = await applyOvertimePenalty(
      tx,
      {
        id: session.id,
        billId: session.billId,
        targetMinutes: session.targetMinutes,
        actualMinutes: billed.minutes,
        outletId: table?.outletId ?? session.outletId,
        tableCode: table?.code ?? '',
      },
      staffId,
      now,
    );

    const { bill, total } = await recalcBillTotals(tx, session.billId, now);
    await tx
      .update(venueTables)
      .set({ needsCleaningAt: now })
      .where(eq(venueTables.id, tableId));

    await audit(tx, {
      staffId,
      action: 'session.stop',
      entityType: 'billiard_session',
      entityId: session.id,
      detail: {
        table: table?.code,
        billableMinutes: billed.billableMinutes,
        amount: billed.amount,
        billNumber: bill.billNumber,
        overtimePenalty: overtimePenalty?.amount ?? 0,
      },
      at: now,
    });

    return {
      sessionId: session.id,
      billId: session.billId,
      billNumber: bill.billNumber,
      amount: billed.amount,
      billableMinutes: billed.billableMinutes,
      billTotal: total,
      overtimePenalty: overtimePenalty?.amount ?? 0,
      overtimeMinutes: overtimePenalty?.minutes ?? 0,
    };
  });
}

async function applyOvertimePenalty(
  tx: DbTransaction,
  session: {
    id: string;
    billId: string;
    targetMinutes: number | null;
    actualMinutes: number;
    outletId: string;
    tableCode: string;
  },
  staffId: string,
  now: Date,
) {
  if (!session.targetMinutes || session.targetMinutes <= 0) return null;
  const [rule] = await tx
    .select()
    .from(penaltyRules)
    .where(
      and(
        eq(penaltyRules.outletId, session.outletId),
        eq(penaltyRules.type, 'overtime'),
        eq(penaltyRules.active, true),
        eq(penaltyRules.autoApply, true),
      ),
    )
    .limit(1);
  if (!rule) return null;
  const overtimeMinutes =
    session.actualMinutes - session.targetMinutes - Math.max(0, rule.graceMinutes);
  if (overtimeMinutes <= 0) return null;
  const hours = Math.ceil(overtimeMinutes / 60);
  const raw = rule.ratePerHour ? rule.ratePerHour * hours : rule.defaultAmount;
  const amount = Math.min(raw, rule.maxAmount ?? raw);
  if (amount <= 0) return null;

  const [created] = await tx
    .insert(penalties)
    .values({
      outletId: session.outletId,
      billId: session.billId,
      ruleId: rule.id,
      type: 'overtime',
      amount,
      reason: `Overtime ${overtimeMinutes} menit dari target ${session.targetMinutes} menit (meja ${session.tableCode})`,
      status: 'approved',
      approvedBy: staffId,
      autoKey: `session:${session.id}:overtime`,
      autoGenerated: true,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) return null;
  const [bill] = await tx.select().from(bills).where(eq(bills.id, session.billId)).limit(1);
  if (bill) {
    await tx
      .update(bills)
      .set({ penaltyAmount: bill.penaltyAmount + amount })
      .where(eq(bills.id, bill.id));
  }
  await audit(tx, {
    staffId,
    action: 'bill.penalty_auto_overtime',
    entityType: 'billiard_session',
    entityId: session.id,
    detail: {
      billNumber: bill?.billNumber,
      targetMinutes: session.targetMinutes,
      actualMinutes: session.actualMinutes,
      overtimeMinutes,
      amount,
    },
    at: now,
  });
  return { amount, minutes: overtimeMinutes };
}

export async function moveBill(
  fromTableId: string,
  toTableId: string,
  staffId: string,
) {
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      if (fromTableId === toTableId) {
        throw new AppError('SAME_TABLE', 'Meja asal dan tujuan sama.');
      }
      const now = await dbNow(tx);
      const [sourceBill] = await tx
        .select()
        .from(bills)
        .where(and(eq(bills.tableId, fromTableId), eq(bills.status, 'open')))
        .limit(1);
      if (!sourceBill) throw new AppError('NO_OPEN_BILL', 'Meja asal tidak punya bill aktif.');

      const [targetTable] = await tx
        .select()
        .from(venueTables)
        .where(and(eq(venueTables.id, toTableId), eq(venueTables.active, true)))
        .limit(1);
      if (!targetTable) throw new AppError('TABLE_NOT_FOUND', 'Meja tujuan tidak ditemukan.');

      const [targetBill] = await tx
        .select({ id: bills.id })
        .from(bills)
        .where(and(eq(bills.tableId, toTableId), eq(bills.status, 'open')))
        .limit(1);
      if (targetBill) throw new AppError('TABLE_OCCUPIED', 'Meja tujuan masih punya bill aktif.');

      const [targetSession] = await tx
        .select({ id: billiardSessions.id })
        .from(billiardSessions)
        .where(
          and(eq(billiardSessions.tableId, toTableId), ne(billiardSessions.status, 'finished')),
        )
        .limit(1);
      if (targetSession) throw new AppError('TABLE_OCCUPIED', 'Meja tujuan sedang dipakai.');

      await tx.update(bills).set({ tableId: toTableId }).where(eq(bills.id, sourceBill.id));
      await tx
        .update(billiardSessions)
        .set({ tableId: toTableId })
        .where(
          and(
            eq(billiardSessions.billId, sourceBill.id),
            ne(billiardSessions.status, 'finished'),
          ),
        );
      await tx.update(orders).set({ tableId: toTableId }).where(eq(orders.billId, sourceBill.id));
      await recalcBillTotals(tx, sourceBill.id, now);
      await audit(tx, {
        staffId,
        action: 'bill.move_table',
        entityType: 'bill',
        entityId: sourceBill.id,
        detail: { fromTableId, toTableId, billNumber: sourceBill.billNumber },
        at: now,
      });
      return {
        billId: sourceBill.id,
        billNumber: sourceBill.billNumber,
        toTableCode: targetTable.code,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('TABLE_OCCUPIED', 'Meja tujuan baru saja dipakai transaksi lain.');
    }
    throw error;
  }
}

export async function openCafeBill(
  tableId: string,
  staffId: string,
  guestName?: string | null,
) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [table] = await tx
      .select()
      .from(venueTables)
      .where(and(eq(venueTables.id, tableId), eq(venueTables.active, true)))
      .limit(1);
    if (!table) throw new AppError('TABLE_NOT_FOUND', 'Meja tidak ditemukan.');
    if (table.kind !== 'cafe') {
      throw new AppError('WRONG_TABLE_KIND', 'Gunakan Start Sesi untuk meja billiard.');
    }
    if (table.maintenanceAt) {
      throw new AppError('TABLE_MAINTENANCE', 'Meja sedang dalam maintenance.');
    }
    const now = await dbNow(tx);
    const bill = await ensureOpenBill(tx, tableId, staffId);
    const cleanGuest = guestName?.trim().slice(0, 80) || null;
    if (cleanGuest && !bill.guestName) {
      await tx.update(bills).set({ guestName: cleanGuest }).where(eq(bills.id, bill.id));
    }
    await recalcBillTotals(tx, bill.id, now);
    await audit(tx, {
      staffId,
      action: 'bill.open',
      entityType: 'bill',
      entityId: bill.id,
      detail: { table: table.code, billNumber: bill.billNumber, guest: cleanGuest },
      at: now,
    });
    return { billId: bill.id, billNumber: bill.billNumber, tableCode: table.code };
  });
}

export async function markTableReady(tableId: string, staffId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [table] = await tx
      .select({ code: venueTables.code })
      .from(venueTables)
      .where(eq(venueTables.id, tableId))
      .limit(1);
    if (!table) throw new AppError('TABLE_NOT_FOUND', 'Meja tidak ditemukan.');
    await tx
      .update(venueTables)
      .set({ needsCleaningAt: null, maintenanceAt: null, maintenanceNote: null })
      .where(eq(venueTables.id, tableId));
    await audit(tx, {
      staffId,
      action: 'table.ready',
      entityType: 'venue_table',
      entityId: tableId,
      detail: { table: table.code },
      at: now,
    });
    return { tableCode: table.code };
  });
}

/** Helper untuk UI: estimasi live tanpa menyentuh DB. */
export function estimateSessionAt(
  session: {
    startedAt: Date | string;
    pausedAt: Date | string | null;
    pausedSeconds: number;
    ratePerHour: number;
    minMinutes: number;
    incrementMinutes: number;
  },
  at: Date,
) {
  const extraPause = session.pausedAt
    ? Math.max(0, (at.getTime() - new Date(session.pausedAt).getTime()) / 1000)
    : 0;
  const seconds = billableElapsedSeconds(
    session.startedAt,
    at,
    session.pausedSeconds + extraPause,
  );
  return computeSessionAmountFromSeconds(seconds, session);
}
