'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { callWaiterAction } from '@/app/actions/orders';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/stat-card';
import { cn, formatClock, formatRp } from '@/lib/format';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import type { CustomerData, CustomerOrderView, MenuItemView } from '@/lib/types';

export type CartMap = Record<string, { qty: number; note: string }>;
export type CartLineView = { item: MenuItemView; qty: number; note: string };

const ORDER_STEPS: Array<{
  key: 'created' | 'accepted' | 'preparing' | 'ready' | 'served';
  label: string;
  icon: string;
  description: string;
}> = [
  { key: 'created', label: 'Pesanan terkirim', icon: 'send', description: 'Masuk ke antrean kasir' },
  { key: 'accepted', label: 'Diterima kasir', icon: 'fact_check', description: 'Divalidasi & dikirim ke dapur' },
  { key: 'preparing', label: 'Sedang disiapkan', icon: 'skillet', description: 'Kitchen & bar menyiapkan pesanan' },
  { key: 'ready', label: 'Siap diantar', icon: 'room_service', description: 'Menunggu runner ke meja' },
  { key: 'served', label: 'Disajikan', icon: 'done_all', description: 'Selamat menikmati' },
];

export function CartSheet({
  open,
  onClose,
  tableCode,
  lines,
  onQty,
  onNote,
  orderNote,
  setOrderNote,
  subtotal,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  tableCode: string;
  lines: CartLineView[];
  onQty: (itemId: string, qty: number) => void;
  onNote: (itemId: string, note: string) => void;
  orderNote: string;
  setOrderNote: (value: string) => void;
  subtotal: number;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const count = lines.reduce((sum, line) => sum + line.qty, 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Keranjang meja ${tableCode}`}
      subtitle={`${count} item · harga final dihitung kasir`}
      icon="shopping_bag"
      size="md"
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-body-sm text-on-surface-variant">Subtotal ({count} item)</span>
            <span className="numeric text-numeric-md font-bold text-primary">{formatRp(subtotal)}</span>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={onSubmit}
            loading={submitting}
            disabled={lines.length === 0 || submitting}
          >
            <Icon name="send" className="text-[18px]" />
            Kirim pesanan ke dapur &amp; kasir
          </Button>
          <div className="flex items-center justify-center gap-1 text-[10px] text-on-surface-variant/70">
            <Icon name="lock" className="text-[13px] text-primary" />
            Idempotency protected · double-tap safe · kasir akan konfirmasi
          </div>
          <FormError message={error} />
        </div>
      }
    >
      <div className="flex flex-col gap-2.5">
        {lines.length === 0 ? (
          <EmptyState compact icon="shopping_cart" title="Keranjang kosong" />
        ) : (
          lines.map((line) => (
            <div
              key={line.item.id}
              className="rounded-xl border border-outline-variant/25 bg-surface-container p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                    <Icon name={line.item.imageIcon} className="text-[20px]" />
                  </span>
                  <div className="min-w-0">
                    <h4 className="truncate text-body-sm font-bold text-on-surface">{line.item.name}</h4>
                    <span className="numeric text-[11px] text-primary">
                      {formatRp(line.item.price)} / pcs
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-lg bg-surface-container-highest p-0.5">
                    <button
                      type="button"
                      onClick={() => onQty(line.item.id, line.qty - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-container text-on-surface transition-colors hover:text-error"
                    >
                      <Icon name="remove" className="text-[16px]" />
                    </button>
                    <span className="numeric w-5 text-center text-body-sm font-bold">{line.qty}</span>
                    <button
                      type="button"
                      onClick={() => onQty(line.item.id, line.qty + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-container text-on-surface transition-colors hover:text-primary"
                    >
                      <Icon name="add" className="text-[16px]" />
                    </button>
                  </div>
                </div>
              </div>
              <input
                value={line.note}
                onChange={(event) => onNote(line.item.id, event.target.value)}
                maxLength={240}
                placeholder="Catatan: less sugar, pedas sedang, tanpa es…"
                className="mt-2 h-9 w-full rounded-lg border border-outline-variant/35 bg-surface-container-lowest px-2.5 text-[11px] text-on-surface placeholder:text-outline/60 focus:border-primary/50 focus:outline-none"
              />
              <div className="mt-1 flex justify-end">
                <span className="numeric text-[11px] font-semibold text-on-surface">
                  {formatRp(line.item.price * line.qty)}
                </span>
              </div>
            </div>
          ))
        )}

        <Textarea
          label="Catatan untuk kasir"
          hint="Opsional"
          rows={2}
          placeholder="Contoh: antar setelah semua makanan siap."
          value={orderNote}
          onChange={(event) => setOrderNote(event.target.value)}
        />

        <div className="flex items-start gap-2 rounded-lg border border-secondary/20 bg-secondary/[0.06] p-2.5 text-[10px] leading-4 text-on-surface-variant">
          <Icon name="info" className="mt-0.5 text-[16px] text-secondary" />
          Pesanan digabung ke bill meja {tableCode}. Pembayaran dilakukan di kasir setelah kasir
          menyetujui order.
        </div>
      </div>
    </Modal>
  );
}

export function TrackerSheet({
  open,
  onClose,
  orders,
  bill,
  hasOpenServiceRequest,
  onCallWaiter,
}: {
  open: boolean;
  onClose: () => void;
  orders: CustomerOrderView[];
  bill: CustomerData['bill'];
  hasOpenServiceRequest: boolean;
  onCallWaiter: () => void;
}) {
  const latest =
    orders.find((order) => ['pending', 'accepted', 'preparing', 'ready'].includes(order.status)) ??
    orders[0] ??
    null;
  const activeCount = orders.filter((order) =>
    ['pending', 'accepted', 'preparing', 'ready'].includes(order.status),
  ).length;

  const timestampFor = (order: CustomerOrderView, key: string) => {
    if (key === 'created') return order.createdAt;
    return (order as unknown as Record<string, string | null>)[key] ?? null;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Status pesanan"
      subtitle={
        latest
          ? `${latest.number} · ${ORDER_STATUS_LABELS[latest.status]}`
          : 'Belum ada order aktif'
      }
      icon="radar"
      size="md"
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="md" className="w-full" onClick={onCallWaiter}>
            <Icon name="notifications_active" className="text-[18px]" />
            {hasOpenServiceRequest ? 'Waiter sudah dipanggil' : 'Panggil waiter / minta bantuan'}
          </Button>
          <p className="text-center text-[10px] text-on-surface-variant/70">
            Live update setiap 8 detik · {activeCount} order aktif
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {!latest ? (
          <EmptyState
            icon="receipt_long"
            title="Belum ada pesanan"
            description="Tambahkan menu dari katalog untuk mulai memesan."
          />
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-outline-variant/25 bg-surface-container p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                  <Icon name="sync" className="animate-pulse text-[20px]" />
                </span>
                <div>
                  <div className="text-body-sm font-bold text-on-surface">
                    {ORDER_STATUS_LABELS[latest.status]}
                  </div>
                  <div className="text-[10px] text-on-surface-variant">
                    {latest.number} · {formatClock(latest.createdAt)}
                  </div>
                </div>
              </div>
              <Badge
                tone={
                  latest.status === 'pending'
                    ? 'error'
                    : latest.status === 'ready'
                      ? 'primary'
                      : latest.status === 'served'
                        ? 'neutral'
                        : 'cyan'
                }
                dot
                pulse={latest.status === 'pending'}
              >
                Live
              </Badge>
            </div>

            {latest.status === 'cancelled' ? (
              <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-body-sm text-error">
                Pesanan ini dibatalkan kasir. Silakan hubungi waiter untuk bantuan.
              </div>
            ) : (
              <div className="relative flex flex-col gap-3 pl-6">
                <div className="absolute bottom-4 left-2.5 top-4 w-px bg-outline-variant/40" />
                {ORDER_STEPS.map((step) => {
                  const at = timestampFor(latest, step.key);
                  const completed = Boolean(at);
                  const isActive =
                    !at &&
                    latest.status !== 'served' &&
                    ORDER_STEPS.findIndex(
                      (entry) => !timestampFor(latest, entry.key) && entry.key !== 'created',
                    ) === ORDER_STEPS.findIndex((entry) => entry.key === step.key);
                  return (
                    <div key={step.key} className={cn('relative flex items-start gap-2.5', !completed && !isActive && 'opacity-45')}>
                      <span
                        className={cn(
                          'absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full border',
                          completed
                            ? 'border-primary bg-primary text-on-primary'
                            : isActive
                              ? 'animate-pulse border-secondary bg-secondary/20 text-secondary'
                              : 'border-outline-variant bg-surface-container text-outline',
                        )}
                      >
                        <Icon name={completed ? 'check' : step.icon} className="text-[12px]" />
                      </span>
                      <div>
                        <div
                          className={cn(
                            'text-body-sm font-bold',
                            completed ? 'text-on-surface' : isActive ? 'text-secondary' : 'text-on-surface-variant',
                          )}
                        >
                          {step.label}
                        </div>
                        <div className="text-[10px] text-on-surface-variant">
                          {at ? `${formatClock(at)} · ${step.description}` : step.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-xl border border-outline-variant/25 bg-surface-container p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-label-badge font-bold uppercase tracking-wider text-outline">
                  Item pesanan
                </span>
                <span className="numeric text-[10px] text-on-surface-variant">
                  {formatRp(latest.subtotal)}
                </span>
              </div>
              {latest.items.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-start justify-between gap-2 py-0.5">
                  <div>
                    <span className="text-body-sm text-on-surface">
                      {item.qty}× {item.name}
                    </span>
                    {item.note ? (
                      <p className="text-[10px] italic text-on-surface-variant">“{item.note}”</p>
                    ) : null}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-outline">
                    {item.station === 'bar' ? 'bar' : 'kitchen'}
                  </span>
                </div>
              ))}
            </div>

            {orders.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-label-badge font-bold uppercase tracking-wider text-outline">
                  Order lain
                </span>
                {orders.slice(1, 5).map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2.5 py-2"
                  >
                    <div>
                      <div className="numeric text-[11px] font-semibold text-on-surface">
                        {order.number}
                      </div>
                      <div className="text-[9px] text-outline">
                        {order.items.map((item) => `${item.qty}× ${item.name}`).join(', ')}
                      </div>
                    </div>
                    <Badge
                      tone={
                        order.status === 'pending'
                          ? 'error'
                          : order.status === 'ready'
                            ? 'primary'
                            : order.status === 'served'
                              ? 'neutral'
                              : 'cyan'
                      }
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}

        {bill ? (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-3">
            <div className="flex items-center justify-between">
              <span className="text-body-sm font-semibold text-on-surface">Total bill berjalan</span>
              <span className="numeric text-numeric-md font-bold text-primary">
                {formatRp(bill.total)}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-on-surface-variant">
              {bill.number} · pembayaran di kasir saat checkout
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export function ServiceSheet({
  open,
  onClose,
  token,
  hasOpenRequest,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  hasOpenRequest: boolean;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<'waiter' | 'bill' | 'assistance'>('waiter');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType('waiter');
      setNote('');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const options = [
    { value: 'waiter' as const, label: 'Panggil waiter', icon: 'notifications_active', description: 'Butuh bantuan di meja' },
    { value: 'bill' as const, label: 'Minta bill', icon: 'receipt_long', description: 'Siap untuk checkout' },
    { value: 'assistance' as const, label: 'Bantuan lain', icon: 'support_agent', description: 'Cue, chalk, alat, dll.' },
  ];

  async function submit() {
    setLoading(true);
    setError(null);
    const result = await callWaiterAction({ token, type, note: note || null });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Panggilan terkirim ke kasir', {
      description: 'Waiter akan segera datang ke meja.',
    });
    onSuccess();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Panggil waiter"
      subtitle="Panggilan langsung muncul di layar kasir."
      icon="notifications_active"
      size="sm"
      footer={
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={submit}
            loading={loading}
            disabled={hasOpenRequest}
          >
            <Icon name="send" className="text-[18px]" />
            Kirim panggilan
          </Button>
          <FormError message={error} />
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        {hasOpenRequest ? (
          <div className="rounded-lg border border-tertiary/30 bg-tertiary/10 p-3 text-body-sm text-tertiary">
            <span className="flex items-center gap-1.5 font-semibold">
              <Icon name="hourglass_top" className="text-[18px]" />
              Waiter sudah dipanggil
            </span>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              Tim kami sudah menerima notifikasi. Panggilan baru bisa dikirim setelah yang ini
              selesai.
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setType(option.value)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                type === option.value
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-high',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg',
                  type === option.value
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-high text-on-surface-variant',
                )}
              >
                <Icon name={option.icon} className="text-[19px]" />
              </span>
              <span className="flex-1">
                <span className="block text-body-sm font-bold text-on-surface">{option.label}</span>
                <span className="block text-[10px] text-on-surface-variant">
                  {option.description}
                </span>
              </span>
              <Icon
                name={type === option.value ? 'radio_button_checked' : 'radio_button_unchecked'}
                className={cn('text-[20px]', type === option.value ? 'text-primary' : 'text-outline')}
              />
            </button>
          ))}
        </div>
        <Textarea
          label="Catatan"
          hint="Opsional"
          rows={2}
          placeholder="Contoh: minta tambahan es dan tisu."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </Modal>
  );
}
