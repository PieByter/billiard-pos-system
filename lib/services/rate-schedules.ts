import { and, asc, eq } from 'drizzle-orm';
import type { SessionRateSegment } from '@/lib/billing';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import {
  billiardRates,
  tableRateSchedules,
  venueTables,
  type BilliardRate,
  type TableRateSchedule,
  type VenueTable,
} from '@/lib/db/schema';
import { AppError } from '@/lib/errors';
import { minutesToTime, parseTime } from '@/lib/time';
import { audit } from './audit';

const WEEKDAY_LABEL: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export type JakartaClock = { day: number; minutes: number; label: string };

export function jakartaClock(at: Date): JakartaClock {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const day = WEEKDAY_LABEL[get('weekday')] ?? 1;
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return { day, minutes, label: `${get('hour')}:${get('minute')}` };
}

export function timeToMinutes(value: string): number {
  const minutes = parseTime(value);
  if (minutes === null) throw new AppError('INVALID_TIME', 'Jam tidak valid.');
  return minutes;
}

export type ResolvedRate = {
  table: VenueTable;
  rate: BilliardRate | null;
  defaultRate: BilliardRate | null;
  schedule: TableRateSchedule | null;
};

type RateChoice = {
  rate: BilliardRate;
  schedule: TableRateSchedule | null;
};

function chooseRateForClock(
  schedules: Array<{ schedule: TableRateSchedule; rate: BilliardRate }>,
  defaultRate: BilliardRate | null,
  clock: JakartaClock,
): RateChoice | null {
  const matching = schedules
    .filter(({ schedule, rate }) => {
      const days = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [];
      return (
        rate.active &&
        days.includes(clock.day) &&
        clock.minutes >= schedule.startMinute &&
        clock.minutes < schedule.endMinute
      );
    })
    .sort(
      (a, b) =>
        b.schedule.priority - a.schedule.priority ||
        a.schedule.startMinute - b.schedule.startMinute ||
        a.schedule.id.localeCompare(b.schedule.id),
    );
  const chosen = matching[0] ?? null;
  const rate = chosen?.rate ?? defaultRate;
  if (!rate) return null;
  return { rate, schedule: chosen?.schedule ?? null };
}

function nextMinuteBoundary(value: Date): Date {
  return new Date(Math.floor(value.getTime() / 60_000) * 60_000 + 60_000);
}

export async function resolveRateForTable(
  tx: DbTransaction,
  tableId: string,
  at: Date,
): Promise<ResolvedRate> {
  const [table] = await tx
    .select()
    .from(venueTables)
    .where(and(eq(venueTables.id, tableId), eq(venueTables.active, true)))
    .limit(1);
  if (!table) throw new AppError('TABLE_NOT_FOUND', 'Meja tidak ditemukan.');

  const [defaultRate] = table.rateId
    ? await tx.select().from(billiardRates).where(eq(billiardRates.id, table.rateId)).limit(1)
    : [];

  const schedules = await tx
    .select({ schedule: tableRateSchedules, rate: billiardRates })
    .from(tableRateSchedules)
    .innerJoin(billiardRates, eq(tableRateSchedules.rateId, billiardRates.id))
    .where(and(eq(tableRateSchedules.tableId, tableId), eq(tableRateSchedules.active, true)))
    .orderBy(asc(tableRateSchedules.startMinute));

  const choice = chooseRateForClock(schedules, defaultRate ?? null, jakartaClock(at));
  return {
    table,
    rate: choice?.rate ?? null,
    defaultRate: defaultRate ?? null,
    schedule: choice?.schedule ?? null,
  };
}

/**
 * Snapshot seluruh rate window dari waktu start sampai horizon (default 24 jam).
 * Batas window mengikuti menit jam dinding, sehingga sesi yang mulai 16:30
 * otomatis pindah tarif tepat 17:00.
 */
export async function buildRateTimelineForTable(
  tx: DbTransaction,
  tableId: string,
  startAt: Date,
  horizonMinutes = 24 * 60,
): Promise<SessionRateSegment[]> {
  const resolved = await resolveRateForTable(tx, tableId, startAt);
  const fallbackRate = resolved.defaultRate ?? resolved.rate;
  if (!fallbackRate) return [];

  const schedules = await tx
    .select({ schedule: tableRateSchedules, rate: billiardRates })
    .from(tableRateSchedules)
    .innerJoin(billiardRates, eq(tableRateSchedules.rateId, billiardRates.id))
    .where(
      and(
        eq(tableRateSchedules.tableId, tableId),
        eq(tableRateSchedules.active, true),
      ),
    )
    .orderBy(asc(tableRateSchedules.startMinute));

  const horizonEnd = startAt.getTime() + Math.max(1, horizonMinutes) * 60_000;
  const result: Array<SessionRateSegment & { key: string }> = [];
  let cursor = startAt.getTime();
  let current: (SessionRateSegment & { key: string }) | null = null;

  while (cursor < horizonEnd) {
    const cursorDate = new Date(cursor);
    const segmentEnd = Math.min(nextMinuteBoundary(cursorDate).getTime(), horizonEnd);
    const choice = chooseRateForClock(schedules, fallbackRate, jakartaClock(cursorDate));
    const rate = choice?.rate ?? fallbackRate;
    const key = `${rate.id}:${choice?.schedule?.id ?? 'default'}`;
    if (!current || current.key !== key) {
      if (current) current.endAt = cursorDate.toISOString();
      current = {
        key,
        startAt: cursorDate.toISOString(),
        endAt: new Date(segmentEnd).toISOString(),
        rateName: rate.name,
        ratePerHour: rate.pricePerHour,
        minMinutes: rate.minMinutes,
        incrementMinutes: rate.incrementMinutes,
        scheduleId: choice?.schedule?.id ?? null,
      };
      result.push(current);
    } else {
      current.endAt = new Date(segmentEnd).toISOString();
    }
    cursor = segmentEnd;
  }

  return result.map((segment) => ({
    startAt: segment.startAt,
    endAt: segment.endAt,
    rateName: segment.rateName,
    ratePerHour: segment.ratePerHour,
    minMinutes: segment.minMinutes,
    incrementMinutes: segment.incrementMinutes,
    scheduleId: segment.scheduleId,
  }));
}

export async function previewRateForTable(tableId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const resolved = await resolveRateForTable(tx, tableId, now);
    return {
      tableCode: resolved.table.code,
      rate: resolved.rate,
      scheduleId: resolved.schedule?.id ?? null,
      scheduleLabel: resolved.schedule
        ? `${minutesToTime(resolved.schedule.startMinute)}–${minutesToTime(
            resolved.schedule.endMinute,
          )}`
        : null,
      priority: resolved.schedule?.priority ?? null,
      at: now.toISOString(),
      jakartaTime: jakartaClock(now).label,
    };
  });
}

export type RateScheduleInput = {
  id?: string;
  tableId: string;
  rateId: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  priority?: number;
  active?: boolean;
};

function validateSchedule(input: RateScheduleInput) {
  const days = [...new Set(input.daysOfWeek)].sort((a, b) => a - b);
  if (days.length === 0 || days.some((day) => day < 1 || day > 7)) {
    throw new AppError('INVALID_DAYS', 'Pilih minimal satu hari yang valid.');
  }
  if (
    !Number.isInteger(input.startMinute) ||
    !Number.isInteger(input.endMinute) ||
    input.startMinute < 0 ||
    input.startMinute >= 1440 ||
    input.endMinute <= 0 ||
    input.endMinute > 1440 ||
    input.startMinute >= input.endMinute
  ) {
    throw new AppError(
      'INVALID_RANGE',
      'Jam mulai harus lebih kecil dari jam selesai (dalam hari yang sama).',
    );
  }
  if (input.priority !== undefined && (input.priority < 0 || input.priority > 100)) {
    throw new AppError('INVALID_PRIORITY', 'Prioritas harus antara 0 dan 100.');
  }
  return days;
}

export async function saveRateSchedule(staffId: string, input: RateScheduleInput) {
  const days = validateSchedule(input);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [table] = await tx
      .select()
      .from(venueTables)
      .where(and(eq(venueTables.id, input.tableId), eq(venueTables.active, true)))
      .limit(1);
    if (!table) throw new AppError('TABLE_NOT_FOUND', 'Meja tidak ditemukan.');
    if (table.kind !== 'billiard') {
      throw new AppError('WRONG_TABLE_KIND', 'Jadwal tarif hanya untuk meja billiard.');
    }
    const [rate] = await tx
      .select()
      .from(billiardRates)
      .where(and(eq(billiardRates.id, input.rateId), eq(billiardRates.active, true)))
      .limit(1);
    if (!rate) throw new AppError('RATE_NOT_FOUND', 'Tarif aktif tidak ditemukan.');

    const values = {
      outletId: table.outletId,
      tableId: input.tableId,
      rateId: input.rateId,
      daysOfWeek: days,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      priority: input.priority ?? 0,
      active: input.active ?? true,
      updatedAt: now,
    };

    if (input.id) {
      const [updated] = await tx
        .update(tableRateSchedules)
        .set(values)
        .where(eq(tableRateSchedules.id, input.id))
        .returning();
      if (!updated) throw new AppError('SCHEDULE_NOT_FOUND', 'Jadwal tarif tidak ditemukan.');
      await audit(tx, {
        staffId,
        action: 'rate_schedule.updated',
        entityType: 'table_rate_schedule',
        entityId: updated.id,
        detail: { table: table.code, rate: rate.name, ...values },
        at: now,
      });
      return { id: updated.id };
    }

    const [created] = await tx
      .insert(tableRateSchedules)
      .values({ ...values, createdAt: now })
      .returning();
    await audit(tx, {
      staffId,
      action: 'rate_schedule.created',
      entityType: 'table_rate_schedule',
      entityId: created.id,
      detail: { table: table.code, rate: rate.name, ...values },
      at: now,
    });
    return { id: created.id };
  });
}

export async function toggleRateSchedule(staffId: string, scheduleId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [schedule] = await tx
      .select()
      .from(tableRateSchedules)
      .where(eq(tableRateSchedules.id, scheduleId))
      .limit(1);
    if (!schedule) throw new AppError('SCHEDULE_NOT_FOUND', 'Jadwal tarif tidak ditemukan.');
    const [updated] = await tx
      .update(tableRateSchedules)
      .set({ active: !schedule.active, updatedAt: now })
      .where(eq(tableRateSchedules.id, scheduleId))
      .returning();
    await audit(tx, {
      staffId,
      action: updated.active ? 'rate_schedule.activated' : 'rate_schedule.deactivated',
      entityType: 'table_rate_schedule',
      entityId: scheduleId,
      detail: { active: updated.active },
      at: now,
    });
    return { active: updated.active };
  });
}
