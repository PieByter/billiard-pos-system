'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  approveOrderAction,
  rejectOrderAction,
  resolveServiceRequestAction,
} from '@/app/actions/orders';
import {
  markTableReadyAction,
  openCafeBillAction,
  pauseSessionAction,
  resumeSessionAction,
  stopSessionAction,
} from '@/app/actions/sessions';
import { BillPanel } from './bill-panel';
import { CashierMetricsStrip } from './metrics-strip';
import { OrderDialog } from './order-dialog';
import {
  MoveTableDialog,
  QrDialog,
  QuickOpenDialog,
  ShiftOpenDialog,
  StartSessionDialog,
} from './session-dialogs';
import { DiscountDialog, PaymentDialog, VoidBillDialog } from './payment-dialogs';
import { QrisGatewayDialog } from './qris-gateway-dialog';
import { TableCard } from './table-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState, SectionHeader } from '@/components/ui/stat-card';
import { inputClass } from '@/components/ui/form';
import { formatRelative, formatRp, cn } from '@/lib/format';
import { WAITER_TYPE_LABELS } from '@/lib/constants';
import type { CashierData, PayMethod, TableView } from '@/lib/types';
import type { ProfileRole } from '@/lib/db/schema';
import { LiveClock } from '@/components/live/live';
import { useRealtimeRefresh } from '@/components/realtime/use-realtime-refresh';

type Filter = 'all' | 'billiard' | 'cafe' | 'attention';

type PayState = {
  tableId: string;
  billId: string;
  billNumber: string;
  total: number;
  method: PayMethod;
  split: boolean;
};

export function CashierBoard({
  data,
  staff,
}: {
  data: CashierData;
  staff: { name: string; role: ProfileRole };
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return (
      data.tables.find((table) => table.state === 'running')?.id ??
      data.tables.find((table) => table.bill)?.id ??
      data.tables[0]?.id ??
      null
    );
  });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [startId, setStartId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [qrisGatewayId, setQrisGatewayId] = useState<string | null>(null);
  const [discountId, setDiscountId] = useState<string | null>(null);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [payState, setPayState] = useState<PayState | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [rejectOrder, setRejectOrder] = useState<{ id: string; number: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [mobileBillOpen, setMobileBillOpen] = useState(false);

  useRealtimeRefresh([
    'bills',
    'billiard_sessions',
    'orders',
    'order_items',
    'service_requests',
    'venue_tables',
  ]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = window.setInterval(refresh, 10_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  const selected = data.tables.find((table) => table.id === selectedId) ?? null;
  const startTable = data.tables.find((table) => table.id === startId) ?? null;
  const orderTable = data.tables.find((table) => table.id === orderId) ?? null;
  const moveSource = data.tables.find((table) => table.id === moveId) ?? null;
  const qrTable = data.tables.find((table) => table.id === qrId) ?? null;
  const qrisGatewayTable = data.tables.find((table) => table.id === qrisGatewayId) ?? null;
  const discountTable = data.tables.find((table) => table.id === discountId) ?? null;
  const voidTable = data.tables.find((table) => table.id === voidId) ?? null;
  const payTable = payState ? data.tables.find((table) => table.id === payState.tableId) ?? null : null;

  const attentionCount = data.tables.filter(
    (table) =>
      table.pendingOrdersCount > 0 ||
      table.state === 'paused' ||
      table.state === 'cleaning' ||
      table.serviceRequests.length > 0,
  ).length;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.tables.filter((table) => {
      if (filter === 'billiard' && table.kind !== 'billiard') return false;
      if (filter === 'cafe' && table.kind !== 'cafe') return false;
      if (
        filter === 'attention' &&
        !(
          table.pendingOrdersCount > 0 ||
          table.state === 'paused' ||
          table.state === 'cleaning' ||
          table.serviceRequests.length > 0
        )
      ) {
        return false;
      }
      if (!term) return true;
      const haystack = [
        table.code,
        table.zone,
        table.bill?.guestName ?? '',
        table.bill?.number ?? '',
        ...(table.bill?.orders.map((order) => order.number) ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [data.tables, filter, search]);

  const billiardTables = filtered.filter((table) => table.kind === 'billiard');
  const cafeTables = filtered.filter((table) => table.kind === 'cafe');
  const availableTables = data.tables.filter((table) => table.state === 'available');
  const moveTargets = moveSource
    ? data.tables.filter(
        (table) =>
          table.id !== moveSource.id &&
          table.state === 'available' &&
          table.kind === moveSource.kind,
      )
    : [];

  const busy = (key: string) => busyKey === key;

  async function runTableAction(
    table: TableView,
    action: string,
    label: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setBusyKey(`${table.id}:${action}`);
    const result = await fn();
    setBusyKey(null);
    if (!result.ok) {
      toast.error(result.error ?? 'Aksi gagal.');
      return;
    }
    toast.success(label);
    router.refresh();
  }

  async function handlePause(table: TableView) {
    await runTableAction(table, 'pause', `Timer ${table.code} dipause`, () =>
      pauseSessionAction(table.id),
    );
  }

  async function handleResume(table: TableView) {
    await runTableAction(table, 'resume', `Timer ${table.code} dilanjutkan`, () =>
      resumeSessionAction(table.id),
    );
  }

  async function handleReady(table: TableView) {
    await runTableAction(table, 'ready', `Meja ${table.code} siap dipakai`, () =>
      markTableReadyAction(table.id),
    );
  }

  async function handleOpenCafe(table: TableView) {
    await runTableAction(table, 'open', `Bill cafe ${table.code} dibuka`, () =>
      openCafeBillAction(table.id),
    );
  }

  async function handleStop(table: TableView) {
    setBusyKey(`${table.id}:stop`);
    const result = await stopSessionAction(table.id);
    setBusyKey(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Sesi dihentikan · ${formatRp(result.data?.amount ?? 0)}`, {
      description: 'Lanjut ke pembayaran bill.',
    });
    setPayState({
      tableId: table.id,
      billId: result.data!.billId,
      billNumber: result.data!.billNumber,
      total: result.data!.billTotal,
      method: 'cash',
      split: false,
    });
    router.refresh();
  }

  async function handleApprove(orderIdToApprove: string) {
    setBusyKey(`order:${orderIdToApprove}`);
    const result = await approveOrderAction(orderIdToApprove);
    setBusyKey(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Order diterima & dikirim ke KDS');
    router.refresh();
  }

  async function confirmReject() {
    if (!rejectOrder) return;
    setRejecting(true);
    const result = await rejectOrderAction(rejectOrder.id, 'Ditolak kasir dari meja');
    setRejecting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Order ditolak & stok dikembalikan');
    setRejectOrder(null);
    router.refresh();
  }

  async function handleResolveService(requestId: string) {
    setBusyKey(`service:${requestId}`);
    const result = await resolveServiceRequestAction(requestId);
    setBusyKey(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Panggilan tamu diselesaikan');
    router.refresh();
  }

  function openPayment(table: TableView, method: PayMethod = 'cash', split = false) {
    if (!table.bill) return;
    setPayState({
      tableId: table.id,
      billId: table.bill.id,
      billNumber: table.bill.number,
      total: table.bill.total,
      method,
      split,
    });
  }

  const panelProps = {
    canDiscount: staff.role === 'owner',
    busy: Boolean(busyKey),
    onStart: () => {
      setMobileBillOpen(false);
      setStartId(selected?.id ?? null);
    },
    onOpenCafe: () => selected && void handleOpenCafe(selected),
    onReady: () => selected && void handleReady(selected),
    onPause: () => selected && void handlePause(selected),
    onResume: () => selected && void handleResume(selected),
    onStopPay: () => {
      setMobileBillOpen(false);
      if (selected) void handleStop(selected);
    },
    onAddOrder: () => {
      setMobileBillOpen(false);
      setOrderId(selected?.id ?? null);
    },
    onSplit: () => {
      setMobileBillOpen(false);
      if (selected?.bill) router.push(`/staff/cashier/split/${selected.bill.id}`);
    },
    onQrisGateway: () => {
      setMobileBillOpen(false);
      setQrisGatewayId(selected?.id ?? null);
    },
    onPay: (method?: PayMethod, split?: boolean) => {
      setMobileBillOpen(false);
      if (selected) openPayment(selected, method, split);
    },
    onMove: () => {
      setMobileBillOpen(false);
      setMoveId(selected?.id ?? null);
    },
    onApprove: (id: string) => void handleApprove(id),
    onReject: (id: string) => {
      setMobileBillOpen(false);
      const order = selected?.bill?.orders.find((entry) => entry.id === id);
      setRejectOrder({ id, number: order?.number ?? 'Order' });
    },
    onPrint: () => {
      if (selected?.bill) window.open(`/print/bill/${selected.bill.id}`, '_blank');
    },
    onDiscount: () => {
      setMobileBillOpen(false);
      setDiscountId(selected?.id ?? null);
    },
    onVoid: () => {
      setMobileBillOpen(false);
      setVoidId(selected?.id ?? null);
    },
    onShowQr: () => {
      setMobileBillOpen(false);
      setQrId(selected?.id ?? null);
    },
    onResolveService: (id: string) => void handleResolveService(id),
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Live floor"
        title="Meja & Tagihan"
        description="Timer billiard, open bill, self-order QR, dan settlement dalam satu layar."
        actions={
          <>
            <div className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-primary sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Live · <LiveClock className="text-[10px]" />
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={() => router.refresh()}
              title="Refresh data"
            >
              <Icon name="refresh" className="text-[18px]" />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            <Button variant="primary" size="md" onClick={() => setQuickOpen(true)}>
              <Icon name="add_circle" className="text-[18px]" />
              Buka Meja
            </Button>
          </>
        }
      />

      <CashierMetricsStrip metrics={data.metrics} />

      {!data.shift ? (
        <div className="panel flex flex-col gap-2 rounded-xl border-tertiary/30 bg-tertiary/[0.05] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tertiary/15 text-tertiary">
              <Icon name="schedule" className="text-[20px]" />
            </span>
            <div>
              <p className="text-body-sm font-bold text-on-surface">Shift kasir belum dibuka</p>
              <p className="text-[11px] text-on-surface-variant">
                Buka shift dengan modal awal agar rekonsiliasi kas akhir shift akurat.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShiftOpen(true)}>
            <Icon name="play_arrow" className="text-[16px] text-primary" />
            Buka shift
          </Button>
        </div>
      ) : null}

      {data.serviceRequests.length > 0 ? (
        <div className="panel rounded-xl border-tertiary/30 bg-tertiary/[0.04] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-label-badge font-bold uppercase tracking-[0.1em] text-tertiary">
              <Icon name="notifications_active" className="text-[16px]" />
              Panggilan tamu · {data.serviceRequests.length}
            </span>
            <span className="text-[10px] text-on-surface-variant">
              Panggilan dari halaman QR guest
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            {data.serviceRequests.map((request) => (
              <div
                key={request.id}
                className="flex min-w-[240px] items-center justify-between gap-2 rounded-lg border border-tertiary/25 bg-surface-container p-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="numeric text-body-sm font-bold text-on-surface">
                      Meja {request.tableCode}
                    </span>
                    <Badge tone="paused">
                      {WAITER_TYPE_LABELS[request.type] ?? request.type}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-on-surface-variant">
                    {request.note || 'Tamu membutuhkan bantuan'} ·{' '}
                    {formatRelative(request.createdAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleResolveService(request.id)}
                  loading={busy(`service:${request.id}`)}
                >
                  Selesai
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl
          className="max-w-full"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Semua meja', count: data.tables.length },
            { value: 'billiard', label: 'Billiard', count: data.metrics.billiardTotal },
            { value: 'cafe', label: 'Cafe', count: data.metrics.cafeTotal },
            { value: 'attention', label: 'Perlu perhatian', count: attentionCount, tone: 'error' },
          ]}
        />
        <div className="relative w-full lg:w-72">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari meja, guest, bill, order…"
            className={cn(inputClass, 'h-10 pl-9')}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start">
        <div className="flex flex-col gap-5 xl:col-span-8">
          {(filter === 'all' || filter === 'billiard' || filter === 'attention') &&
          billiardTables.length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-headline-md font-extrabold tracking-tight text-on-surface">
                    Arena Meja Billiard
                  </h2>
                  <span className="rounded border border-outline-variant/30 bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary">
                    {data.metrics.billiardRunning} running · {data.metrics.billiardAvailable} ready
                  </span>
                </div>
                <span className="hidden text-[11px] text-on-surface-variant sm:block">
                  Klik kartu untuk inspeksi &amp; penagihan
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {billiardTables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    selected={selectedId === table.id}
                    busy={Boolean(busyKey && busyKey.startsWith(`${table.id}:`))}
                    onSelect={() => setSelectedId(table.id)}
                    onStart={() => setStartId(table.id)}
                    onOpenCafe={() => void handleOpenCafe(table)}
                    onPause={() => void handlePause(table)}
                    onResume={() => void handleResume(table)}
                    onStopPay={() => void handleStop(table)}
                    onAddOrder={() => setOrderId(table.id)}
                    onPay={() => openPayment(table, 'cash')}
                    onMove={() => setMoveId(table.id)}
                    onReady={() => void handleReady(table)}
                    onApprove={(id) => void handleApprove(id)}
                    onReject={(id) => setRejectOrder({ id, number: 'Order' })}
                    onPrint={() =>
                      table.bill && window.open(`/print/bill/${table.bill.id}`, '_blank')
                    }
                    onShowQr={() => setQrId(table.id)}
                    onResolveService={(id) => void handleResolveService(id)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {(filter === 'all' || filter === 'cafe' || filter === 'attention') && cafeTables.length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-headline-md font-extrabold tracking-tight text-on-surface">
                    Meja F&amp;B Cafe &amp; Lounge
                  </h2>
                  <span className="rounded border border-outline-variant/30 bg-surface-container-highest px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary">
                    {data.metrics.cafeOccupied} occupied · {data.metrics.cafeTotal} tables
                  </span>
                </div>
                <span className="hidden text-[11px] text-on-surface-variant sm:block">
                  Live kitchen &amp; QR status
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {cafeTables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    selected={selectedId === table.id}
                    busy={Boolean(busyKey && busyKey.startsWith(`${table.id}:`))}
                    onSelect={() => setSelectedId(table.id)}
                    onStart={() => setStartId(table.id)}
                    onOpenCafe={() => void handleOpenCafe(table)}
                    onPause={() => void handlePause(table)}
                    onResume={() => void handleResume(table)}
                    onStopPay={() => void handleStop(table)}
                    onAddOrder={() => setOrderId(table.id)}
                    onPay={() => openPayment(table, 'cash')}
                    onMove={() => setMoveId(table.id)}
                    onReady={() => void handleReady(table)}
                    onApprove={(id) => void handleApprove(id)}
                    onReject={(id) => setRejectOrder({ id, number: 'Order' })}
                    onPrint={() =>
                      table.bill && window.open(`/print/bill/${table.bill.id}`, '_blank')
                    }
                    onShowQr={() => setQrId(table.id)}
                    onResolveService={(id) => void handleResolveService(id)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {filtered.length === 0 ? (
            <EmptyState
              icon="search_off"
              title="Tidak ada meja yang cocok"
              description="Coba ubah filter atau kata pencarian."
            />
          ) : null}
        </div>

        <aside className="sticky top-[78px] hidden xl:col-span-4 xl:block">
          <BillPanel table={selected} {...panelProps} />
        </aside>
      </div>

      {selected?.bill ? (
        <div className="fixed inset-x-3 bottom-[74px] z-30 xl:hidden">
          <button
            type="button"
            onClick={() => setMobileBillOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-primary/30 bg-surface-container-high/95 px-3 py-2.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Icon name="receipt_long" className="text-[18px]" />
              </span>
              <span className="text-left">
                <span className="block text-[10px] uppercase tracking-wider text-outline">
                  Bill meja {selected.code}
                </span>
                <span className="numeric block text-body-sm font-bold text-on-surface">
                  {formatRp(selected.bill.total)}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
              Detail
              <Icon name="keyboard_arrow_up" className="text-[16px]" />
            </span>
          </button>
        </div>
      ) : null}

      <div className="h-14 xl:hidden" />

      <StartSessionDialog
        table={startTable}
        open={Boolean(startTable)}
        onClose={() => setStartId(null)}
      />
      <OrderDialog
        table={orderTable}
        open={Boolean(orderTable)}
        categories={data.categories}
        items={data.menuItems}
        onClose={() => setOrderId(null)}
      />
      <MoveTableDialog
        open={Boolean(moveSource)}
        source={moveSource}
        targets={moveTargets}
        onClose={() => setMoveId(null)}
      />
      <QrDialog open={Boolean(qrTable)} table={qrTable} onClose={() => setQrId(null)} />
      <QrisGatewayDialog
        open={Boolean(qrisGatewayTable)}
        table={qrisGatewayTable}
        onClose={() => setQrisGatewayId(null)}
      />
      <QuickOpenDialog
        open={quickOpen}
        tables={availableTables}
        onClose={() => setQuickOpen(false)}
        onPick={(table) => {
          setQuickOpen(false);
          if (table.kind === 'billiard') setStartId(table.id);
          else void handleOpenCafe(table);
        }}
      />
      <ShiftOpenDialog open={shiftOpen} onClose={() => setShiftOpen(false)} />
      <PaymentDialog
        open={Boolean(payState)}
        table={payTable}
        billId={payState?.billId}
        billNumber={payState?.billNumber}
        total={payState?.total}
        defaultMethod={payState?.method}
        defaultSplit={payState?.split}
        onClose={() => setPayState(null)}
      />
      <DiscountDialog
        open={Boolean(discountTable)}
        table={discountTable}
        onClose={() => setDiscountId(null)}
      />
      <VoidBillDialog
        open={Boolean(voidTable)}
        table={voidTable}
        onClose={() => setVoidId(null)}
      />
      <ConfirmDialog
        open={Boolean(rejectOrder)}
        title="Tolak self-order?"
        description={
          rejectOrder
            ? `Order ${rejectOrder.number} akan dibatalkan dan stok item dikembalikan ke menu.`
            : undefined
        }
        confirmLabel="Tolak order"
        loading={rejecting}
        onClose={() => setRejectOrder(null)}
        onConfirm={confirmReject}
      />

      <Modal
        open={mobileBillOpen && Boolean(selected?.bill)}
        onClose={() => setMobileBillOpen(false)}
        bodyClassName="p-0"
        size="md"
      >
        {selected ? (
          <BillPanel table={selected} {...panelProps} />
        ) : null}
      </Modal>
    </div>
  );
}
