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
