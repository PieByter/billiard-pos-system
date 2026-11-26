import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { dbNow, getDb } from '@/lib/db';
import { reservations, venueTables, waitlistEntries } from '@/lib/db/schema';
import { getActiveOutletId } from '@/lib/outlet';
import type { ReservationsData } from '@/lib/types';

export async function getReservationsData(): Promise<ReservationsData> {
  const db = await getDb();
  const serverNow = await dbNow(db);
  const outletId = await getActiveOutletId();
  const start = new Date(serverNow.getTime() - 7 * 86_400_000);

  const [tableRows, reservationRows, waitlistRows] = await Promise.all([
    db
      .select()
      .from(venueTables)
      .where(and(eq(venueTables.active, true), eq(venueTables.outletId, outletId)))
      .orderBy(asc(venueTables.kind), asc(venueTables.sortOrder)),
    db
      .select({ reservation: reservations, table: venueTables })
      .from(reservations)
      .innerJoin(venueTables, eq(reservations.tableId, venueTables.id))
      .where(and(gte(reservations.startAt, start), eq(reservations.outletId, outletId)))
      .orderBy(asc(reservations.startAt))
      .limit(150),
    db
      .select()
      .from(waitlistEntries)
      .where(
        and(
          gte(waitlistEntries.createdAt, start),
          eq(waitlistEntries.outletId, outletId),
          inArray(waitlistEntries.status, ['waiting', 'called', 'seated', 'cancelled', 'no_show']),
        ),
      )
      .orderBy(asc(waitlistEntries.createdAt))
      .limit(100),
  ]);

  return {
    serverNow: serverNow.toISOString(),
    tables: tableRows.map((table) => ({
      id: table.id,
      code: table.code,
      zone: table.zone,
      kind: table.kind,
      capacity: table.capacity,
    })),
    reservations: reservationRows.map((row) => ({
      id: row.reservation.id,
      code: row.reservation.code,
      tableId: row.table.id,
      tableCode: row.table.code,
      tableZone: row.table.zone,
      tableKind: row.table.kind,
      guestName: row.reservation.guestName,
      phone: row.reservation.phone,
      partySize: row.reservation.partySize,
      startAt: row.reservation.startAt.toISOString(),
      endAt: row.reservation.endAt.toISOString(),
      status: row.reservation.status,
      depositAmount: row.reservation.depositAmount,
      depositStatus: row.reservation.depositStatus,
      note: row.reservation.note,
      billId: row.reservation.billId,
      sessionId: row.reservation.sessionId,
      createdAt: row.reservation.createdAt.toISOString(),
    })),
    waitlist: waitlistRows.map((entry) => ({
      id: entry.id,
      code: entry.code,
      guestName: entry.guestName,
      phone: entry.phone,
      partySize: entry.partySize,
      preference: entry.preference,
      status: entry.status,
      estimatedWaitMinutes: entry.estimatedWaitMinutes,
      note: entry.note,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}
