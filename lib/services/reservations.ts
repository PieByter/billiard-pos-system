import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { dbNow, getDb } from '@/lib/db';
import {
  bills,
  billiardSessions,
  reservations,
  venueTables,
  waitlistEntries,
} from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { reservationCode, waitlistCode } from '@/lib/ids';
import { audit } from './audit';
import { openCafeBill, startBilliardSession } from './sessions';

export type ReservationInput = {
  tableId: string;
  guestName: string;
  phone?: string | null;
  partySize: number;
  date: string;
  startTime: string;
  durationMinutes: number;
  depositAmount?: number;
  note?: string | null;
};

export type WaitlistInput = {
  guestName: string;
  phone?: string | null;
  partySize: number;
  preference: 'billiard' | 'cafe';
  estimatedWaitMinutes?: number;
  note?: string | null;
};

function jakartaDateTime(date: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError('INVALID_DATE', 'Tanggal reservasi tidak valid.');
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new AppError('INVALID_TIME', 'Jam reservasi tidak valid.');
  }
  const value = new Date(`${date}T${time}:00+07:00`);
  if (Number.isNaN(value.getTime())) {
    throw new AppError('INVALID_DATE', 'Tanggal/jam reservasi tidak valid.');
  }
  return value;
}

function cleanPhone(phone?: string | null) {
  return phone?.trim().slice(0, 30) || null;
}

export async function createReservation(staffId: string, input: ReservationInput) {
  const guestName = input.guestName.trim().slice(0, 80);
  if (guestName.length < 2) throw new AppError('INVALID_NAME', 'Nama tamu wajib diisi.');
  if (input.partySize < 1 || input.partySize > 30) {
    throw new AppError('INVALID_PARTY', 'Jumlah pax tidak valid.');
  }
  if (input.durationMinutes < 15 || input.durationMinutes > 480) {
    throw new AppError('INVALID_DURATION', 'Durasi reservasi harus 15–480 menit.');
  }
  const startAt = jakartaDateTime(input.date, input.startTime);
  const endAt = new Date(startAt.getTime() + input.durationMinutes * 60_000);
  const depositAmount = Math.max(0, Math.round(input.depositAmount ?? 0));

  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      const [table] = await tx
        .select()
        .from(venueTables)
        .where(and(eq(venueTables.id, input.tableId), eq(venueTables.active, true)))
        .limit(1);
      if (!table) throw new AppError('TABLE_NOT_FOUND', 'Meja tidak ditemukan.');
      if (input.partySize > table.capacity) {
        throw new AppError(
          'PARTY_TOO_LARGE',
          `Kapasitas meja ${table.code} hanya ${table.capacity} pax.`,
        );
      }
      if (startAt.getTime() < now.getTime() - 5 * 60_000) {
        throw new AppError('INVALID_DATE', 'Reservasi tidak bisa dibuat untuk waktu yang sudah lewat.');
      }

      const [conflict] = await tx
        .select({ id: reservations.id, code: reservations.code })
        .from(reservations)
        .where(
          and(
            eq(reservations.tableId, table.id),
            inArray(reservations.status, ['pending', 'confirmed', 'checked_in']),
            sql`${reservations.startAt} < ${endAt.toISOString()} and ${reservations.endAt} > ${startAt.toISOString()}`,
          ),
        )
        .limit(1);
      if (conflict) {
        throw new AppError(
          'RESERVATION_CONFLICT',
          `Meja ${table.code} sudah dibooking (${conflict.code}) pada jam tersebut.`,
        );
      }

      let created: typeof reservations.$inferSelect | null = null;
      for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
        const [row] = await tx
          .insert(reservations)
          .values({
            code: reservationCode(),
            tableId: table.id,
            guestName,
            phone: cleanPhone(input.phone),
            partySize: input.partySize,
            startAt,
            endAt,
            status: 'confirmed',
            depositAmount,
            depositStatus: depositAmount > 0 ? 'pending' : 'none',
            note: input.note?.trim().slice(0, 500) || null,
            createdBy: staffId,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning();
        created = row ?? null;
      }
      if (!created) throw new AppError('RESERVATION_CODE', 'Gagal membuat kode reservasi.');

      await audit(tx, {
        staffId,
        action: 'reservation.created',
        entityType: 'reservation',
        entityId: created.id,
        detail: {
          code: created.code,
          table: table.code,
          guest: guestName,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          depositAmount,
        },
        at: now,
      });

      return { id: created.id, code: created.code, tableCode: table.code };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('RESERVATION_CODE', 'Kode reservasi bentrok. Coba lagi.');
    }
    throw error;
  }
}

export async function setReservationStatus(
  staffId: string,
  reservationId: string,
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show',
) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [reservation] = await tx
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1);
    if (!reservation) throw new AppError('RESERVATION_NOT_FOUND', 'Reservasi tidak ditemukan.');
    if (reservation.status === 'checked_in' && status !== 'completed') {
      throw new AppError('RESERVATION_CHECKED_IN', 'Tamu sudah check-in; selesaikan sesi terlebih dahulu.');
    }
    if (status === 'completed' && reservation.status !== 'checked_in') {
      throw new AppError('RESERVATION_NOT_CHECKED_IN', 'Check-in tamu sebelum menandai selesai.');
    }
    if (['cancelled', 'no_show', 'completed'].includes(reservation.status)) {
      throw new AppError('RESERVATION_LOCKED', 'Reservasi ini sudah final.');
    }

    const patch: Partial<typeof reservations.$inferInsert> = {
      status,
      updatedAt: now,
    };
    if (status === 'cancelled') patch.cancelledAt = now;
    if (status === 'no_show' && reservation.depositStatus === 'paid') {
      patch.depositStatus = 'forfeited';
    }
    const [updated] = await tx
      .update(reservations)
      .set(patch)
      .where(eq(reservations.id, reservationId))
      .returning();

    await audit(tx, {
      staffId,
      action: `reservation.${status}`,
      entityType: 'reservation',
      entityId: reservationId,
      detail: { code: reservation.code, previous: reservation.status },
      at: now,
    });
    return { status: updated.status, depositStatus: updated.depositStatus };
  });
}

export async function setReservationDeposit(
  staffId: string,
  reservationId: string,
  status: 'pending' | 'paid' | 'refunded' | 'forfeited',
) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [reservation] = await tx
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1);
    if (!reservation) throw new AppError('RESERVATION_NOT_FOUND', 'Reservasi tidak ditemukan.');
    if (reservation.depositAmount <= 0) {
      throw new AppError('NO_DEPOSIT', 'Reservasi ini tidak punya deposit.');
    }
    const [updated] = await tx
      .update(reservations)
      .set({ depositStatus: status, updatedAt: now })
      .where(eq(reservations.id, reservationId))
      .returning();
    await audit(tx, {
      staffId,
      action: 'reservation.deposit_updated',
      entityType: 'reservation',
      entityId: reservationId,
      detail: { code: reservation.code, status, amount: reservation.depositAmount },
      at: now,
    });
    return { depositStatus: updated.depositStatus };
  });
}

export async function checkInReservation(staffId: string, reservationId: string) {
  const db = await getDb();
  const [reservation] = await db
    .select({ reservation: reservations, table: venueTables })
    .from(reservations)
    .innerJoin(venueTables, eq(reservations.tableId, venueTables.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!reservation) throw new AppError('RESERVATION_NOT_FOUND', 'Reservasi tidak ditemukan.');
  if (!['pending', 'confirmed'].includes(reservation.reservation.status)) {
    throw new AppError('RESERVATION_LOCKED', 'Reservasi tidak bisa check-in pada status ini.');
  }

  const [openBill] = await db
    .select({ id: bills.id })
    .from(bills)
    .where(and(eq(bills.tableId, reservation.table.id), eq(bills.status, 'open')))
    .limit(1);
  if (openBill) throw new AppError('TABLE_OCCUPIED', 'Meja masih punya bill aktif.');
  const [activeSession] = await db
    .select({ id: billiardSessions.id })
    .from(billiardSessions)
    .where(
      and(
        eq(billiardSessions.tableId, reservation.table.id),
        ne(billiardSessions.status, 'finished'),
      ),
    )
    .limit(1);
  if (activeSession) throw new AppError('TABLE_OCCUPIED', 'Meja masih dipakai sesi aktif.');

  let billId: string | null = null;
  let sessionId: string | null = null;
  if (reservation.table.kind === 'billiard') {
    const started = await startBilliardSession(
      reservation.table.id,
      staffId,
      reservation.reservation.guestName,
    );
    billId = started.billId;
    sessionId = started.sessionId;
  } else {
    const opened = await openCafeBill(
      reservation.table.id,
      staffId,
      reservation.reservation.guestName,
    );
    billId = opened.billId;
  }

  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [updated] = await tx
      .update(reservations)
      .set({
        status: 'checked_in',
        checkedInAt: now,
        billId,
        sessionId,
        updatedAt: now,
      })
      .where(eq(reservations.id, reservationId))
      .returning();

    await audit(tx, {
      staffId,
      action: 'reservation.checked_in',
      entityType: 'reservation',
      entityId: reservationId,
      detail: {
        code: reservation.reservation.code,
        table: reservation.table.code,
        billId,
        sessionId,
      },
      at: now,
    });

    return { reservationId, status: updated.status, billId, sessionId };
  });
}

export async function createWaitlistEntry(staffId: string, input: WaitlistInput) {
  const guestName = input.guestName.trim().slice(0, 80);
  if (guestName.length < 2) throw new AppError('INVALID_NAME', 'Nama tamu wajib diisi.');
  if (input.partySize < 1 || input.partySize > 30) {
    throw new AppError('INVALID_PARTY', 'Jumlah pax tidak valid.');
  }
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [created] = await tx
      .insert(waitlistEntries)
      .values({
        code: waitlistCode(),
        guestName,
        phone: cleanPhone(input.phone),
        partySize: input.partySize,
        preference: input.preference,
        estimatedWaitMinutes: Math.max(0, Math.round(input.estimatedWaitMinutes ?? 15)),
        note: input.note?.trim().slice(0, 500) || null,
        createdBy: staffId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await audit(tx, {
      staffId,
      action: 'waitlist.created',
      entityType: 'waitlist',
      entityId: created.id,
      detail: { code: created.code, guest: guestName, preference: input.preference },
      at: now,
    });
    return { id: created.id, code: created.code };
  });
}

export async function setWaitlistStatus(
  staffId: string,
  entryId: string,
  status: 'called' | 'seated' | 'cancelled' | 'no_show',
) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [entry] = await tx
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, entryId))
      .limit(1);
    if (!entry) throw new AppError('WAITLIST_NOT_FOUND', 'Antrean tidak ditemukan.');
    if (['seated', 'cancelled', 'no_show'].includes(entry.status)) {
      throw new AppError('WAITLIST_LOCKED', 'Antrean ini sudah final.');
    }
    const patch: Partial<typeof waitlistEntries.$inferInsert> = { status, updatedAt: now };
    if (status === 'called') patch.calledAt = now;
    if (status === 'seated') patch.seatedAt = now;
    if (status === 'cancelled') patch.cancelledAt = now;
    const [updated] = await tx
      .update(waitlistEntries)
      .set(patch)
      .where(eq(waitlistEntries.id, entryId))
      .returning();
    await audit(tx, {
      staffId,
      action: `waitlist.${status}`,
      entityType: 'waitlist',
      entityId: entryId,
      detail: { code: entry.code, previous: entry.status },
      at: now,
    });
    return { status: updated.status };
  });
}
