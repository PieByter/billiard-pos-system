'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  getRatePreviewAction,
  moveBillAction,
  startSessionAction,
} from '@/app/actions/sessions';
import { openShiftAction } from '@/app/actions/shifts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState } from '@/components/ui/stat-card';
import { formatRp } from '@/lib/format';
import type { TableView } from '@/lib/types';

export function StartSessionDialog({
  table,
  open,
  onClose,
  onDone,
}: {
  table: TableView | null;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [guestName, setGuestName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    rate: TableView['rate'];
    scheduleLabel: string | null;
    jakartaTime: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setGuestName('');
      setError(null);
      setLoading(false);
    }
  }, [open, table?.id]);

  useEffect(() => {
    if (!open || !table) {
      setPreview(null);
      return;
    }
    setPreview(null);
    let cancelled = false;
    void getRatePreviewAction(table.id).then((result) => {
      if (cancelled) return;
      setPreview(
        result.ok && result.data
          ? {
              rate: result.data.rate,
              scheduleLabel: result.data.scheduleLabel,
              jakartaTime: result.data.jakartaTime,
            }
          : null,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, table?.id]);

  const activeRate = preview?.rate ?? table?.rate ?? null;

  async function submit() {
    if (!table) return;
    setLoading(true);
    setError(null);
    const result = await startSessionAction(table.id, guestName || null);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    toast.success(`Sesi ${table.code} dimulai`, {
      description: `Timer berjalan · ${formatRp(
        result.data?.ratePerHour ?? activeRate?.pricePerHour ?? 0,
      )}/jam${preview?.scheduleLabel ? ` · jadwal ${preview.scheduleLabel}` : ''}`,
    });
    setLoading(false);
    onClose();
    onDone?.();
    router.refresh();
  }

  return (
    <Modal
      open={open && Boolean(table)}
      onClose={onClose}
      title={table ? `Start sesi ${table.code}` : 'Start sesi'}
      subtitle="Tarif di-snapshot saat start, perubahan master rate tidak memengaruhi sesi ini."
      icon="play_circle"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={loading}
            disabled={!activeRate}
          >
            <Icon name="timer" className="text-[18px]" />
            Mulai timer
          </Button>
        </div>
      }
    >
      {table ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-xl border border-outline-variant/25 bg-surface-container p-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="numeric text-numeric-lg font-bold text-on-surface">{table.code}</span>
                <Badge tone="outline">{table.zone}</Badge>
              </div>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                {table.capacity} pax · {table.kind === 'billiard' ? 'Billiard' : 'Cafe'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider text-outline">Tarif</span>
              <p className="numeric text-numeric-md font-bold text-primary">
                {activeRate ? formatRp(activeRate.pricePerHour) : '—'}
                <span className="text-[11px] font-normal text-on-surface-variant"> /jam</span>
              </p>
              {preview?.scheduleLabel ? (
                <Badge tone="paused" className="mt-1">
                  Jadwal {preview.scheduleLabel}
                </Badge>
              ) : (
                <span className="mt-1 block text-[10px] text-outline">
                  Tarif default{preview ? ` · ${preview.jakartaTime} WIB` : ''}
                </span>
              )}
            </div>
          </div>

          <Input
            id="guest-name"
            label="Nama guest / tab"
            placeholder="Contoh: Kevin Sanjaya"
            value={guestName}
            maxLength={80}
            onChange={(event) => setGuestName(event.target.value)}
            leading={<Icon name="person" className="text-[18px]" />}
            hint="Opsional"
          />

          {activeRate ? (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-3">
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-on-surface-variant">Minimal durasi</span>
                <span className="numeric font-semibold text-on-surface">
                  {activeRate.minMinutes} menit
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-body-sm">
                <span className="text-on-surface-variant">Kelipatan billing</span>
                <span className="numeric font-semibold text-on-surface">
                  {activeRate.incrementMinutes} menit (pro-rata)
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-body-sm">
                <span className="text-on-surface-variant">Pembulatan</span>
                <span className="numeric font-semibold text-on-surface">Rp 500 terdekat</span>
              </div>
              {preview?.scheduleLabel ? (
                <div className="mt-2 border-t border-primary/15 pt-2 text-[10px] text-on-surface-variant">
                  Jadwal tarif aktif untuk jam ini. Tarif di-snapshot saat start.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-body-sm text-error">
              Meja ini belum punya tarif aktif. Atur di Admin → Tarif.
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-3 text-body-sm text-on-surface-variant">
            <Icon name="info" className="mt-0.5 text-[18px] text-secondary" />
            <p>
              Sesi bisa di-pause kapan saja. Pembayaran akan mengunci total final setelah sesi
              dihentikan.
            </p>
          </div>

          <FormError message={error} />
        </div>
      ) : null}
    </Modal>
  );
}

export function MoveTableDialog({
  open,
  source,
  targets,
  onClose,
  onDone,
}: {
  open: boolean;
  source: TableView | null;
  targets: TableView[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setError(null);
      setLoading(false);
    }
  }, [open, source?.id]);

  async function submit() {
    if (!source || !selectedId) return;
    setLoading(true);
    setError(null);
    const result = await moveBillAction(source.id, selectedId);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    toast.success('Bill berhasil dipindahkan', {
      description: result.data?.toTableCode ? `Tujuan meja ${result.data.toTableCode}` : undefined,
    });
    setLoading(false);
    onClose();
    onDone?.();
    router.refresh();
  }

  return (
    <Modal
      open={open && Boolean(source)}
      onClose={onClose}
      title={source ? `Pindah bill ${source.code}` : 'Pindah bill'}
      subtitle="Timer sesi tetap berjalan. Bill dan seluruh order ikut pindah."
      icon="swap_horiz"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit} loading={loading} disabled={!selectedId}>
            <Icon name="swap_horiz" className="text-[18px]" />
            Pindahkan
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {targets.length === 0 ? (
          <EmptyState
            compact
            icon="event_busy"
            title="Tidak ada meja tujuan kosong"
            description="Selesaikan atau pindahkan bill lain terlebih dahulu."
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {targets.map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => setSelectedId(table.id)}
                className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
                  selectedId === table.id
                    ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                    : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="numeric text-body-lg font-bold text-on-surface">{table.code}</span>
                    <Badge tone="outline">{table.zone}</Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-on-surface-variant">
                    {table.capacity} pax · {table.kind === 'billiard' ? 'Billiard' : 'Cafe'}
                  </p>
                </div>
                <Icon
                  name={selectedId === table.id ? 'check_circle' : 'radio_button_unchecked'}
                  className={selectedId === table.id ? 'text-[20px] text-primary' : 'text-[20px] text-outline'}
                />
              </button>
            ))}
          </div>
        )}
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function QuickOpenDialog({
  open,
  tables,
  onClose,
  onPick,
}: {
  open: boolean;
  tables: TableView[];
  onClose: () => void;
  onPick: (table: TableView) => void;
}) {
  const billiard = tables.filter((table) => table.kind === 'billiard');
  const cafe = tables.filter((table) => table.kind === 'cafe');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Buka meja"
      subtitle="Pilih meja kosong. Billiard memulai timer, cafe membuka tab F&B."
      icon="add_circle"
      size="lg"
    >
      {tables.length === 0 ? (
        <EmptyState
          icon="event_busy"
          title="Semua meja terisi"
          description="Belum ada meja kosong yang bisa dibuka."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {billiard.length > 0 ? (
            <section>
              <h3 className="mb-2 text-label-badge font-bold uppercase tracking-[0.1em] text-primary">
                Billiard
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {billiard.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => onPick(table)}
                    className="flex flex-col items-start gap-1 rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-left transition-all hover:border-primary/40 hover:bg-surface-container-high"
                  >
                    <span className="numeric text-body-lg font-bold text-on-surface">{table.code}</span>
                    <span className="text-[10px] text-on-surface-variant">{table.zone}</span>
                    <span className="numeric text-[11px] font-semibold text-primary">
                      {table.rate ? `${formatRp(table.rate.pricePerHour)}/jam` : 'No rate'}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {cafe.length > 0 ? (
            <section>
              <h3 className="mb-2 text-label-badge font-bold uppercase tracking-[0.1em] text-secondary">
                Cafe &amp; Lounge
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {cafe.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => onPick(table)}
                    className="flex flex-col items-start gap-1 rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-left transition-all hover:border-secondary/40 hover:bg-surface-container-high"
                  >
                    <span className="numeric text-body-lg font-bold text-on-surface">{table.code}</span>
                    <span className="text-[10px] text-on-surface-variant">{table.zone}</span>
                    <span className="text-[10px] font-semibold text-secondary">
                      {table.allowSelfOrder ? 'QR self-order' : 'Kasir'}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

export function ShiftOpenDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [cash, setCash] = useState(500_000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCash(500_000);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  async function submit() {
    setLoading(true);
    setError(null);
    const result = await openShiftAction(cash);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    toast.success('Shift dibuka', { description: `Modal kas ${formatRp(cash)}` });
    setLoading(false);
    onClose();
    onDone?.();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Buka shift kasir"
      subtitle="Modal awal dipakai untuk rekonsiliasi kas saat tutup shift."
      icon="account_balance_wallet"
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit} loading={loading}>
            <Icon name="play_arrow" className="text-[18px]" />
            Buka shift
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label>Modal kas awal</Label>
          <div className="mt-1.5">
            <MoneyInput value={cash} onChange={setCash} />
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-3 text-body-sm text-on-surface-variant">
          <Icon name="info" className="mt-0.5 text-[18px] text-secondary" />
          <p>Shift mencatat modal awal dan seluruh pembayaran cash sampai tutup shift.</p>
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function QrDialog({
  open,
  table,
  onClose,
}: {
  open: boolean;
  table: TableView | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  const path = table ? `/t/${table.qrToken}` : '#';
  const url = table && typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link QR disalin');
    } catch {
      toast.error('Gagal menyalin link');
    }
  }

  return (
    <Modal
      open={open && Boolean(table)}
      onClose={onClose}
      title={table ? `QR meja ${table.code}` : 'QR meja'}
      subtitle={table?.allowSelfOrder ? 'Self-order aktif untuk meja ini.' : 'Mode lihat menu — order melalui kasir.'}
      icon="qr_code_2"
      size="sm"
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={copy} className="w-full">
            <Icon name={copied ? 'check' : 'content_copy'} className="text-[17px]" />
            {copied ? 'Link disalin' : 'Salin link customer'}
          </Button>
          <a
            href={path}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-outline-variant/50 bg-surface-container-high text-body-sm font-semibold text-on-surface transition-colors hover:bg-surface-bright"
          >
            <Icon name="open_in_new" className="text-[17px]" />
            Buka halaman guest
          </a>
        </div>
      }
    >
      {table ? (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl border border-outline-variant/30 bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/qr?token=${encodeURIComponent(table.qrToken)}`}
              alt={`QR meja ${table.code}`}
              width={240}
              height={240}
              className="h-[240px] w-[240px] rounded-lg"
            />
          </div>
          <div className="w-full rounded-xl border border-outline-variant/25 bg-surface-container p-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="numeric text-headline-md font-bold text-on-surface">{table.code}</span>
              <Badge tone={table.allowSelfOrder ? 'primary' : 'outline'}>
                {table.allowSelfOrder ? 'Self-order' : 'View only'}
              </Badge>
            </div>
            <p className="mt-1 break-all text-[10px] text-on-surface-variant">{path}</p>
          </div>
          <p className="text-center text-[11px] text-on-surface-variant">
            Token QR bersifat acak dan bisa dirotasi dari Admin → Meja &amp; QR jika bocor.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
