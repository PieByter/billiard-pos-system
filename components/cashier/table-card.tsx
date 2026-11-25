'use client';

import { cn, formatRelative, formatRp } from '@/lib/format';
import type { OrderView, TableView } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { LiveDuration, LiveSessionAmount } from '@/components/live/live';
import { LiveSessionValue, LiveTotalValue } from './live-bill';
import { orderStatusTone, ORDER_SOURCE_LABEL, ORDER_STATUS_SHORT } from './status';

type Props = {
  table: TableView;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onStart: () => void;
  onOpenCafe: () => void;
  onPause: () => void;
  onResume: () => void;
  onStopPay: () => void;
  onAddOrder: () => void;
  onPay: () => void;
  onMove: () => void;
  onReady: () => void;
  onApprove: (orderId: string) => void;
  onReject: (orderId: string) => void;
  onPrint: () => void;
  onShowQr: () => void;
  onResolveService: (requestId: string) => void;
};

function latestOrders(orders: OrderView[]) {
  return [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function TableCard({
  table,
  selected,
  busy,
  onSelect,
  onStart,
  onOpenCafe,
  onPause,
  onResume,
  onStopPay,
  onAddOrder,
  onPay,
  onMove,
  onReady,
  onApprove,
  onReject,
  onPrint,
  onShowQr,
  onResolveService,
}: Props) {
  const bill = table.bill;
  const session = bill?.activeSession ?? null;
  const pending = bill?.orders.filter((order) => order.status === 'pending') ?? [];
  const orders = latestOrders(bill?.orders ?? []).filter((order) => order.status !== 'cancelled');
  const latest = orders.slice(0, 2);
  const activeItems = orders.flatMap((order) => order.items).slice(0, 3);
  const hasAttention = pending.length > 0 || table.serviceRequests.length > 0;

  const stateClass =
    table.state === 'running'
      ? 'border-primary/35 glow-live bg-surface-container'
      : table.state === 'paused'
        ? 'border-tertiary/35 glow-paused bg-surface-container'
        : table.state === 'cleaning'
          ? 'border-dashed border-error/35 bg-surface-container-low/60'
          : table.state === 'occupied'
            ? 'border-outline-variant/45 bg-surface-container'
            : 'border-outline-variant/25 bg-surface-container-low/55 hover:border-outline-variant/50 hover:bg-surface-container-low';

  return (
    <article
      onClick={onSelect}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-3 rounded-xl border p-3.5 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9)] transition-all duration-200 hover:-translate-y-0.5',
        stateClass,
        selected && 'ring-2 ring-primary/70 ring-offset-2 ring-offset-background',
        hasAttention && table.state !== 'paused' && 'ring-1 ring-error/35',
      )}
    >
      {selected ? (
        <span className="absolute -top-px left-4 right-4 h-[2px] rounded-full bg-primary/70" />
      ) : null}

      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'numeric text-[26px] font-bold leading-none tracking-tight',
                table.state === 'available' ? 'text-outline' : 'text-on-surface',
              )}
            >
              {table.code}
            </span>
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]',
                table.kind === 'billiard'
                  ? 'border-primary/20 bg-surface-container-highest text-primary/90'
                  : 'border-secondary/20 bg-surface-container-highest text-secondary/90',
              )}
            >
              {table.zone}
            </span>
          </div>
          <p
            className={cn(
              'mt-1 truncate text-body-sm font-semibold',
              table.state === 'available' ? 'text-outline' : 'text-on-surface',
            )}
          >
            {bill?.guestName ||
              (table.state === 'cleaning'
                ? 'Turnover selesai'
                : table.state === 'available'
                  ? table.kind === 'billiard'
                    ? 'Meja kosong / siap pakai'
                    : 'Meja cafe kosong'
                  : 'Walk-in guest')}
          </p>
          <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-outline">
            {session
              ? `Snapshot ${formatRp(session.ratePerHour)}/jam`
              : table.rate
                ? `Tarif ${formatRp(table.rate.pricePerHour)}/jam`
                : table.allowSelfOrder
                  ? 'Self-order QR aktif'
                  : 'Order via kasir'}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {table.state === 'running' ? (
            <Badge tone="primary" dot pulse>
              Running
            </Badge>
          ) : table.state === 'paused' ? (
            <Badge tone="paused" dot pulse>
              Paused
            </Badge>
          ) : table.state === 'cleaning' ? (
            <Badge tone="error" dot>
              Cleaning
            </Badge>
          ) : table.state === 'occupied' ? (
            <Badge tone="cyan" dot>
              Occupied
            </Badge>
          ) : (
            <Badge tone="outline">Available</Badge>
          )}

          {session ? (
            <>
              <LiveDuration
                baseSeconds={session.baseElapsedSeconds}
                running={session.status === 'running'}
                className={cn(
                  'text-numeric-md font-bold',
                  session.status === 'paused' ? 'text-tertiary' : 'text-primary',
                )}
              />
              <span className="text-[10px] text-outline">
                {session.status === 'paused' ? 'timer hold' : 'live timer'}
              </span>
            </>
          ) : bill ? (
            <span className="numeric text-numeric-md font-bold text-on-surface">
              <LiveTotalValue bill={bill} />
            </span>
          ) : null}

          {busy ? (
            <span className="material-symbols-outlined animate-spin text-[16px] text-primary">
              progress_activity
            </span>
          ) : null}
        </div>
      </header>

      {hasAttention ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {pending.length > 0 ? (
            <Badge tone="error" dot pulse>
              {pending.length} QR pending
            </Badge>
          ) : null}
          {table.serviceRequests.length > 0 ? (
            <Badge tone="paused" dot pulse>
              <Icon name="notifications_active" className="text-[12px]" />
              Panggilan waiter
            </Badge>
          ) : null}
        </div>
      ) : null}

      {bill && (table.state === 'running' || table.state === 'paused') ? (
        <div className="flex flex-col gap-1 rounded-lg border border-outline-variant/20 bg-surface-container-lowest/75 p-2.5">
          <div className="flex items-center justify-between gap-2 text-body-sm">
            <span className="text-on-surface-variant">
              Billiard ({session ? `${Math.round(session.baseElapsedSeconds / 60)}m+` : '—'})
            </span>
            <span className="numeric text-on-surface">
              {session ? <LiveSessionValue session={session} /> : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-body-sm">
            <span className="text-on-surface-variant">F&amp;B ({orders.length} order)</span>
            <span className="numeric text-on-surface">{formatRp(bill.ordersSubtotal)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2 border-t border-outline-variant/20 pt-1.5 text-body-sm font-semibold">
            <span className="text-primary">Snapshot bill</span>
            <span className="numeric font-bold text-primary">
              <LiveTotalValue bill={bill} />
            </span>
          </div>
        </div>
      ) : null}

      {bill && table.state === 'occupied' ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest/75 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {latest.length > 0 ? (
                latest.map((order) => (
                  <Badge key={order.id} tone={orderStatusTone(order.status)}>
                    {ORDER_STATUS_SHORT[order.status]}
                  </Badge>
                ))
              ) : (
                <Badge tone="outline">Bill baru</Badge>
              )}
            </div>
            <span className="numeric text-numeric-md font-bold text-on-surface">
              <LiveTotalValue bill={bill} />
            </span>
          </div>
          <p className="truncate text-[11px] text-on-surface-variant">
            {activeItems.length > 0
              ? activeItems
                  .map((item) => `${item.qty}× ${item.name}`)
                  .join(' · ') + (orders.flatMap((order) => order.items).length > 3 ? ' · …' : '')
              : 'Belum ada item F&B'}
          </p>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="rounded-lg border border-error/25 bg-error/[0.07] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label-badge font-bold uppercase tracking-[0.08em] text-error">
              QR self-order
            </span>
            <span className="text-[10px] text-on-surface-variant">
              {formatRelative(pending[0]!.createdAt)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-body-sm text-on-surface">
            {pending[0]!.items.map((item) => `${item.qty}× ${item.name}`).join(', ')}
          </p>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                onApprove(pending[0]!.id);
              }}
            >
              <Icon name="check" className="text-[15px]" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              className="px-2.5"
              onClick={(event) => {
                event.stopPropagation();
                onReject(pending[0]!.id);
              }}
            >
              <Icon name="close" className="text-[15px]" />
            </Button>
          </div>
        </div>
      ) : null}

      {table.state === 'cleaning' ? (
        <div className="flex items-center gap-2 rounded-lg border border-error/20 bg-error/[0.05] px-2.5 py-2">
          <Icon name="mop" className="text-[20px] text-tertiary" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold text-on-surface">Menunggu pembersihan</p>
            <p className="text-[10px] text-on-surface-variant">
              Selesai {table.needsCleaningAt ? formatRelative(table.needsCleaningAt) : 'baru saja'}
            </p>
          </div>
        </div>
      ) : null}

      {table.state === 'available' ? (
        <div className="flex flex-1 flex-col justify-end gap-2">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant/15 bg-surface-container-lowest/50 px-2.5 py-2">
            <span className="flex items-center gap-1.5 text-[11px] text-outline">
              <Icon
                name={table.kind === 'billiard' ? 'lock_clock' : 'qr_code_2'}
                className="text-[16px]"
              />
              {table.kind === 'billiard'
                ? 'Mulai timer & snapshot tarif'
                : table.allowSelfOrder
                  ? 'Guest bisa self-order via QR'
                  : 'Order melalui kasir'}
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShowQr();
              }}
              className="text-[10px] font-bold uppercase tracking-wider text-secondary transition-colors hover:text-secondary/80"
            >
              QR
            </button>
          </div>
          <Button
            variant="primary"
            size="md"
            className="w-full"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              if (table.kind === 'billiard') onStart();
              else onOpenCafe();
            }}
          >
            <Icon name={table.kind === 'billiard' ? 'play_arrow' : 'add_circle'} className="text-[17px]" />
            {table.kind === 'billiard' ? 'Start Sesi Billiard' : 'Buka Bill Cafe'}
          </Button>
        </div>
      ) : null}

      {table.state === 'cleaning' ? (
        <Button
          variant="secondary"
          size="md"
          className="w-full"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onReady();
          }}
        >
          <Icon name="check_circle" className="text-[17px] text-primary" />
          Tandai Siap Pakai
        </Button>
      ) : null}

      {bill && (table.state === 'running' || table.state === 'paused') ? (
        <div className="grid grid-cols-2 gap-1.5">
          {table.state === 'running' ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                onPause();
              }}
            >
              <Icon name="pause" className="text-[15px] text-tertiary" />
              Pause
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                onResume();
              }}
            >
              <Icon name="play_arrow" className="text-[15px] text-primary" />
              Resume
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onStopPay();
            }}
          >
            <Icon name="point_of_sale" className="text-[15px]" />
            {table.state === 'paused' ? 'Checkout' : 'Stop & Bayar'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onAddOrder();
            }}
          >
            <Icon name="restaurant" className="text-[15px] text-secondary" />
            + F&amp;B
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onMove();
            }}
          >
            <Icon name="swap_horiz" className="text-[15px]" />
            Pindah
          </Button>
        </div>
      ) : null}

      {bill && table.state === 'occupied' ? (
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onAddOrder();
            }}
          >
            <Icon name="add" className="text-[15px] text-secondary" />
            Tambah Order
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onPay();
            }}
          >
            <Icon name="payments" className="text-[15px]" />
            Checkout
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onPrint();
            }}
          >
            <Icon name="receipt_long" className="text-[15px]" />
            Slip 80mm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onMove();
            }}
          >
            <Icon name="swap_horiz" className="text-[15px]" />
            Pindah
          </Button>
        </div>
      ) : null}

      {table.serviceRequests.length > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-tertiary/25 bg-tertiary/[0.07] px-2.5 py-1.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-tertiary">
            <Icon name="notifications_active" className="text-[14px]" />
            <span className="truncate">
              {table.serviceRequests[0]!.note || 'Tamu memanggil waiter'}
            </span>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onResolveService(table.serviceRequests[0]!.id);
            }}
            className="shrink-0 rounded bg-tertiary-container px-2 py-0.5 text-[10px] font-bold text-on-tertiary-container transition-colors hover:bg-tertiary disabled:opacity-50"
          >
            Selesai
          </button>
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between text-[10px] text-outline">
        <span className="flex items-center gap-1">
          <Icon name="groups" className="text-[13px]" />
          {table.capacity} pax
        </span>
        {bill ? (
          <span className="truncate">
            {bill.number} · {bill.orders.length} order
          </span>
        ) : (
          <span>{ORDER_SOURCE_LABEL.cashier}</span>
        )}
      </div>
    </article>
  );
}
