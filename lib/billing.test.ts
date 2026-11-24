import { describe, expect, it } from 'vitest';
import {
  billableElapsedSeconds,
  computeBillTotals,
  computeSessionAmount,
  computeSessionAmountFromSeconds,
} from './billing';

const standard = { ratePerHour: 50_000, minMinutes: 30, incrementMinutes: 15 };
const vip = { ratePerHour: 60_000, minMinutes: 30, incrementMinutes: 15 };
const privateRoom = { ratePerHour: 100_000, minMinutes: 60, incrementMinutes: 30 };

describe('computeSessionAmountFromSeconds', () => {
  it('menghitung 102 menit VIP menjadi 105 menit billable = Rp105.000', () => {
    const result = computeSessionAmountFromSeconds(102 * 60, vip);
    expect(result.billableMinutes).toBe(105);
    expect(result.amount).toBe(105_000);
  });

  it('menegakkan minimal durasi 30 menit', () => {
    const result = computeSessionAmountFromSeconds(7 * 60, standard);
    expect(result.billableMinutes).toBe(30);
    expect(result.amount).toBe(25_000);
  });

  it('membulatkan ke kelipatan increment 15 menit', () => {
    const result = computeSessionAmountFromSeconds(16 * 60, standard);
    expect(result.billableMinutes).toBe(30);
    expect(result.amount).toBe(25_000);
  });

  it('mendukung fixed block VIP 60/30 menit', () => {
    const result = computeSessionAmountFromSeconds(61 * 60, privateRoom);
    expect(result.billableMinutes).toBe(90);
    expect(result.amount).toBe(150_000);
  });

  it('membulatkan nominal ke Rp500 terdekat', () => {
    const result = computeSessionAmountFromSeconds(
      30 * 60,
      { ratePerHour: 55_000, minMinutes: 30, incrementMinutes: 15 },
    );
    expect(result.amount).toBe(27_500);
    expect(result.amount % 500).toBe(0);
  });

  it('tidak menghasilkan nominal negatif', () => {
    expect(computeSessionAmountFromSeconds(-300, standard).amount).toBe(25_000);
  });
});

describe('pause dan elapsed', () => {
  it('mengurangi paused seconds dari durasi', () => {
    const start = new Date('2026-01-01T10:00:00Z');
    const end = new Date('2026-01-01T12:00:00Z');
    expect(billableElapsedSeconds(start, end, 600)).toBe(6600);
  });

  it('computeSessionAmount memakai pause', () => {
    const start = new Date('2026-01-01T10:00:00Z');
    const end = new Date('2026-01-01T12:00:00Z'); // 120 menit - 60 menit pause = 60
    const result = computeSessionAmount(start, end, 3600, vip);
    expect(result.billableMinutes).toBe(60);
    expect(result.amount).toBe(60_000);
  });
});

describe('computeBillTotals', () => {
  it('menghitung PB1 10% + service 5% sesuai desain', () => {
    const totals = computeBillTotals({
      subtotal: 245_000,
      taxRateBps: 1000,
      serviceRateBps: 500,
    });
    expect(totals.taxAmount).toBe(24_500);
    expect(totals.serviceAmount).toBe(12_250);
    expect(totals.total).toBe(281_750);
  });

  it('diskon mengurangi dasar pengenaan pajak', () => {
    const totals = computeBillTotals({
      subtotal: 200_000,
      discountAmount: 50_000,
      taxRateBps: 1000,
      serviceRateBps: 500,
    });
    expect(totals.taxableBase).toBe(150_000);
    expect(totals.taxAmount).toBe(15_000);
    expect(totals.serviceAmount).toBe(7_500);
    expect(totals.total).toBe(172_500);
  });

  it('diskon tidak bisa melebihi subtotal', () => {
    const totals = computeBillTotals({
      subtotal: 50_000,
      discountAmount: 100_000,
      taxRateBps: 1000,
      serviceRateBps: 500,
    });
    expect(totals.discountAmount).toBe(50_000);
    expect(totals.total).toBe(0);
  });
});
