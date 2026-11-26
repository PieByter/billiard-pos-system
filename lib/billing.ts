/**
 * Billing engine — semua nilai uang dalam rupiah bulat (integer).
 * Tidak ada float untuk uang. Tarif disimpan per jam, dibagi 60 saat menghitung.
 */

export type RateSnapshot = {
  ratePerHour: number;
  minMinutes: number;
  incrementMinutes: number;
};

export type BillTotalsInput = {
  subtotal: number;
  discountAmount?: number;
  taxRateBps: number;
  serviceRateBps: number;
};

export type BillTotals = {
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
};

/** Elapsed seconds yang dapat ditagihkan (pause dikurangi). */
export function billableElapsedSeconds(
  startedAt: Date | string,
  at: Date | string,
  pausedSeconds = 0,
): number {
  const start = new Date(startedAt).getTime();
  const end = new Date(at).getTime();
  return Math.max(0, Math.floor((end - start) / 1000) - Math.max(0, pausedSeconds));
}

/**
 * Hitung biaya sesi dari detik berjalan.
 * - menit dibulatkan ke atas
 * - minimal `minMinutes`
 * - durasi dibulatkan ke kelipatan `incrementMinutes`
 * - hasil akhir dibulatkan ke Rp500 terdekat
 */
export function computeSessionAmountFromSeconds(elapsedSeconds: number, rate: RateSnapshot) {
  const elapsedSec = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.ceil(elapsedSec / 60);
  const increment = Math.max(1, rate.incrementMinutes);
  const billableMinutes = Math.max(
    rate.minMinutes,
    Math.ceil(minutes / increment) * increment,
  );
  const raw = (billableMinutes * rate.ratePerHour) / 60;
  const amount = Math.round(raw / 500) * 500;

  return { elapsedSeconds: elapsedSec, minutes, billableMinutes, amount };
}

export function computeSessionAmount(
  startedAt: Date | string,
  endedAt: Date | string,
  pausedSeconds: number,
  rate: RateSnapshot,
) {
  return computeSessionAmountFromSeconds(
    billableElapsedSeconds(startedAt, endedAt, pausedSeconds),
    rate,
  );
}

/** Snapshot tarif per segmen waktu, dibuat saat sesi dimulai. */
export type SessionRateSegment = {
  startAt: string;
  endAt: string;
  rateName: string;
  ratePerHour: number;
  minMinutes: number;
  incrementMinutes: number;
  scheduleId: string | null;
};

export type SessionPause = {
  startAt: string;
  endAt: string | null;
};

export type SessionBillingSegment = {
  startAt: string;
  endAt: string;
  rateName: string;
  ratePerHour: number;
  activeSeconds: number;
  activeMinutes: number;
  amount: number;
};

export type SegmentedSessionBilling = {
  amount: number;
  totalActiveSeconds: number;
  totalActiveMinutes: number;
  totalBillableMinutes: number;
  minimumTopUpAmount: number;
  roundingAdjustment: number;
  segments: SessionBillingSegment[];
};

type Interval = { start: number; end: number };

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function overlapSeconds(intervals: Interval[], start: number, end: number): number {
  let total = 0;
  for (const interval of intervals) {
    const overlap = Math.min(end, interval.end) - Math.max(start, interval.start);
    if (overlap > 0) total += overlap;
  }
  return Math.floor(total / 1000);
}

/**
 * Billing sesi yang melewati beberapa rate window.
 *
 * Aturan:
 * - waktu aktif dipotong pause per interval;
 * - tiap segmen dibulatkan ke menit penuh (ceil), seperti billing lama;
 * - minimum durasi & increment diterapkan pada total sesi, kekurangannya
 *   dibebankan pada tarif segmen pertama;
 * - total akhir dibulatkan ke Rp500 terdekat.
 */
export function computeSegmentedSessionBilling(input: {
  startedAt: Date | string;
  endedAt: Date | string;
  pauses?: SessionPause[] | null;
  pausedSeconds?: number;
  segments?: SessionRateSegment[] | null;
  ratePerHour: number;
  minMinutes: number;
  incrementMinutes: number;
  rateName?: string;
}): SegmentedSessionBilling {
  const startMs = new Date(input.startedAt).getTime();
  const endMs = new Date(input.endedAt).getTime();
  const empty: SegmentedSessionBilling = {
    amount: 0,
    totalActiveSeconds: 0,
    totalActiveMinutes: 0,
    totalBillableMinutes: 0,
    minimumTopUpAmount: 0,
    roundingAdjustment: 0,
    segments: [],
  };
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return empty;
  }

  const fallbackRateName = input.rateName ?? 'Tarif meja';
  const sourceSegments: SessionRateSegment[] = [];
  const rawSegments = (input.segments ?? [])
    .map((segment) => ({ ...segment }))
    .filter((segment) => {
      const segmentStart = Math.max(startMs, new Date(segment.startAt).getTime());
      const segmentEnd = Math.min(endMs, new Date(segment.endAt).getTime());
      return Number.isFinite(segmentStart) && Number.isFinite(segmentEnd) && segmentEnd > segmentStart;
    })
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );

  if (rawSegments.length === 0) {
    sourceSegments.push({
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
      rateName: fallbackRateName,
      ratePerHour: input.ratePerHour,
      minMinutes: input.minMinutes,
      incrementMinutes: input.incrementMinutes,
      scheduleId: null,
    });
  } else {
    const firstStart = new Date(rawSegments[0].startAt).getTime();
    if (firstStart > startMs) {
      sourceSegments.push({
        ...rawSegments[0],
        startAt: new Date(startMs).toISOString(),
        endAt: new Date(firstStart).toISOString(),
      });
    }
    for (const segment of rawSegments) {
      sourceSegments.push(segment);
    }
    const last = sourceSegments[sourceSegments.length - 1];
    const lastEnd = new Date(last.endAt).getTime();
    if (lastEnd < endMs) {
      // Sesi melewati horizon snapshot: lanjutkan tarif segmen terakhir.
      last.endAt = new Date(endMs).toISOString();
    }
  }

  const pauseIntervals: Interval[] = [];
  for (const pause of input.pauses ?? []) {
    const pauseStart = Math.max(startMs, new Date(pause.startAt).getTime());
    const pauseEnd = Math.min(
      endMs,
      pause.endAt ? new Date(pause.endAt).getTime() : endMs,
    );
    if (Number.isFinite(pauseStart) && Number.isFinite(pauseEnd) && pauseEnd > pauseStart) {
      pauseIntervals.push({ start: pauseStart, end: pauseEnd });
    }
  }
  if (pauseIntervals.length === 0 && (input.pausedSeconds ?? 0) > 0) {
    // Data lama tidak menyimpan kapan pause terjadi; anggap pause di akhir sesi.
    const pausedMs = Math.max(0, (input.pausedSeconds ?? 0) * 1000);
    const pauseStart = Math.max(startMs, endMs - pausedMs);
    if (endMs > pauseStart) pauseIntervals.push({ start: pauseStart, end: endMs });
  }

  const mergedPauses = mergeIntervals(pauseIntervals);
  const activeIntervals: Interval[] = [];
  let cursor = startMs;
  for (const pause of mergedPauses) {
    if (pause.start > cursor) activeIntervals.push({ start: cursor, end: pause.start });
    cursor = Math.max(cursor, pause.end);
  }
  if (cursor < endMs) activeIntervals.push({ start: cursor, end: endMs });
  if (activeIntervals.length === 0) return empty;

  const roundedSegments = sourceSegments
    .map((segment) => {
      const segmentStart = new Date(segment.startAt).getTime();
      const segmentEnd = new Date(segment.endAt).getTime();
      const activeSeconds = overlapSeconds(activeIntervals, segmentStart, segmentEnd);
      const activeMinutes = Math.ceil(activeSeconds / 60);
      if (activeMinutes <= 0) return null;
      return {
        startAt: segment.startAt,
        endAt: segment.endAt,
        rateName: segment.rateName,
        ratePerHour: segment.ratePerHour,
        activeSeconds,
        activeMinutes,
        amount: Math.round((activeMinutes * segment.ratePerHour) / 60),
      };
    })
    .filter((segment): segment is SessionBillingSegment => Boolean(segment));

  if (roundedSegments.length === 0) {
    // Sesi berhenti < 1 detik / seluruhnya pause tetap kena minimum durasi,
    // sama seperti billing lama yang selalu menerapkan minMinutes.
    const first = sourceSegments[0];
    roundedSegments.push({
      startAt: first.startAt,
      endAt: first.endAt,
      rateName: first.rateName,
      ratePerHour: first.ratePerHour,
      activeSeconds: 0,
      activeMinutes: 0,
      amount: 0,
    });
  }

  const totalActiveSeconds = roundedSegments.reduce(
    (sum, segment) => sum + segment.activeSeconds,
    0,
  );
  const totalActiveMinutes = roundedSegments.reduce(
    (sum, segment) => sum + segment.activeMinutes,
    0,
  );
  const increment = Math.max(1, input.incrementMinutes);
  const totalBillableMinutes = Math.max(
    input.minMinutes,
    Math.ceil(totalActiveMinutes / increment) * increment,
  );
  const extraMinutes = Math.max(0, totalBillableMinutes - totalActiveMinutes);
  const firstRate = sourceSegments[0]?.ratePerHour ?? input.ratePerHour;
  const minimumTopUpAmount = Math.round((extraMinutes * firstRate) / 60);
  const rawTotal =
    roundedSegments.reduce((sum, segment) => sum + (segment.activeMinutes * segment.ratePerHour) / 60, 0) +
    (extraMinutes * firstRate) / 60;
  const amount = Math.max(0, Math.round(rawTotal / 500) * 500);
  const roundedSum =
    roundedSegments.reduce((sum, segment) => sum + segment.amount, 0) + minimumTopUpAmount;
  const roundingAdjustment = amount - roundedSum;
  roundedSegments[roundedSegments.length - 1].amount += roundingAdjustment;

  return {
    amount,
    totalActiveSeconds,
    totalActiveMinutes,
    totalBillableMinutes,
    minimumTopUpAmount,
    roundingAdjustment,
    segments: roundedSegments,
  };
}

/**
 * Subtotal + pajak + service. Diskon mengurangi dasar pengenaan pajak.
 * PB1 default 10% (1000 bps), service 5% (500 bps).
 */
export function computeBillTotals(input: BillTotalsInput): BillTotals {
  const subtotal = Math.max(0, Math.round(input.subtotal));
  const discountAmount = Math.min(Math.max(0, Math.round(input.discountAmount ?? 0)), subtotal);
  const taxableBase = subtotal - discountAmount;
  const taxAmount = Math.round((taxableBase * Math.max(0, input.taxRateBps)) / 10_000);
  const serviceAmount = Math.round((taxableBase * Math.max(0, input.serviceRateBps)) / 10_000);
  const total = taxableBase + taxAmount + serviceAmount;

  return {
    subtotal,
    discountAmount,
    taxableBase,
    taxAmount,
    serviceAmount,
    total,
  };
}

/** Alokasikan total bill ke beberapa split group secara proporsional. */
export function allocateSplitTotals(
  groupSubtotals: number[],
  input: BillTotalsInput,
): Array<{
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
}> {
  const subtotal = Math.max(0, Math.round(input.subtotal));
  const totals = computeBillTotals({ ...input, subtotal });
  if (groupSubtotals.length === 0) return [];

  const result: Array<{
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    serviceAmount: number;
    total: number;
  }> = [];
  let allocatedSubtotal = 0;
  let allocatedDiscount = 0;
  let allocatedTax = 0;
  let allocatedService = 0;

  groupSubtotals.forEach((rawSubtotal, index) => {
    const isLast = index === groupSubtotals.length - 1;
    const groupSubtotal = isLast
      ? Math.max(0, subtotal - allocatedSubtotal)
      : Math.max(0, Math.round(rawSubtotal));
    const groupDiscount = isLast
      ? Math.max(0, totals.discountAmount - allocatedDiscount)
      : subtotal > 0
        ? Math.round((totals.discountAmount * groupSubtotal) / subtotal)
        : 0;
    const taxableBase = Math.max(0, groupSubtotal - groupDiscount);
    const groupTax = isLast
      ? Math.max(0, totals.taxAmount - allocatedTax)
      : Math.round((taxableBase * Math.max(0, input.taxRateBps)) / 10_000);
    const groupService = isLast
      ? Math.max(0, totals.serviceAmount - allocatedService)
      : Math.round((taxableBase * Math.max(0, input.serviceRateBps)) / 10_000);

    result.push({
      subtotal: groupSubtotal,
      discountAmount: groupDiscount,
      taxAmount: groupTax,
      serviceAmount: groupService,
      total: taxableBase + groupTax + groupService,
    });

    allocatedSubtotal += groupSubtotal;
    allocatedDiscount += groupDiscount;
    allocatedTax += groupTax;
    allocatedService += groupService;
  });

  return result;
}

/** Format durasi HH:MM:SS (bisa lebih dari 24 jam). */
export function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/** "Rp 105.000" — tanpa desimal. */
export function formatRp(amount: number | null | undefined): string {
  const value = Number.isFinite(amount ?? NaN) ? Math.round(amount as number) : 0;
  const sign = value < 0 ? '-' : '';
  return `${sign}Rp ${new Intl.NumberFormat('id-ID').format(Math.abs(value))}`;
}

/** Angka ringkas untuk widget: 1,95 jt */
export function formatCompactRp(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `Rp ${(amount / 1_000_000).toLocaleString('id-ID', {
      maximumFractionDigits: 2,
    })} jt`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `Rp ${(amount / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  }
  return formatRp(amount);
}
