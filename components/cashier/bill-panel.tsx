'use client';

import { cn, formatClock, formatRelative, formatRp, initials } from '@/lib/format';
import type { PayMethod, TableView } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { EmptyState, InfoRow } from '@/components/ui/stat-card';
import { LiveDuration } from '@/components/live/live';
import { LiveSessionValue, useLiveBillTotals } from './live-bill';
import { orderStatusTone, ORDER_SOURCE_LABEL, ORDER_STATUS_SHORT } from './status';

type BillPanelProps = {
  table: TableView | null;
  canDiscount: boolean;
  busy: boolean;
  onStart: () => void;
  onOpenCafe: () => void;
  onReady: () => void;
  onPause: () => void;
  onResume: () => void;
  onStopPay: () => void;
  onAddOrder: () => void;
  onPay: (method?: PayMethod, split?: boolean) => void;
  onSplit: () => void;
  onQrisGateway: () => void;
  onMember: () => void;
  onPromo: () => void;
  onPenalty: () => void;
  onMove: () => void;
  onApprove: (orderId: string) => void;
  onReject: (orderId: string) => void;
  onPrint: () => void;
  onDiscount: () => void;
  onVoid: () => void;
  onShowQr: () => void;
  onResolveService: (requestId: string) => void;
};

export function BillPanel(props: BillPanelProps) {
  const { table } = props;

  if (!table) {
    return (
      <div className="panel rounded-2xl p-4">
        <EmptyState
          icon="touch_app"
          title="Pilih meja untuk inspeksi"
          description="Klik salah satu kartu meja untuk melihat rincian sesi, F&B, dan opsi pembayaran."
        />
      </div>
    );
  }

  if (!table.bill) {
    return (
      <div className="panel rounded-2xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-label-badge font-bold uppercase tracking-[0.12em] text-primary">
                Meja {table.code}
              </span>
              <Badge
                tone={
                  table.state === 'cleaning'
                    ? 'error'
                    : table.state === 'maintenance'
                      ? 'paused'
                      : 'outline'
                }
              >
                {table.state === 'cleaning'
                  ? 'Cleaning'
                  : table.state === 'maintenance'
                    ? 'Maintenance'
                    : 'Available'}
              </Badge>
            </div>
            <h2 className="mt-1 text-headline-md font-extrabold text-on-surface">
              {table.zone || (table.kind === 'billiard' ? 'Billiard table' : 'Cafe table')}
            </h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              {table.kind === 'billiard'
                ? 'Mulai sesi untuk mengunci snapshot tarif dan timer.'
                : 'Buka bill untuk mulai tab F&B di meja ini.'}
            </p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-container-high text-primary">
            <Icon name={table.kind === 'billiard' ? 'sports_bar' : 'table_restaurant'} className="text-[24px]" />
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-outline-variant/25 bg-surface-container-lowest/60 p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-outline">Kapasitas</span>
            <p className="numeric mt-0.5 text-numeric-md font-bold text-on-surface">
              {table.capacity} pax
            </p>
          </div>
          <div className="rounded-lg border border-outline-variant/25 bg-surface-container-lowest/60 p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-outline">Self-order</span>
            <p className="mt-0.5 text-body-sm font-bold text-on-surface">
              {table.allowSelfOrder ? 'Aktif via QR' : 'Via kasir'}
            </p>
          </div>
        </div>

        {table.rate ? (
          <div className="mt-2 rounded-lg border border-primary/20 bg-primary/[0.06] p-3">
            <InfoRow label={table.rate.name} value={`${formatRp(table.rate.pricePerHour)} / jam`} strong />
            <InfoRow
              className="mt-1"
              label="Aturan billing"
              value={`min ${table.rate.minMinutes}m · +${table.rate.incrementMinutes}m`}
            />
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          {table.state === 'maintenance' ? (
            <div className="rounded-lg border border-tertiary/25 bg-tertiary/[0.06] p-3">
              <div className="flex items-center gap-2 text-body-sm font-semibold text-tertiary">
                <Icon name="handyman" className="text-[18px]" />
                Meja sedang maintenance
              </div>
              <p className="mt-1 text-[11px] text-on-surface-variant">
                {table.maintenanceNote || 'Selesaikan maintenance dari Admin → Meja & QR.'}
              </p>
            </div>
          ) : table.state === 'cleaning' ? (
            <Button variant="primary" size="lg" onClick={props.onReady} disabled={props.busy}>
              <Icon name="check_circle" className="text-[18px]" />
              Tandai Siap Pakai
            </Button>
          ) : table.kind === 'billiard' ? (
            <Button variant="primary" size="lg" onClick={props.onStart} disabled={props.busy}>
              <Icon name="play_arrow" className="text-[18px]" />
              Start Sesi Billiard
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={props.onOpenCafe} disabled={props.busy}>
              <Icon name="add_circle" className="text-[18px]" />
              Buka Bill Cafe
            </Button>
          )}
          <Button variant="secondary" size="md" onClick={props.onShowQr} disabled={props.busy}>
            <Icon name="qr_code_2" className="text-[18px] text-secondary" />
            Lihat QR meja
          </Button>
        </div>

        {table.serviceRequests.length > 0 ? (
          <div className="mt-3 rounded-lg border border-tertiary/25 bg-tertiary/[0.07] p-3">
            <div className="flex items-center gap-2 text-body-sm font-semibold text-tertiary">
              <Icon name="notifications_active" className="text-[18px]" />
              Panggilan tamu
            </div>
            {table.serviceRequests.map((request) => (
              <div key={request.id} className="mt-2 flex items-center justify-between gap-2">
                <span className="text-body-sm text-on-surface-variant">
                  {request.note || request.type}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => props.onResolveService(request.id)}
                  disabled={props.busy}
                >
                  Selesai
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return <ActiveBillPanel {...props} table={table} />;
}

function ActiveBillPanel({ table, ...props }: BillPanelProps & { table: TableView }) {
  const bill = table.bill!;
  const totals = useLiveBillTotals(bill);
  const session = bill.activeSession;
  const pendingOrders = bill.orders.filter((order) => order.status === 'pending');
  const validOrders = bill.orders.filter((order) => order.status !== 'cancelled');
  const itemsCount = validOrders.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.qty, 0),
    0,
  );

  return (
    <div className="panel flex flex-col gap-3 rounded-2xl p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
      <header className="flex items-start justify-between gap-3 border-b border-outline-variant/25 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-label-badge font-bold uppercase tracking-[0.12em] text-primary">
              Terminal Kasir
            </span>
            <Badge tone={session?.status === 'paused' ? 'paused' : 'primary'} dot pulse>
              {session?.status === 'paused' ? 'Paused' : session ? 'Live active' : 'Open bill'}
            </Badge>
          </div>
          <h2 className="mt-1 truncate text-headline-md font-extrabold tracking-tight text-on-surface">
            Meja {table.code}
            <span className="ml-2 text-body-sm font-semibold text-on-surface-variant">
              {table.zone}
            </span>
          </h2>
          <span className="numeric mt-0.5 block text-[11px] tracking-wide text-on-surface-variant/70">
            {bill.number}
          </span>
        </div>
        <button
          type="button"
          onClick={props.onPrint}
          title="Cetak ringkasan 80mm"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-outline-variant/35 bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
        >
          <Icon name="print" className="text-[19px]" />
        </button>
      </header>

      {/* Guest and session */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/25 bg-surface-container p-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-secondary/25 bg-secondary/15 text-body-sm font-extrabold text-secondary">
            {initials(bill.guestName || 'Guest')}
          </div>
          <div className="min-w-0">
            <div className="truncate text-body-sm font-bold text-on-surface">
              {bill.guestName || 'Walk-in guest'}
            </div>
            <div className="mt-0.5 text-[10px] text-on-surface-variant">
              Mulai {formatClock(bill.openedAt)} · {bill.orders.length} order · {itemsCount} item
            </div>
          </div>
        </div>
        {session ? (
          <div className="text-right">
            <span className="text-[9px] uppercase tracking-wider text-outline">Timer</span>
            <LiveDuration
              baseSeconds={session.baseElapsedSeconds}
              running={session.status === 'running'}
              className={cn(
                'block text-body-md font-bold',
                session.status === 'paused' ? 'text-tertiary' : 'text-primary',
              )}
            />
          </div>
        ) : (
          <div className="text-right">
            <span className="text-[9px] uppercase tracking-wider text-outline">Billiard</span>
            <span className="block text-body-sm font-semibold text-on-surface-variant">
              {bill.sessions.length > 0 ? 'Sesi selesai' : 'Tanpa sesi'}
            </span>
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="flex max-h-[34vh] flex-col gap-2 overflow-y-auto pr-0.5 xl:max-h-[38vh]">
        <div className="flex items-center justify-between">
          <span className="text-label-badge font-bold uppercase tracking-[0.1em] text-outline">
            Rincian item gabungan
          </span>
          <span className="text-[10px] text-on-surface-variant">
            {bill.sessions.length} sesi · {validOrders.length} order
          </span>
        </div>

        {bill.sessions.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'flex flex-col gap-1 rounded-lg border-l-2 bg-surface-container p-2.5',
              item.status === 'finished'
                ? 'border-outline-variant/70'
                : item.status === 'paused'
                  ? 'border-tertiary'
                  : 'border-primary',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-body-sm font-bold text-on-surface">
                  Sesi Billiard {index + 1}
                  <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider text-outline">
                    {item.status}
                  </span>
                </p>
                <p className="text-[10px] text-on-surface-variant">
                  {formatRp(item.ratePerHour)}/jam · min {item.minMinutes}m · +
                  {item.incrementMinutes}m
                </p>
              </div>
              <LiveSessionValue
                session={item}
                className="numeric shrink-0 text-body-sm font-bold text-primary"
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-outline">
              <span>Mulai {formatClock(item.startedAt)}</span>
              <span>
                {item.status === 'finished'
                  ? `Selesai ${item.endedAt ? formatClock(item.endedAt) : '—'}`
                  : item.status === 'paused'
                    ? 'Timer di-hold'
                    : 'Billiard engine running'}
              </span>
            </div>
          </div>
        ))}

        {validOrders.length === 0 && bill.sessions.length === 0 ? (
          <EmptyState
            compact
            icon="receipt_long"
            title="Bill masih kosong"
            description="Tambahkan order F&B atau mulai sesi billiard."
          />
        ) : null}

        {validOrders.map((order) => (
          <div
            key={order.id}
            className={cn(
              'flex flex-col gap-1.5 rounded-lg border-l-2 bg-surface-container p-2.5',
              order.status === 'pending' ? 'border-error' : 'border-secondary',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <span className="numeric text-[10px] font-bold uppercase tracking-wider text-secondary">
                  {order.number}
                </span>
                <Badge tone={orderStatusTone(order.status)}>
                  {ORDER_STATUS_SHORT[order.status]}
                </Badge>
                <span className="text-[9px] uppercase tracking-wider text-outline">
                  {ORDER_SOURCE_LABEL[order.source]}
                </span>
              </div>
              <span className="numeric shrink-0 text-body-sm font-bold text-on-surface">
                {formatRp(order.subtotal)}
              </span>
            </div>

            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2 text-body-sm">
                <div className="min-w-0">
                  <span className="text-on-surface">
                    {item.qty}× {item.name}
                  </span>
                  {item.note ? (
                    <p className="pl-2 text-[10px] italic text-on-surface-variant/80">
                      “{item.note}”
                    </p>
                  ) : null}
                </div>
                <span className="numeric shrink-0 text-[11px] text-on-surface-variant">
                  {formatRp(item.price * item.qty)}
                </span>
              </div>
            ))}

            {order.status === 'pending' ? (
              <div className="mt-1 flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="primary"
                  className="flex-1"
                  disabled={props.busy}
                  onClick={() => props.onApprove(order.id)}
                >
                  <Icon name="check" className="text-[15px]" />
                  Terima &amp; kirim KDS
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={props.busy}
                  onClick={() => props.onReject(order.id)}
                >
                  Tolak
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[10px] text-outline">
                <span>{formatRelative(order.createdAt)}</span>
                <span>{order.items.length} item</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {pendingOrders.length > 0 ? (
        <div className="rounded-lg border border-error/25 bg-error/[0.06] px-2.5 py-1.5 text-[11px] text-error">
          <span className="font-semibold">Pembayaran terkunci:</span> {pendingOrders.length} QR
          order masih menunggu approval.
        </div>
      ) : null}

      {/* Totals */}
      <div className="rounded-xl border border-outline-variant/25 bg-surface-container p-3">
        <InfoRow
          label={`Sesi billiard${session ? ' (live)' : ''}`}
          value={formatRp(totals.sessionSubtotal)}
        />
        <InfoRow className="mt-1" label="F&B / order" value={formatRp(bill.ordersSubtotal)} />
        {bill.discountAmount > 0 ? (
          <InfoRow
            className="mt-1"
            label="Diskon manual"
            value={`- ${formatRp(bill.discountAmount)}`}
          />
        ) : null}
        {bill.memberDiscountAmount > 0 ? (
          <InfoRow
            className="mt-1"
            label="Member tier"
            value={`- ${formatRp(bill.memberDiscountAmount)}`}
          />
        ) : null}
        {bill.promoDiscountAmount > 0 ? (
          <InfoRow
            className="mt-1"
            label={`Promo ${bill.promotionCode ?? ''}`}
            value={`- ${formatRp(bill.promoDiscountAmount)}`}
          />
        ) : null}
        {bill.pointsDiscountAmount > 0 ? (
          <InfoRow
            className="mt-1"
            label={`Poin ${bill.pointsRedeemed}`}
            value={`- ${formatRp(bill.pointsDiscountAmount)}`}
          />
        ) : null}
        {bill.voucherDiscountAmount > 0 ? (
          <InfoRow
            className="mt-1"
            label={`Voucher ${bill.voucherCode ?? ''}`}
            value={`- ${formatRp(bill.voucherDiscountAmount)}`}
          />
        ) : null}
        {bill.penaltyAmount > 0 ? (
          <InfoRow className="mt-1" label="Denda" value={formatRp(bill.penaltyAmount)} />
        ) : null}
        <InfoRow
          className="mt-1"
          label={`PB1 ${(bill.taxRateBps / 100).toFixed(0)}%`}
          value={formatRp(totals.taxAmount)}
        />
        <InfoRow
          className="mt-1"
          label={`Service ${(bill.serviceRateBps / 100).toFixed(0)}%`}
          value={formatRp(totals.serviceAmount)}
        />
        <div className="my-2 h-px bg-outline-variant/25" />
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <span className="text-headline-md font-extrabold text-on-surface">Total</span>
            <span className="ml-1 text-[10px] uppercase tracking-wider text-primary">
              {session ? 'berjalan' : 'siap bayar'}
            </span>
          </div>
          <span className="numeric text-numeric-lg font-bold tracking-tight text-primary">
            {formatRp(totals.total)}
          </span>
        </div>
        {bill.totalDiscountAmount > 0 ? (
          <p className="mt-1 text-[10px] text-on-surface-variant">
            Total diskon: {formatRp(bill.totalDiscountAmount)}
          </p>
        ) : null}
      </div>

      {/* Settlement */}
      {session ? (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={props.busy}
            onClick={props.onStopPay}
          >
            <Icon name="point_of_sale" className="text-[18px]" />
            Stop Sesi &amp; Bayar {formatRp(totals.total)}
          </Button>
          <div className="grid grid-cols-2 gap-1.5">
            {session.status === 'running' ? (
              <Button variant="secondary" size="md" onClick={props.onPause} disabled={props.busy}>
                <Icon name="pause" className="text-[17px] text-tertiary" />
                Pause timer
              </Button>
            ) : (
              <Button variant="secondary" size="md" onClick={props.onResume} disabled={props.busy}>
                <Icon name="play_arrow" className="text-[17px] text-primary" />
                Resume
              </Button>
            )}
            <Button variant="secondary" size="md" onClick={props.onAddOrder} disabled={props.busy}>
              <Icon name="restaurant" className="text-[17px] text-secondary" />
              + F&amp;B
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="primary" size="lg" onClick={() => props.onPay('cash')} disabled={props.busy}>
              <Icon name="payments" className="text-[18px]" />
              Bayar Cash
            </Button>
            <Button variant="cyan" size="lg" onClick={() => props.onPay('qris')} disabled={props.busy}>
              <Icon name="qr_code_2" className="text-[18px]" />
              QRIS
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => props.onPay('edc')} disabled={props.busy}>
              <Icon name="credit_card" className="text-[15px] text-tertiary" />
              EDC
            </Button>
            <Button variant="secondary" size="sm" onClick={() => props.onPay('cash', true)} disabled={props.busy}>
              <Icon name="call_split" className="text-[15px] text-secondary" />
              Split
            </Button>
            <Button variant="secondary" size="sm" onClick={props.onPrint} disabled={props.busy}>
              <Icon name="receipt_long" className="text-[15px]" />
              Slip
            </Button>
          </div>
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            onClick={props.onSplit}
            disabled={props.busy || pendingOrders.length > 0 || Boolean(session)}
            title={
              session
                ? 'Stop sesi billiard sebelum split'
                : 'Bagi item/sesi ke beberapa group pembayaran'
            }
          >
            <Icon name="call_split" className="text-[17px] text-secondary" />
            Split per item / seat
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={props.onQrisGateway}
            disabled={props.busy || pendingOrders.length > 0 || Boolean(session)}
          >
            <Icon name="qr_code_scanner" className="text-[16px] text-secondary" />
            QRIS dinamis (gateway)
          </Button>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={props.onMember}
              disabled={props.busy || pendingOrders.length > 0 || Boolean(session)}
            >
              <Icon name="loyalty" className="text-[16px] text-tertiary" />
              Member
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={props.onPromo}
              disabled={props.busy || pendingOrders.length > 0 || Boolean(session)}
            >
              <Icon name="sell" className="text-[16px] text-secondary" />
              Promo
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <Button variant="ghost" size="sm" onClick={props.onAddOrder} disabled={props.busy}>
          <Icon name="add" className="text-[15px]" />
          Order
        </Button>
        <Button variant="ghost" size="sm" onClick={props.onMove} disabled={props.busy}>
          <Icon name="swap_horiz" className="text-[15px]" />
          Pindah
        </Button>
        <Button variant="ghost" size="sm" onClick={props.onShowQr} disabled={props.busy}>
          <Icon name="qr_code_2" className="text-[15px]" />
          QR
        </Button>
      </div>

      {props.canDiscount ? (
        <div className="flex items-center justify-between border-t border-outline-variant/20 pt-2">
          <span className="text-[10px] uppercase tracking-wider text-outline">Owner tools</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={props.onDiscount}
              disabled={props.busy}
              className="rounded px-2 py-1 text-[10px] font-semibold text-secondary transition-colors hover:bg-secondary/10 disabled:opacity-50"
            >
              Diskon
            </button>
            <button
              type="button"
              onClick={props.onPenalty}
              disabled={props.busy || Boolean(session) || pendingOrders.length > 0}
              title={
                session
                  ? 'Stop sesi billiard sebelum denda'
                  : 'Tambahkan denda kerusakan/kehilangan'
              }
              className="rounded px-2 py-1 text-[10px] font-semibold text-tertiary transition-colors hover:bg-tertiary/10 disabled:opacity-40"
            >
              Denda
            </button>
            <button
              type="button"
              onClick={props.onVoid}
              disabled={props.busy || Boolean(session)}
              title={session ? 'Stop sesi billiard sebelum void' : 'Void bill'}
              className="rounded px-2 py-1 text-[10px] font-semibold text-error transition-colors hover:bg-error/10 disabled:opacity-40"
            >
              Void bill
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
