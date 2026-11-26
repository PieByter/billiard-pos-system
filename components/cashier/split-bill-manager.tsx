'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  createBillSplitsAction,
  payBillSplitAction,
  resetBillSplitsAction,
} from '@/app/actions/splits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Label, Select } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { MoneyInput } from '@/components/ui/money-input';
import { SectionHeader } from '@/components/ui/stat-card';
import { allocateSplitTotals, computeBillTotals } from '@/lib/billing';
import { PAY_METHOD_LABELS } from '@/lib/constants';
import { cn, formatClock, formatRp } from '@/lib/format';
import type { BillSplitView, PayMethod, SplitBillData } from '@/lib/types';

type Entry = {
  key: string;
  type: 'order_item' | 'session';
  refId: string;
  name: string;
  meta: string;
  qty: number;
  amount: number;
};

type Group = { id: string; label: string };

const METHODS: PayMethod[] = ['cash', 'qris', 'edc', 'transfer'];

export function SplitBillManager({ data }: { data: SplitBillData }) {
  const router = useRouter();
  const entries = useMemo<Entry[]>(() => {
    const sessionEntries: Entry[] = data.bill.sessions.map((session, index) => ({
      key: `session:${session.id}`,
      type: 'session',
      refId: session.id,
      name: `Sesi Billiard #${index + 1}`,
      meta: `${formatRp(session.ratePerHour)}/jam`,
      qty: 1,
      amount: session.amount ?? session.estimate,
    }));
    const itemEntries: Entry[] = data.bill.orders
      .filter((order) => order.status !== 'cancelled')
      .flatMap((order) =>
        order.items.map((item) => ({
          key: `item:${item.id}`,
          type: 'order_item' as const,
          refId: item.id,
          name: item.name,
          meta: order.number,
          qty: item.qty,
          amount: item.price * item.qty,
        })),
      );
    return [...sessionEntries, ...itemEntries];
  }, [data.bill]);

  const [groups, setGroups] = useState<Group[]>([
    { id: 'g1', label: 'Group 1' },
    { id: 'g2', label: 'Group 2' },
  ]);
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    Object.fromEntries(entries.map((entry, index) => [entry.key, index % 2 === 0 ? 'g1' : 'g2'])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paySplit, setPaySplit] = useState<BillSplitView | null>(null);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [tendered, setTendered] = useState(0);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const locked =
    data.bill.status !== 'open' ||
    Boolean(data.bill.activeSession) ||
    data.bill.pendingOrdersCount > 0;
  const paidSplits = data.splits.filter((split) => split.status === 'paid').length;
  const groupSubtotals = groups.map((group) =>
    entries
      .filter((entry) => assignments[entry.key] === group.id)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
  const allocatedTotal = groupSubtotals.reduce((sum, value) => sum + value, 0);
  const unassigned = entries.filter((entry) => !assignments[entry.key]).length;
  const previewTotals =
    data.splits.length === 0 && allocatedTotal === data.bill.subtotal
      ? allocateSplitTotals(groupSubtotals, {
          subtotal: data.bill.subtotal,
          discountAmount: data.bill.totalDiscountAmount,
          taxRateBps: data.bill.taxRateBps,
          serviceRateBps: data.bill.serviceRateBps,
        })
      : null;
  if (previewTotals && previewTotals.length > 0 && data.bill.penaltyAmount > 0) {
    previewTotals[previewTotals.length - 1].total += data.bill.penaltyAmount;
  }
  const expected = computeBillTotals({
    subtotal: data.bill.subtotal,
    discountAmount: data.bill.totalDiscountAmount,
    taxRateBps: data.bill.taxRateBps,
    serviceRateBps: data.bill.serviceRateBps,
  });

  function addGroup() {
    if (groups.length >= 10) return;
    const next = groups.length + 1;
    setGroups((current) => [...current, { id: `g${next}`, label: `Group ${next}` }]);
  }

  function removeGroup(group: Group) {
    if (groups.length <= 2) return;
    setGroups((current) => current.filter((item) => item.id !== group.id));
    setAssignments((current) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(next)) {
        if (value === group.id) next[key] = groups[0].id;
      }
      return next;
    });
  }

  function assign(key: string, groupId: string) {
    setAssignments((current) => ({ ...current, [key]: groupId }));
  }

  async function saveSplits() {
    if (unassigned > 0) {
      setError('Semua item dan sesi harus dialokasikan.');
      return;
    }
    if (groupSubtotals.some((value) => value <= 0)) {
      setError('Setiap group harus memiliki minimal satu item/sesi.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await createBillSplitsAction(
      data.bill.id,
      groups.map((group) => ({
        label: group.label,
        itemIds: entries
          .filter((entry) => entry.type === 'order_item' && assignments[entry.key] === group.id)
          .map((entry) => entry.refId),
        sessionIds: entries
          .filter((entry) => entry.type === 'session' && assignments[entry.key] === group.id)
          .map((entry) => entry.refId),
      })),
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Pembagian bill disimpan', {
      description: `${result.data?.splits.length ?? groups.length} group siap dibayar.`,
    });
    router.refresh();
  }

  async function resetSplits() {
    setSaving(true);
    const result = await resetBillSplitsAction(data.bill.id);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Pembagian direset');
    router.refresh();
  }

  async function pay() {
    if (!paySplit) return;
    setPaying(true);
    setPayError(null);
    const result = await payBillSplitAction(paySplit.id, [
      {
        method,
        amount: paySplit.total,
        tendered: method === 'cash' ? Math.max(tendered || paySplit.total, paySplit.total) : undefined,
      },
    ]);
    setPaying(false);
    if (!result.ok) {
      setPayError(result.error);
      return;
    }
    toast.success(result.data?.billClosed ? 'Bill lunas' : `Group ${paySplit.label} lunas`, {
      description: `${paySplit.label} · ${formatRp(paySplit.total)}`,
      action: {
        label: 'Cetak struk',
        onClick: () => window.open(`/print/split/${paySplit.id}`, '_blank'),
      },
    });
    setPaySplit(null);
    router.refresh();
    if (result.data?.billClosed) router.push('/staff/cashier');
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Split payment"
        title={`Split bill ${data.bill.number}`}
        description={`Meja ${data.table.code} · ${formatRp(data.bill.total)} · ${data.bill.sessions.length} sesi / ${data.bill.orders.length} order`}
        actions={
          <Link
            href="/staff/cashier"
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant/35 bg-surface-container px-3 py-2 text-body-sm font-semibold text-on-surface-variant hover:text-primary"
          >
            <Icon name="arrow_back" className="text-[17px]" />
            Kembali
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="panel rounded-xl p-3">
          <span className="text-label-badge font-bold uppercase tracking-wider text-outline">Total bill</span>
          <p className="numeric mt-1 text-numeric-md font-bold text-primary">{formatRp(data.bill.total)}</p>
        </div>
        <div className="panel rounded-xl p-3">
          <span className="text-label-badge font-bold uppercase tracking-wider text-outline">Split group</span>
          <p className="numeric mt-1 text-numeric-md font-bold text-on-surface">
            {data.splits.length || groups.length}
          </p>
        </div>
        <div className="panel rounded-xl p-3">
          <span className="text-label-badge font-bold uppercase tracking-wider text-outline">Sudah dibayar</span>
          <p className="numeric mt-1 text-numeric-md font-bold text-primary">{paidSplits}</p>
        </div>
        <div className="panel rounded-xl p-3">
          <span className="text-label-badge font-bold uppercase tracking-wider text-outline">Sisa group</span>
          <p className="numeric mt-1 text-numeric-md font-bold text-tertiary">
            {Math.max(0, data.splits.length - paidSplits)}
          </p>
        </div>
      </div>

      {locked && data.splits.length === 0 ? (
        <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-body-sm text-error">
          Split hanya bisa dibuat setelah sesi billiard dihentikan, order pending selesai, dan bill masih open.
        </div>
      ) : null}

      {data.splits.length === 0 ? (
        <>
          <section className="panel flex flex-col gap-3 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-headline-md font-bold text-on-surface">Alokasikan item ke group</h2>
                <p className="mt-0.5 text-body-sm text-on-surface-variant">
                  Setiap item/sesi hanya boleh masuk satu group. Total group harus sama dengan subtotal bill.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={addGroup} disabled={groups.length >= 10}>
                <Icon name="person_add" className="text-[16px]" />
                Tambah group
              </Button>
            </div>

            <div className="flex flex-col divide-y divide-outline-variant/10">
              {entries.map((entry) => (
                <div key={entry.key} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={entry.type === 'session' ? 'cyan' : 'tertiary'}>
                        {entry.type === 'session' ? 'Sesi' : 'F&B'}
                      </Badge>
                      <span className="truncate text-body-sm font-semibold text-on-surface">
                        {entry.name}
                      </span>
                      {entry.qty > 1 ? (
                        <span className="text-[10px] text-outline">×{entry.qty}</span>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-outline">{entry.meta}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="numeric text-body-sm font-semibold text-on-surface">
                      {formatRp(entry.amount)}
                    </span>
                    <select
                      value={assignments[entry.key] ?? ''}
                      onChange={(event) => assign(entry.key, event.target.value)}
                      className="h-9 rounded-lg border border-outline-variant/45 bg-surface-container-lowest px-2 text-body-sm text-on-surface focus:border-primary/60 focus:outline-none"
                    >
                      <option value="">Belum dialokasikan</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((group, index) => (
                <div key={group.id} className="rounded-xl border border-outline-variant/25 bg-surface-container p-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      value={group.label}
                      onChange={(event) =>
                        setGroups((current) =>
                          current.map((item) =>
                            item.id === group.id ? { ...item, label: event.target.value.slice(0, 40) } : item,
                          ),
                        )
                      }
                      className="h-8 min-w-0 flex-1 rounded-md border border-outline-variant/35 bg-surface-container-lowest px-2 text-body-sm font-semibold text-on-surface focus:border-primary/60 focus:outline-none"
                    />
                    {groups.length > 2 ? (
                      <button
                        type="button"
                        onClick={() => removeGroup(group)}
                        className="text-outline hover:text-error"
                        aria-label="Hapus group"
                      >
                        <Icon name="close" className="text-[16px]" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-outline">Subtotal</span>
                    <span className="numeric font-bold text-on-surface">
                      {formatRp(groupSubtotals[index])}
                    </span>
                  </div>
                  {previewTotals?.[index] ? (
                    <div className="mt-1 text-[10px] text-on-surface-variant">
                      + pajak/service →{' '}
                      <span className="numeric font-semibold text-primary">
                        {formatRp(previewTotals[index].total)}
                      </span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/20 pt-2 text-body-sm">
              <span className="text-on-surface-variant">
                Dialokasikan {formatRp(allocatedTotal)} / {formatRp(data.bill.subtotal)}
                {unassigned > 0 ? ` · ${unassigned} belum` : ' · lengkap'}
              </span>
              <span className="numeric text-primary">
                Total bill {formatRp(expected.total + data.bill.penaltyAmount)}
              </span>
            </div>
            <FormError message={error} />
            <Button
              variant="primary"
              size="lg"
              onClick={saveSplits}
              loading={saving}
              disabled={locked || unassigned > 0 || groups.length < 2}
            >
              <Icon name="call_split" className="text-[18px]" />
              Simpan pembagian
            </Button>
          </section>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-body-sm text-on-surface-variant">
              {paidSplits}/{data.splits.length} group sudah dibayar. Bill tetap open sampai semua group lunas.
            </div>
            {data.splits.every((split) => split.status === 'open' && split.paidAmount === 0) ? (
              <Button variant="ghost" size="sm" onClick={resetSplits} loading={saving}>
                <Icon name="restart_alt" className="text-[16px]" />
                Ubah pembagian
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {data.splits.map((split) => (
              <section key={split.id} className="panel rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-body-md font-bold text-on-surface">{split.label}</span>
                      <Badge tone={split.status === 'paid' ? 'primary' : 'paused'} dot>
                        {split.status === 'paid' ? 'Lunas' : 'Open'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-outline">
                      {split.items.map((item) => `${item.qty}× ${item.name}`).join(' · ')}
                    </p>
                  </div>
                  <span className="numeric text-body-md font-bold text-primary">
                    {formatRp(split.total)}
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-1 border-t border-outline-variant/20 pt-2 text-[11px]">
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Subtotal</span>
                    <span className="numeric">{formatRp(split.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-on-surface-variant">
                    <span>PB1 + service</span>
                    <span className="numeric">{formatRp(split.taxAmount + split.serviceAmount)}</span>
                  </div>
                  {split.discountAmount > 0 ? (
                    <div className="flex justify-between text-error">
                      <span>Diskon</span>
                      <span className="numeric">- {formatRp(split.discountAmount)}</span>
                    </div>
                  ) : null}
                  <div className="mt-1 flex justify-between border-t border-outline-variant/20 pt-1 font-bold text-on-surface">
                    <span>Total group</span>
                    <span className="numeric">{formatRp(split.total)}</span>
                  </div>
                </div>

                <div className="mt-3">
                  {split.status === 'paid' ? (
                    <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/[0.05] px-2.5 py-2 text-[11px] text-primary">
                      <span className="flex items-center gap-1">
                        <Icon name="check_circle" className="text-[16px]" />
                        Dibayar {split.paidAt ? formatClock(split.paidAt) : ''}
                      </span>
                      <span className="numeric font-bold">{formatRp(split.paidAmount)}</span>
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      size="md"
                      className="w-full"
                      onClick={() => {
                        setPaySplit(split);
                        setMethod('cash');
                        setTendered(split.total);
                        setPayError(null);
                      }}
                      disabled={locked}
                    >
                      <Icon name="payments" className="text-[17px]" />
                      Bayar group · {formatRp(split.total)}
                    </Button>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      <Modal
        open={Boolean(paySplit)}
        onClose={() => (paying ? undefined : setPaySplit(null))}
        title={paySplit ? `Bayar ${paySplit.label}` : 'Bayar group'}
        subtitle={paySplit ? `${formatRp(paySplit.total)} · ${data.bill.number}` : undefined}
        icon="payments"
        size="sm"
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="primary" size="lg" onClick={pay} loading={paying} disabled={!paySplit}>
              <Icon name="lock_open" className="text-[18px]" />
              Bayar {paySplit ? formatRp(paySplit.total) : ''}
            </Button>
            <FormError message={payError} />
          </div>
        }
      >
        {paySplit ? (
          <div className="flex flex-col gap-3">
            <div>
              <Label>Metode</Label>
              <Select
                className="mt-1.5"
                value={method}
                onChange={(event) => setMethod(event.target.value as PayMethod)}
              >
                {METHODS.map((value) => (
                  <option key={value} value={value}>
                    {PAY_METHOD_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>
            {method === 'cash' ? (
              <div>
                <Label>Uang diterima</Label>
                <div className="mt-1.5">
                  <MoneyInput value={tendered} onChange={setTendered} />
                </div>
                <p className="mt-1 text-[10px] text-outline">
                  Kembalian {formatRp(Math.max(0, (tendered || paySplit.total) - paySplit.total))}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-secondary/20 bg-secondary/[0.05] p-2.5 text-[11px] text-on-surface-variant">
                Konfirmasi setelah dana {PAY_METHOD_LABELS[method]} diterima.
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
