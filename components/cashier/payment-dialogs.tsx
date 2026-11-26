'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  applyDiscountAction,
  payBillAction,
  voidBillAction,
} from '@/app/actions/payments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, inputClass, Label, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { MoneyInput } from '@/components/ui/money-input';
import { computeBillTotals } from '@/lib/billing';
import { cn, formatRp } from '@/lib/format';
import type { PayMethod, TableView } from '@/lib/types';

const METHODS: Array<{
  value: PayMethod;
  label: string;
  short: string;
  icon: string;
  description: string;
  className: string;
}> = [
  {
    value: 'cash',
    label: 'Cash',
    short: 'Cash',
    icon: 'payments',
    description: 'Uang tunai di laci',
    className: 'border-primary/40 bg-primary/10 text-primary',
  },
  {
    value: 'qris',
    label: 'QRIS',
    short: 'QRIS',
    icon: 'qr_code_2',
    description: 'Scan QRIS / gateway',
    className: 'border-secondary/40 bg-secondary/10 text-secondary',
  },
  {
    value: 'edc',
    label: 'Kartu / EDC',
    short: 'EDC',
    icon: 'credit_card',
    description: 'Debit / kredit mesin EDC',
    className: 'border-tertiary/40 bg-tertiary/10 text-tertiary',
  },
  {
    value: 'transfer',
    label: 'Transfer',
    short: 'Transfer',
    icon: 'account_balance',
    description: 'Transfer bank manual',
    className: 'border-outline-variant/50 bg-surface-container-high text-on-surface',
  },
  {
    value: 'balance',
    label: 'Saldo Member',
    short: 'Saldo',
    icon: 'account_balance_wallet',
    description: 'Potong deposit member',
    className: 'border-tertiary/40 bg-tertiary/10 text-tertiary',
  },
];

type SplitRow = { id: string; method: PayMethod; amount: number };

export function PaymentDialog({
  open,
  table,
  billId: billIdOverride,
  billNumber: billNumberOverride,
  total: totalOverride,
  defaultMethod = 'cash',
  defaultSplit = false,
  onClose,
  onDone,
}: {
  open: boolean;
  table: TableView | null;
  billId?: string;
  billNumber?: string;
  total?: number;
  defaultMethod?: PayMethod;
  defaultSplit?: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const bill = table?.bill ?? null;
  const billId = billIdOverride ?? bill?.id ?? '';
  const total = totalOverride ?? bill?.total ?? 0;
  const billNumber = billNumberOverride ?? bill?.number ?? '';
  const activeSession = bill?.activeSession && totalOverride === undefined;
  const availableMethods = bill?.memberId
    ? METHODS
    : METHODS.filter((entry) => entry.value !== 'balance');

  const [method, setMethod] = useState<PayMethod>(defaultMethod);
  const [split, setSplit] = useState(defaultSplit);
  const [rows, setRows] = useState<SplitRow[]>([]);
  const [tendered, setTendered] = useState(total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMethod(defaultMethod);
    setSplit(defaultSplit);
    setTendered(total);
    setError(null);
    setLoading(false);
    if (defaultSplit) {
      const first = Math.floor(total / 2 / 1000) * 1000;
      setRows([
        { id: 'row-1', method: defaultMethod, amount: first },
        { id: 'row-2', method: 'qris', amount: total - first },
      ]);
    } else {
      setRows([{ id: 'row-1', method: defaultMethod, amount: total }]);
    }
  }, [open, billId, total, defaultMethod, defaultSplit]);

  const splitTotal = rows.reduce((sum, row) => sum + row.amount, 0);
  const remaining = total - splitTotal;
  const change = method === 'cash' ? Math.max(0, (tendered || total) - total) : 0;
  const canPay = activeSession
    ? false
    : split
      ? splitTotal === total && rows.every((row) => row.amount > 0) && total > 0
      : total > 0;

  function toggleSplit(next: boolean) {
    setSplit(next);
    if (next) {
      const first = Math.floor(total / 2 / 1000) * 1000;
      setRows([
        { id: 'row-1', method, amount: first },
        { id: 'row-2', method: method === 'qris' ? 'cash' : 'qris', amount: total - first },
      ]);
    }
  }

  async function submit() {
    if (!billId) return;
    setLoading(true);
    setError(null);
    const payments = split
      ? rows.map((row) => ({ method: row.method, amount: row.amount }))
      : [
          {
            method,
            amount: total,
            tendered: method === 'cash' ? Math.max(tendered || total, total) : undefined,
          },
        ];
    const result = await payBillAction(billId, payments);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    toast.success('Pembayaran berhasil', {
      description: `${result.data?.billNumber ?? billNumber} · ${formatRp(result.data?.total ?? total)}`,
      action: {
        label: 'Cetak struk',
        onClick: () => window.open(`/print/bill/${billId}`, '_blank'),
      },
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
      title="Pembayaran bill"
      subtitle={table ? `Meja ${table.code} · ${billNumber}` : undefined}
      icon="payments"
      size="lg"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-outline">Total tagihan</div>
            <div className="numeric text-numeric-md font-bold text-primary">{formatRp(total)}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading} className="hidden sm:flex">
              Batal
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1 sm:flex-none"
              onClick={submit}
              loading={loading}
              disabled={!canPay}
            >
              <Icon name="lock_open" className="text-[18px]" />
              Bayar &amp; tutup bill
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-outline-variant/25 bg-surface-container p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase tracking-[0.12em] text-outline">Total akhir</span>
              <div className="numeric mt-1 text-[34px] font-extrabold leading-none tracking-tight text-on-surface">
                {formatRp(total)}
              </div>
              <p className="mt-1.5 text-[10px] text-on-surface-variant">
                {bill
                  ? `${bill.orders.length} order · ${bill.sessions.length} sesi · PB1 ${(
                      bill.taxRateBps / 100
                    ).toFixed(0)}% + service ${(bill.serviceRateBps / 100).toFixed(0)}%`
                  : 'Tagihan sesi aktif'}
              </p>
            </div>
            <Badge tone="primary" dot>
              Open bill
            </Badge>
          </div>
          {bill?.pendingOrdersCount ? (
            <div className="mt-2 rounded-lg border border-error/25 bg-error/10 px-2.5 py-1.5 text-[11px] text-error">
              Masih ada {bill.pendingOrdersCount} self-order pending. Approve atau tolak dulu.
            </div>
          ) : null}
          {activeSession ? (
            <div className="mt-2 rounded-lg border border-tertiary/25 bg-tertiary/10 px-2.5 py-1.5 text-[11px] text-tertiary">
              Sesi billiard masih berjalan. Stop sesi sebelum pembayaran.
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-label-badge font-bold uppercase tracking-[0.1em] text-outline">
            Metode pembayaran
          </span>
          <button
            type="button"
            onClick={() => toggleSplit(!split)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors',
              split
                ? 'border-secondary/40 bg-secondary/15 text-secondary'
                : 'border-outline-variant/40 text-on-surface-variant hover:text-on-surface',
            )}
          >
            <Icon name="call_split" className="text-[14px]" />
            Split bill
          </button>
        </div>

        {!split ? (
          <div className="grid grid-cols-2 gap-2">
            {availableMethods.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setMethod(entry.value)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all',
                  method === entry.value
                    ? entry.className
                    : 'border-outline-variant/30 bg-surface-container text-on-surface-variant hover:border-outline-variant/60 hover:text-on-surface',
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/30">
                  <Icon name={entry.icon} className="text-[19px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-body-sm font-bold">{entry.label}</span>
                  <span className="block truncate text-[10px] opacity-70">{entry.description}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_150px_auto] items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container p-2"
              >
                <select
                  value={row.method}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id
                          ? { ...item, method: event.target.value as PayMethod }
                          : item,
                      ),
                    )
                  }
                  className={cn(inputClass, 'h-9 text-body-sm')}
                >
                  {availableMethods.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                <MoneyInput
                  value={row.amount}
                  onChange={(value) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id ? { ...item, amount: value } : item,
                      ),
                    )
                  }
                  className="[&_input]:h-9 [&_input]:text-body-sm"
                />
                <button
                  type="button"
                  disabled={rows.length <= 1}
                  onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error disabled:opacity-30"
                  aria-label="Hapus metode"
                >
                  <Icon name="delete" className="text-[17px]" />
                </button>
                {index === rows.length - 1 ? (
                  <div className="col-span-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        setRows((current) => [
                          ...current,
                          {
                            id: `row-${Date.now()}`,
                            method: 'cash',
                            amount: 0,
                          },
                        ])
                      }
                      className="text-[10px] font-bold uppercase tracking-wider text-secondary hover:text-secondary/80"
                    >
                      + Tambah metode
                    </button>
                    <span
                      className={cn(
                        'numeric text-[11px] font-semibold',
                        remaining === 0 ? 'text-primary' : 'text-tertiary',
                      )}
                    >
                      {remaining === 0
                        ? 'Pas ✓'
                        : remaining > 0
                          ? `Sisa ${formatRp(remaining)}`
                          : `Lebih ${formatRp(Math.abs(remaining))}`}
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {!split && method === 'cash' ? (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Uang diterima</Label>
                <div className="mt-1.5">
                  <MoneyInput value={tendered} onChange={setTendered} />
                </div>
              </div>
              <div className="flex flex-col justify-end">
                <span className="text-[10px] uppercase tracking-wider text-outline">Kembalian</span>
                <span className="numeric text-numeric-md font-bold text-primary">
                  {formatRp(change)}
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {[total, 100_000, 150_000, 200_000, 500_000]
                .filter((value, index, array) => value >= total && array.indexOf(value) === index)
                .slice(0, 5)
                .map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTendered(value)}
                    className="rounded-md bg-surface-container-high px-2 py-1 text-[10px] font-semibold text-on-surface-variant hover:text-primary"
                  >
                    {formatRp(value)}
                  </button>
                ))}
            </div>
          </div>
        ) : null}

        {!split && method !== 'cash' ? (
          <div className="flex items-start gap-2 rounded-lg border border-secondary/20 bg-secondary/[0.05] p-2.5 text-[11px] text-on-surface-variant">
            <Icon name="info" className="mt-0.5 text-[16px] text-secondary" />
            <p>
              Konfirmasi pembayaran {METHODS.find((entry) => entry.value === method)?.label} setelah
              dana diterima. Untuk integrasi gateway otomatis, gunakan webhook payment.
            </p>
          </div>
        ) : null}

        <FormError message={error} />
      </div>
    </Modal>
  );
}

export function DiscountDialog({
  open,
  table,
  onClose,
  onDone,
}: {
  open: boolean;
  table: TableView | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const bill = table?.bill ?? null;
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(bill?.discountAmount ?? 0);
      setReason('');
      setError(null);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, table?.id]);

  const projected = bill
    ? computeBillTotals({
        subtotal: bill.subtotal,
        discountAmount: amount + bill.memberDiscountAmount + bill.promoDiscountAmount,
        taxRateBps: bill.taxRateBps,
        serviceRateBps: bill.serviceRateBps,
      })
    : null;

  async function submit() {
    if (!bill) return;
    setLoading(true);
    setError(null);
    const result = await applyDiscountAction(bill.id, amount, reason);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    toast.success('Diskon diperbarui', { description: `Total ${formatRp(result.data?.total ?? 0)}` });
    setLoading(false);
    onClose();
    onDone?.();
    router.refresh();
  }

  return (
    <Modal
      open={open && Boolean(table)}
      onClose={onClose}
      title="Diskon bill"
      subtitle="Owner-only. Semua diskon masuk audit log."
      icon="percent"
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit} loading={loading}>
            Terapkan diskon
          </Button>
        </div>
      }
    >
      {bill ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-3">
            <div className="flex items-center justify-between text-body-sm">
              <span className="text-on-surface-variant">Subtotal</span>
              <span className="numeric font-semibold text-on-surface">{formatRp(bill.subtotal)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-body-sm">
              <span className="text-on-surface-variant">Diskon manual saat ini</span>
              <span className="numeric font-semibold text-error">
                - {formatRp(bill.discountAmount)}
              </span>
            </div>
            {bill.memberDiscountAmount + bill.promoDiscountAmount > 0 ? (
              <div className="mt-1 flex items-center justify-between text-body-sm">
                <span className="text-on-surface-variant">Member + promo</span>
                <span className="numeric font-semibold text-error">
                  - {formatRp(bill.memberDiscountAmount + bill.promoDiscountAmount)}
                </span>
              </div>
            ) : null}
            {projected ? (
              <div className="mt-2 flex items-center justify-between border-t border-outline-variant/25 pt-2">
                <span className="text-body-sm font-semibold text-on-surface">Total setelah diskon</span>
                <span className="numeric text-numeric-md font-bold text-primary">
                  {formatRp(projected.total)}
                </span>
              </div>
            ) : null}
          </div>

          <div>
            <Label hint="Maks. subtotal">Nominal diskon</Label>
            <div className="mt-1.5">
              <MoneyInput value={amount} onChange={setAmount} />
            </div>
          </div>

          <Textarea
            label="Alasan diskon"
            placeholder="Contoh: Member VIP championship 10%"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />

          <FormError message={error} />
          <p className="text-[10px] text-on-surface-variant">
            Diskon mengurangi dasar pengenaan PB1 dan service charge.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

export function VoidBillDialog({
  open,
  table,
  onClose,
  onDone,
}: {
  open: boolean;
  table: TableView | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const bill = table?.bill ?? null;
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setLoading(false);
    }
  }, [open, table?.id]);

  async function submit() {
    if (!bill) return;
    setLoading(true);
    setError(null);
    const result = await voidBillAction(bill.id, reason);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    toast.success('Bill di-void', { description: 'Stok dikembalikan dan audit log tercatat.' });
    setLoading(false);
    onClose();
    onDone?.();
    router.refresh();
  }

  return (
    <Modal
      open={open && Boolean(table)}
      onClose={onClose}
      title="Void bill"
      subtitle="Aksi sensitif. Bill ditutup tanpa pembayaran dan order dibatalkan."
      icon="warning"
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={loading}
            disabled={reason.trim().length < 3}
          >
            <Icon name="delete_forever" className="text-[17px]" />
            Void bill
          </Button>
        </div>
      }
    >
      {bill ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-body-sm text-error">
            Bill {bill.number} · total {formatRp(bill.total)}. Stok item akan dikembalikan, order
            ditandai cancelled. Aksi ini tidak bisa dibatalkan.
          </div>
          <Textarea
            label="Alasan void"
            placeholder="Contoh: salah input meja / guest batal sebelum order diproses"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <FormError message={error} />
        </div>
      ) : null}
    </Modal>
  );
}
