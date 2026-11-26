'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { refundPaymentAction } from '@/app/actions/payments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Label, Select, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { Switch } from '@/components/ui/switch';
import { PAY_METHOD_LABELS } from '@/lib/constants';
import { cn, formatClock, formatDate, formatRp } from '@/lib/format';
import type { RefundAdminBillView, RefundAdminData, RefundCategory } from '@/lib/types';

const CATEGORY_LABELS: Record<RefundCategory, string> = {
  billiard: 'Billiard',
  fnb: 'F&B Cafe',
  other: 'Lainnya / total bill',
};

export function RefundManager({ data }: { data: RefundAdminData }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RefundAdminBillView | null>(null);
  const [paymentId, setPaymentId] = useState('');
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<RefundCategory>('other');
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const totalBills = data.bills.reduce((sum, bill) => sum + bill.total, 0);
    const refundable = data.bills.reduce(
      (sum, bill) =>
        sum + bill.payments.reduce((inner, payment) => inner + payment.refundableAmount, 0),
      0,
    );
    const fullRefunds = data.bills.filter(
      (bill) => bill.refundedAmount > 0 && bill.refundedAmount >= bill.total,
    ).length;
    return { totalBills, refundable, fullRefunds };
  }, [data.bills]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.bills;
    return data.bills.filter((bill) =>
      `${bill.number} ${bill.tableCode} ${bill.guestName ?? ''}`.toLowerCase().includes(term),
    );
  }, [data.bills, query]);

  const selectedPayment = selected?.payments.find((payment) => payment.id === paymentId) ?? null;
  const maxAmount = selectedPayment?.refundableAmount ?? 0;
  const maxRefund = Math.min(
    maxAmount,
    Math.max(0, (selected?.total ?? 0) - (selected?.refundedAmount ?? 0)),
  );
  const nextRefunded = (selected?.refundedAmount ?? 0) + amount;
  const willBeFull = Boolean(selected && amount > 0 && nextRefunded >= selected.total);

  function openRefund(bill: RefundAdminBillView) {
    const payment = bill.payments.find((entry) => entry.refundableAmount > 0) ?? null;
    setSelected(bill);
    setPaymentId(payment?.id ?? '');
    setAmount(payment?.refundableAmount ?? 0);
    setCategory('other');
    setReason('');
    setRestock(false);
    setError(null);
  }

  function closeRefund() {
    if (busy) return;
    setSelected(null);
    setError(null);
  }

  function changePayment(id: string) {
    setPaymentId(id);
    const payment = selected?.payments.find((entry) => entry.id === id);
    setAmount(payment?.refundableAmount ?? 0);
    setRestock(false);
  }

  async function submit() {
    if (!selected || !selectedPayment) {
      setError('Pilih pembayaran yang akan direfund.');
      return;
    }
    if (amount <= 0) {
      setError('Nominal refund wajib lebih dari 0.');
      return;
    }
    if (amount > maxRefund) {
      setError(`Maksimal refund untuk pembayaran ini ${formatRp(maxRefund)}.`);
      return;
    }
    if (restock && !willBeFull) {
      setError('Stok hanya bisa dikembalikan jika seluruh bill di-refund.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await refundPaymentAction({
      billId: selected.id,
      paymentId: selectedPayment.id,
      amount,
      category,
      reason,
      restock,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Refund dicatat', {
      description: `${formatRp(amount)} · ${PAY_METHOD_LABELS[selectedPayment.method]} · ${selected.number}`,
    });
    setSelected(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Owner console"
        title="Refund & Koreksi"
        description="Refund pembayaran bill yang sudah lunas. Setiap refund tercatat di audit log dan laporan neto."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[17px] text-outline"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari bill, meja, guest…"
                className="h-10 w-[230px] rounded-lg border border-outline-variant/40 bg-surface-container-lowest pl-9 pr-3 text-body-sm text-on-surface placeholder:text-outline/60 focus:border-primary/60 focus:outline-none"
              />
            </div>
            <Button variant="secondary" size="md" onClick={() => router.refresh()}>
              <Icon name="sync" className="text-[18px]" />
              <span className="hidden sm:inline">Sinkron</span>
            </Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Bill lunas 30 hari"
          value={data.bills.length}
          icon="receipt_long"
          tone="primary"
          hint={`Total ${formatRp(stats.totalBills)}`}
        />
        <StatCard
          label="Total refund"
          value={formatRp(data.totalRefunded)}
          icon="undo"
          tone="tertiary"
          hint="Akumulasi refund tercatat"
        />
        <StatCard
          label="Masih bisa direfund"
          value={formatRp(stats.refundable)}
          icon="currency_exchange"
          tone="cyan"
          hint="Sisa nilai payment"
        />
        <StatCard
          label="Bill full refund"
          value={stats.fullRefunds}
          icon="assignment_return"
          tone="error"
          hint="Stok bisa dikembalikan"
        />
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title="Belum ada bill lunas"
          description="Refund hanya tersedia untuk bill yang sudah dibayar dalam 30 hari terakhir."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((bill) => {
            const fullyRefunded = bill.refundedAmount >= bill.total;
            const partiallyRefunded = bill.refundedAmount > 0 && !fullyRefunded;
            const refundable = bill.payments.reduce(
              (sum, payment) => sum + payment.refundableAmount,
              0,
            );
            return (
              <article key={bill.id} className="panel rounded-xl p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="numeric text-body-md font-bold text-on-surface">
                        {bill.number}
                      </span>
                      <Badge tone={bill.tableCode.startsWith('B') ? 'cyan' : 'tertiary'}>
                        {bill.tableCode}
                      </Badge>
                      {fullyRefunded ? (
                        <Badge tone="error" dot>
                          Full refund
                        </Badge>
                      ) : partiallyRefunded ? (
                        <Badge tone="paused" dot>
                          Refund partial
                        </Badge>
                      ) : (
                        <Badge tone="primary" dot>
                          Paid
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-body-sm text-on-surface-variant">
                      {bill.guestName || 'Walk-in guest'}
                      {bill.closedAt
                        ? ` · ${formatDate(bill.closedAt)} ${formatClock(bill.closedAt)}`
                        : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {bill.payments.map((payment) => (
                        <span
                          key={payment.id}
                          className={cn(
                            'rounded-md border px-2 py-1 text-[10px] font-semibold',
                            payment.refundableAmount > 0
                              ? 'border-outline-variant/35 bg-surface-container text-on-surface-variant'
                              : 'border-outline-variant/20 bg-surface-container-lowest text-outline line-through',
                          )}
                        >
                          {PAY_METHOD_LABELS[payment.method]} · {formatRp(payment.amount)}
                          {payment.refundedAmount > 0
                            ? ` · refund ${formatRp(payment.refundedAmount)}`
                            : ''}
                        </span>
                      ))}
                    </div>
                    {bill.refunds.length > 0 ? (
                      <div className="mt-2 flex flex-col gap-1 rounded-lg border border-error/20 bg-error/[0.04] p-2.5">
                        {bill.refunds.map((refund) => (
                          <div
                            key={refund.id}
                            className="flex flex-col gap-0.5 text-[10px] text-on-surface-variant sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span>
                              <b className="text-error">−{formatRp(refund.amount)}</b> ·{' '}
                              {CATEGORY_LABELS[refund.category]} · {refund.staffName}
                              {refund.restocked ? ' · stok kembali' : ''}
                            </span>
                            <span className="text-outline">
                              {formatClock(refund.createdAt)} · {refund.reason}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-4 lg:flex-col lg:items-end">
                    <div className="text-right">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-outline">
                        Total bill
                      </div>
                      <div className="numeric text-body-lg font-bold text-on-surface">
                        {formatRp(bill.total)}
                      </div>
                      <div className="text-[10px] text-outline">
                        Refund {formatRp(bill.refundedAmount)} · sisa {formatRp(refundable)}
                      </div>
                    </div>
                    <Button
                      variant={fullyRefunded ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => openRefund(bill)}
                      disabled={refundable <= 0}
                    >
                      <Icon name="undo" className="text-[17px]" />
                      Refund
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={closeRefund}
        title={selected ? `Refund ${selected.number}` : 'Refund'}
        subtitle={
          selected
            ? `Meja ${selected.tableCode} · total ${formatRp(selected.total)} · sudah refund ${formatRp(selected.refundedAmount)}`
            : undefined
        }
        icon="undo"
        size="md"
        footer={
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg border border-outline-variant/25 bg-surface-container px-3 py-2">
              <span className="text-body-sm text-on-surface-variant">Sisa setelah refund</span>
              <span className="numeric text-body-md font-bold text-primary">
                {formatRp(Math.max(0, (selected?.total ?? 0) - nextRefunded))}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={closeRefund} disabled={busy}>
                Batal
              </Button>
              <Button
                variant="primary"
                className="flex-[2]"
                onClick={submit}
                loading={busy}
                disabled={!selectedPayment || amount <= 0}
              >
                <Icon name="undo" className="text-[18px]" />
                Proses refund {formatRp(amount)}
              </Button>
            </div>
            <FormError message={error} />
          </div>
        }
      >
        {selected ? (
          <div className="flex flex-col gap-3">
            <div>
              <Label>Pembayaran yang direfund</Label>
              <Select
                className="mt-1.5"
                value={paymentId}
                onChange={(event) => changePayment(event.target.value)}
              >
                {selected.payments.map((payment) => (
                  <option
                    key={payment.id}
                    value={payment.id}
                    disabled={payment.refundableAmount <= 0}
                  >
                    {PAY_METHOD_LABELS[payment.method]} · {formatRp(payment.amount)} · sisa{' '}
                    {formatRp(payment.refundableAmount)}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label hint={`Maks ${formatRp(maxRefund)}`}>Nominal refund</Label>
              <div className="mt-1.5">
                <MoneyInput
                  value={amount}
                  onChange={(value) => {
                    const next = Math.min(value, maxRefund);
                    setAmount(next);
                    if (!selected || selected.refundedAmount + next < selected.total) {
                      setRestock(false);
                    }
                  }}
                />
              </div>
            </div>

            <div>
              <Label>Kategori refund</Label>
              <Select
                className="mt-1.5"
                value={category}
                onChange={(event) => setCategory(event.target.value as RefundCategory)}
              >
                {(Object.keys(CATEGORY_LABELS) as RefundCategory[]).map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Alasan refund</Label>
              <Textarea
                className="mt-1.5"
                rows={2}
                maxLength={240}
                placeholder="Contoh: double payment, customer batal, meja rusak…"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>

            <Switch
              checked={restock}
              onChange={setRestock}
              disabled={!willBeFull}
              label="Kembalikan stok menu"
              description={
                willBeFull
                  ? 'Seluruh item bill akan dikembalikan ke stok. Hanya bisa dilakukan sekali.'
                  : 'Aktif hanya jika refund ini melunasi seluruh bill.'
              }
            />

            <div className="rounded-lg border border-tertiary/25 bg-tertiary/[0.06] p-2.5 text-[10px] leading-4 text-on-surface-variant">
              <b className="text-tertiary">Refund manual.</b> Untuk QRIS/EDC, refund dicatat di POS;
              proses pengembalian dana di gateway/EDC dilakukan terpisah sampai integrasi refund
              otomatis tersedia.
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
