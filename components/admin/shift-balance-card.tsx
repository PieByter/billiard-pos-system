'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { closeShiftAction, openShiftAction } from '@/app/actions/shifts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, Input, Label, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { MoneyInput } from '@/components/ui/money-input';
import { formatClock, formatRp, formatRelative } from '@/lib/format';
import type { AdminData } from '@/lib/types';

const DENOMINATIONS = [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100];

function emptyDenominationCounts(): Record<number, number> {
  return Object.fromEntries(DENOMINATIONS.map((value) => [value, 0]));
}

export function ShiftBalanceCard({
  shift,
  stats,
  ownerName,
}: {
  shift: AdminData['shift'];
  stats: AdminData['shiftStats'];
  ownerName: string;
}) {
  const router = useRouter();
  const [actual, setActual] = useState(shift?.expectedCash ?? stats.expectedCash);
  const [counted, setCounted] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [openingCash, setOpeningCash] = useState(500_000);
  const [denomOpen, setDenomOpen] = useState(false);
  const [denoms, setDenoms] = useState<Record<number, number>>(emptyDenominationCounts);

  useEffect(() => {
    setActual(shift?.expectedCash ?? stats.expectedCash);
    setCounted(false);
    setDenoms(emptyDenominationCounts());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift?.id, stats.expectedCash]);

  const expected = shift?.expectedCash ?? stats.expectedCash;
  const difference = actual - expected;
  const match = difference === 0;
  const denominationTotal = DENOMINATIONS.reduce(
    (sum, value) => sum + value * (denoms[value] ?? 0),
    0,
  );

  function openDenominations() {
    setDenoms(emptyDenominationCounts());
    setDenomOpen(true);
  }

  function applyDenominations() {
    setActual(denominationTotal);
    setCounted(true);
    setDenomOpen(false);
  }

  async function closeShift() {
    setLoading(true);
    setError(null);
    const result = await closeShiftAction(actual, notes);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirmClose(false);
    const shiftId = result.data?.shiftId;
    toast.success('Shift ditutup & Z-report siap', {
      description: `Selisih kas ${formatRp(result.data?.difference ?? 0)}`,
      action: shiftId
        ? {
            label: 'Cetak Z-report',
            onClick: () => window.open(`/print/shift/${shiftId}`, '_blank'),
          }
        : undefined,
    });
    router.refresh();
  }

  async function openNewShift() {
    setLoading(true);
    setError(null);
    const result = await openShiftAction(openingCash);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Shift baru dibuka', { description: `Modal ${formatRp(openingCash)}` });
    router.refresh();
  }

  return (
    <section className="panel flex flex-col gap-3 rounded-xl p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high text-primary">
            <Icon name="account_balance_wallet" className="text-[22px]" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-headline-md font-bold text-on-surface">
                {shift ? 'Penutupan shift' : 'Buka shift baru'}
              </h2>
              {shift ? (
                <Badge tone={shift.status === 'open' ? 'primary' : 'neutral'} dot>
                  {shift.status === 'open' ? 'Shift aktif' : 'Closed'}
                </Badge>
              ) : (
                <Badge tone="paused" dot>
                  Belum ada shift
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              {shift
                ? `${shift.staffName} · mulai ${formatClock(shift.openedAt)} · supervisor ${ownerName}`
                : 'Buka shift agar target kas dan rekonsiliasi tercatat.'}
            </p>
          </div>
        </div>
        {shift ? (
          <div
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
              !counted
                ? 'bg-surface-container-high text-on-surface-variant'
                : match
                  ? 'bg-primary/15 text-primary'
                  : difference > 0
                    ? 'bg-secondary/15 text-secondary'
                    : 'bg-error-container text-on-error-container'
            }`}
          >
            <Icon
              name={
                !counted ? 'pending' : match ? 'verified' : difference > 0 ? 'add_circle' : 'warning'
              }
              className="text-[16px]"
            />
            {!counted ? 'Belum dihitung' : match ? 'Laci sinkron' : difference > 0 ? 'Kas lebih' : 'Kas kurang'}
          </div>
        ) : null}
      </header>

      {shift ? (
        <>
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-low p-3 sm:grid-cols-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Modal kas awal
              </span>
              <p className="numeric mt-1 text-body-lg font-semibold text-on-surface">
                {formatRp(shift.openingCash)}
              </p>
              <span className="text-[10px] text-outline">Float laci kasir</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Penjualan tunai sistem
              </span>
              <p className="numeric mt-1 text-body-lg font-semibold text-primary">
                + {formatRp(stats.cashRevenue)}
              </p>
              <span className="text-[10px] text-outline">Akumulasi pembayaran cash</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Target fisik seharusnya
              </span>
              <p className="numeric mt-1 text-body-lg font-bold text-secondary">
                = {formatRp(expected)}
              </p>
              <span className="text-[10px] text-outline">Expected cash in drawer</span>
            </div>
          </div>

          <div>
            <Label
              hint={
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={openDenominations}
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10"
                  >
                    Hitung per pecahan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActual(expected);
                      setCounted(true);
                      setDenoms(emptyDenominationCounts());
                    }}
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-secondary transition-colors hover:bg-secondary/10"
                  >
                    Isi target
                  </button>
                </span>
              }
            >
              Kas fisik di laci
            </Label>
            <div className="mt-1.5 grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[1fr_240px]">
              <MoneyInput
                value={actual}
                onChange={(value) => {
                  setActual(value);
                  setCounted(true);
                }}
              />
              <div
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 ${
                  !counted
                    ? 'border-outline-variant/30 bg-surface-container text-on-surface-variant'
                    : match
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : difference > 0
                        ? 'border-secondary/30 bg-secondary/10 text-secondary'
                        : 'border-error/30 bg-error/10 text-error'
                }`}
              >
                <Icon
                  name={!counted ? 'pending' : match ? 'check_circle' : difference > 0 ? 'add_circle' : 'warning'}
                  className="text-[22px]"
                />
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider">
                    {!counted ? 'Selisih kas' : match ? 'Selisih kas' : difference > 0 ? 'Kas lebih' : 'Kas kurang'}
                  </div>
                  <div className="numeric text-body-md font-bold">
                    {!counted
                      ? '— hitung fisik'
                      : difference === 0
                        ? 'Rp 0 (match)'
                        : `${difference > 0 ? '+' : '-'}${formatRp(Math.abs(difference))}`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label>Catatan serah terima</Label>
            <Textarea
              className="mt-1.5"
              rows={2}
              placeholder="Contoh: semua bill clear, stok bir tinggal 12 pcs, cue ball B4 diganti."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <FormError message={error} />

          <div className="flex flex-col gap-2 pt-0.5 sm:flex-row">
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => setConfirmClose(true)}
              disabled={stats.openBills > 0 || !counted}
            >
              <Icon name="receipt_long" className="text-[18px]" />
              Tutup shift &amp; cetak Z-report
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.open(`/print/shift/${shift.id}`, '_blank')}
            >
              <Icon name="print" className="text-[18px] text-secondary" />
              Cetak X-report
            </Button>
          </div>
          {stats.openBills > 0 ? (
            <p className="text-[10px] text-error">
              {stats.openBills} bill masih open. Tutup semua bill sebelum menutup shift.
            </p>
          ) : !counted ? (
            <p className="text-[10px] text-tertiary">
              Masukkan hasil hitung fisik kas untuk mengaktifkan tutup shift.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div>
            <Label>Modal kas awal</Label>
            <div className="mt-1.5">
              <MoneyInput value={openingCash} onChange={setOpeningCash} />
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-3 text-body-sm text-on-surface-variant">
            <Icon name="info" className="mt-0.5 text-[18px] text-secondary" />
            <p>
              Target kas akhir shift = modal awal + seluruh pembayaran cash pada window shift.
              Non-tunai direkonsiliasi terpisah.
            </p>
          </div>
          <FormError message={error} />
          <Button variant="primary" onClick={openNewShift} loading={loading}>
            <Icon name="play_arrow" className="text-[18px]" />
            Buka shift
          </Button>
        </>
      )}

      <Modal
        open={denomOpen}
        onClose={() => setDenomOpen(false)}
        title="Hitung kas per pecahan"
        subtitle="Masukkan jumlah lembar/koin fisik di laci. Total otomatis masuk ke kas fisik."
        icon="payments"
        size="md"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" className="sm:flex-1" onClick={() => setDenomOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" className="sm:flex-[2]" onClick={applyDenominations}>
              <Icon name="check" className="text-[18px]" />
              Gunakan total {formatRp(denominationTotal)}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {DENOMINATIONS.map((value) => (
              <div key={value} className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant/25 bg-surface-container px-2.5 py-2">
                <span className="numeric text-body-sm font-semibold text-on-surface">
                  {formatRp(value)}
                </span>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  aria-label={`Jumlah pecahan ${formatRp(value)}`}
                  containerClassName="w-20"
                  className="h-8 text-right"
                  value={denoms[value] ?? 0}
                  onChange={(event) => {
                    const qty = Math.max(0, Math.floor(Number(event.target.value) || 0));
                    setDenoms((current) => ({ ...current, [value]: qty }));
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5">
            <span className="text-body-sm font-semibold text-on-surface">Total hitung fisik</span>
            <span className="numeric text-numeric-md font-bold text-primary">
              {formatRp(denominationTotal)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDenoms(emptyDenominationCounts())}
            className="self-start text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant transition-colors hover:text-on-surface"
          >
            Reset hitungan
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmClose}
        title="Tutup shift sekarang?"
        description={`Kas fisik ${formatRp(actual)} vs target ${formatRp(
          expected,
        )}. Setelah ditutup, Z-report bisa dicetak dan shift baru dapat dibuka.`}
        confirmLabel="Tutup shift"
        tone="danger"
        loading={loading}
        onClose={() => setConfirmClose(false)}
        onConfirm={closeShift}
      >
        <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-3 text-body-sm">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Selisih</span>
            <span className="numeric font-bold text-on-surface">{formatRp(difference)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-on-surface-variant">Window shift</span>
            <span className="text-on-surface">{formatRelative(shift?.openedAt ?? new Date())}</span>
          </div>
        </div>
      </ConfirmDialog>
    </section>
  );
}
