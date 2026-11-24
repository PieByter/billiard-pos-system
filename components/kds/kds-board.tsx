'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  markOrderServedAction,
  markStationReadyAction,
  startPreparingAction,
  toggleOrderItemAction,
} from '@/app/actions/orders';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { Icon } from '@/components/ui/icon';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { LiveWait } from '@/components/live/live';
import { cn, formatDuration } from '@/lib/format';
import type { KdsData, KdsOrderView } from '@/lib/types';
import { STATION_LABELS } from '@/lib/constants';
import { orderStatusTone, ORDER_SOURCE_LABEL } from '@/components/cashier/status';
import { useRealtimeRefresh } from '@/components/realtime/use-realtime-refresh';

type StationFilter = 'all' | 'kitchen' | 'bar';
type SortMode = 'fifo' | 'billiard';

function useBuzzer() {
  const [enabled, setEnabled] = useState(true);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('cuetap:kds-buzzer');
    if (stored !== null) setEnabled(stored === '1');
  }, []);

  function toggle() {
    setEnabled((value) => {
      const next = !value;
      window.localStorage.setItem('cuetap:kds-buzzer', next ? '1' : '0');
      if (next) ensureContext();
      return next;
    });
  }

  function ensureContext() {
    if (typeof window === 'undefined') return null;
    if (!contextRef.current) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) contextRef.current = new Ctx();
    }
    if (contextRef.current?.state === 'suspended') void contextRef.current.resume();
    return contextRef.current;
  }

  function beep() {
    if (!enabled) return;
    const context = ensureContext();
    if (!context) return;
    [880, 660].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.12,
        context.currentTime + 0.02 + index * 0.18,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.16 + index * 0.18,
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime + index * 0.18);
      oscillator.stop(context.currentTime + 0.34 + index * 0.18);
    });
  }

  return { enabled, toggle, beep, ensureContext };
}

export function KdsBoard({ data }: { data: KdsData }) {
  const router = useRouter();
  const [station, setStation] = useState<StationFilter>('all');
  const [sort, setSort] = useState<SortMode>('fifo');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const buzzer = useBuzzer();
  const knownOrders = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useRealtimeRefresh(['orders', 'order_items']);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  useEffect(() => {
    const accepted = data.orders.filter((order) => order.status === 'accepted');
    const fresh = accepted.filter((order) => !knownOrders.current.has(order.id));
    knownOrders.current = new Set(data.orders.map((order) => order.id));
    if (initialized.current && fresh.length > 0) {
      buzzer.beep();
      toast.info(`${fresh.length} tiket baru masuk`, {
        description: fresh.map((order) => `Meja ${order.tableCode}`).join(' · '),
      });
    }
    initialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.orders]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  const visibleOrders = data.orders
    .filter((order) =>
      station === 'all'
        ? true
        : order.items.some((item) => item.station === station),
    )
    .sort((a, b) => {
      if (sort === 'billiard') {
        const aBilliard = a.tableKind === 'billiard' ? 0 : 1;
        const bBilliard = b.tableKind === 'billiard' ? 0 : 1;
        if (aBilliard !== bBilliard) return aBilliard - bBilliard;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  const lanes = [
    {
      status: 'accepted' as const,
      title: 'Baru Masuk',
      color: 'bg-secondary',
      badge: 'cyan' as const,
      items: visibleOrders.filter((order) => order.status === 'accepted'),
    },
    {
      status: 'preparing' as const,
      title: 'Sedang Dimasak',
      color: 'bg-tertiary',
      badge: 'paused' as const,
      items: visibleOrders.filter((order) => order.status === 'preparing'),
    },
    {
      status: 'ready' as const,
      title: 'Siap Antar',
      color: 'bg-primary',
      badge: 'primary' as const,
      items: visibleOrders.filter((order) => order.status === 'ready'),
    },
  ];

  async function withBusy(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    setBusyKey(key);
    const result = await fn();
    setBusyKey(null);
    if (!result.ok) {
      toast.error(result.error ?? 'Aksi gagal.');
      return;
    }
    toast.success(message);
    router.refresh();
  }

  async function handleStart(order: KdsOrderView) {
    await withBusy(
      `start:${order.id}`,
      () => startPreparingAction(order.id),
      `Meja ${order.tableCode} mulai dimasak`,
    );
  }

  async function handleReady(order: KdsOrderView) {
    if (station === 'all') {
      setBusyKey(`ready:${order.id}`);
      const stations = new Set(order.items.map((item) => item.station));
      for (const value of stations) {
        const result = await markStationReadyAction(order.id, value);
        if (!result.ok) {
          setBusyKey(null);
          toast.error(result.error);
          return;
        }
      }
      setBusyKey(null);
      toast.success(`Order meja ${order.tableCode} siap diantar`);
      router.refresh();
      return;
    }
    await withBusy(
      `ready:${order.id}`,
      () => markStationReadyAction(order.id, station),
      `${STATION_LABELS[station]} meja ${order.tableCode} siap`,
    );
  }

  async function handleServed(order: KdsOrderView) {
    await withBusy(
      `served:${order.id}`,
      () => markOrderServedAction(order.id),
      `Meja ${order.tableCode} selesai & diarsipkan`,
    );
  }

  async function handleToggleItem(itemId: string, done: boolean) {
    setBusyKey(`item:${itemId}`);
    const result = await toggleOrderItemAction(itemId, done);
    setBusyKey(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Kitchen Display System"
        title="Antrian Dapur & Bar"
        description="Tiket realtime, checklist item, dan prioritas billiard. Tap item untuk menandai selesai."
        actions={
          <>
            <button
              type="button"
              onClick={buzzer.toggle}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-body-sm font-semibold transition-colors',
                buzzer.enabled
                  ? 'border-tertiary/30 bg-tertiary/10 text-tertiary'
                  : 'border-outline-variant/35 bg-surface-container text-outline',
              )}
            >
              <Icon name={buzzer.enabled ? 'volume_up' : 'volume_off'} className="text-[18px]" />
              <span className="hidden sm:inline">{buzzer.enabled ? 'Buzzer ON' : 'Buzzer mute'}</span>
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/35 bg-surface-container text-on-surface-variant transition-colors hover:text-on-surface"
              title="Fullscreen"
            >
              <Icon name="fullscreen" className="text-[19px]" />
            </button>
            <Button variant="secondary" size="md" onClick={() => router.refresh()}>
              <Icon name="refresh" className="text-[18px]" />
              <span className="hidden sm:inline">Sync</span>
            </Button>
          </>
        }
      />

      <div className="panel flex flex-col gap-3 rounded-xl p-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SegmentedControl
            value={station}
            onChange={setStation}
            options={[
              { value: 'all', label: 'Semua station', count: data.metrics.activeTickets },
              {
                value: 'kitchen',
                label: 'Kitchen',
                count: data.metrics.kitchenCount,
                icon: 'skillet',
                tone: 'tertiary',
              },
              {
                value: 'bar',
                label: 'Bar',
                count: data.metrics.barCount,
                icon: 'local_bar',
                tone: 'secondary',
              },
            ]}
          />
          <SegmentedControl
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'fifo', label: 'FIFO', icon: 'schedule' },
              { value: 'billiard', label: 'Billiard first', icon: 'sports_score' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2.5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">
              Live sync · 5s
            </span>
          </div>
          {station !== 'all' ? (
            <Badge tone={station === 'bar' ? 'cyan' : 'paused'}>
              <Icon name={station === 'bar' ? 'local_bar' : 'skillet'} className="text-[12px]" />
              {STATION_LABELS[station]} view
            </Badge>
          ) : null}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Antrean aktif"
          value={`${String(data.metrics.activeTickets).padStart(2, '0')} tiket`}
          icon="receipt_long"
          tone="primary"
          hint="Accepted + cooking + ready"
        />
        <StatCard
          label="Rata-rata waktu saji"
          value={
            data.metrics.avgServeSeconds !== null
              ? formatDuration(data.metrics.avgServeSeconds)
              : '—'
          }
          icon="avg_pace"
          tone="cyan"
          hint="Order served hari ini"
        />
        <StatCard
          label="Overdue > 12 menit"
          value={`${String(data.metrics.overdueCount).padStart(2, '0')} tiket`}
          icon="notification_important"
          tone="error"
          hint={data.metrics.overdueCount > 0 ? 'Perlu perhatian segera' : 'Semua on track'}
        />
        <StatCard
          label="Siap antar"
          value={`${String(data.metrics.readyCount).padStart(2, '0')} tiket`}
          icon="room_service"
          tone="tertiary"
          hint="Menunggu runner / waiter"
        />
      </section>

      <section className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
        {lanes.map((lane) => (
          <div key={lane.status} className="flex flex-col gap-2.5">
            <div className="panel flex items-center justify-between rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={cn('h-2.5 w-2.5 rounded-full', lane.color)} />
                <span className="text-body-md font-extrabold uppercase tracking-tight text-on-surface">
                  {lane.title}
                </span>
              </div>
              <Badge tone={lane.badge}>{lane.items.length} order</Badge>
            </div>

            {lane.items.length === 0 ? (
              <EmptyState
                compact
                icon={lane.status === 'ready' ? 'room_service' : 'check_circle'}
                title={lane.status === 'ready' ? 'Belum ada yang siap' : 'Lane kosong'}
                description={
                  lane.status === 'accepted'
                    ? 'Tiket baru akan muncul otomatis.'
                    : lane.status === 'preparing'
                      ? 'Mulai masak tiket dari lane baru.'
                      : 'Order yang selesai akan tampil di sini.'
                }
              />
            ) : (
              lane.items.map((order) => (
                <KdsOrderCard
                  key={order.id}
                  order={order}
                  station={station}
                  busy={Boolean(
                    busyKey &&
                      (busyKey.endsWith(order.id) || busyKey.includes(order.id)),
                  )}
                  onStart={() => void handleStart(order)}
                  onReady={() => void handleReady(order)}
                  onServed={() => void handleServed(order)}
                  onToggleItem={(itemId, done) => void handleToggleItem(itemId, done)}
                />
              ))
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

function KdsOrderCard({
  order,
  station,
  busy,
  onStart,
  onReady,
  onServed,
  onToggleItem,
}: {
  order: KdsOrderView;
  station: StationFilter;
  busy: boolean;
  onStart: () => void;
  onReady: () => void;
  onServed: () => void;
  onToggleItem: (itemId: string, done: boolean) => void;
}) {
  const items =
    station === 'all' ? order.items : order.items.filter((item) => item.station === station);
  const doneCount = items.filter((item) => item.done).length;
  const allDone = items.length > 0 && doneCount === items.length;
  const overdue = order.status !== 'ready' && order.waitSeconds > 12 * 60;
  const waitTone =
    order.status === 'ready'
      ? 'text-primary'
      : order.waitSeconds > 12 * 60
        ? 'text-error'
        : order.waitSeconds > 5 * 60
          ? 'text-tertiary'
          : 'text-primary';

  function printTicket() {
    const stationParam = station === 'all' ? 'all' : station;
    window.open(`/print/kitchen/${order.id}?station=${stationParam}`, '_blank');
  }

  return (
    <article
      className={cn(
        'relative flex flex-col gap-2.5 rounded-xl border bg-surface-container p-3 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9)] transition-colors',
        overdue
          ? 'border-error/40 glow-alert'
          : order.status === 'ready'
            ? 'border-primary/30 glow-live'
            : 'border-outline-variant/30',
      )}
    >
      {overdue ? (
        <div className="absolute -top-1 left-4 right-4 h-1 animate-pulse rounded-full bg-error shadow-[0_0_14px_rgba(255,180,171,0.7)]" />
      ) : null}
      {order.status === 'ready' ? (
        <div className="absolute -top-1 left-4 right-4 h-1 rounded-full bg-primary" />
      ) : null}

      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                order.tableKind === 'billiard'
                  ? 'bg-tertiary/15 text-tertiary'
                  : 'bg-secondary/15 text-secondary',
              )}
            >
              {order.tableKind === 'billiard' ? 'Billiard · ' : 'Cafe · '}
              {order.tableZone}
            </span>
            <span className="numeric text-[10px] text-on-surface-variant">{order.number}</span>
          </div>
          <h3
            className={cn(
              'numeric mt-1 text-[22px] font-extrabold leading-none tracking-tight',
              order.tableKind === 'billiard' ? 'text-primary' : 'text-secondary',
            )}
          >
            MEJA {order.tableCode}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-on-surface-variant">
            <Badge tone={orderStatusTone(order.status)}>{ORDER_SOURCE_LABEL[order.source]}</Badge>
            <span>{order.items.length} item</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div
            className={cn(
              'flex items-center gap-1 rounded-lg border px-2 py-1',
              overdue
                ? 'border-error/30 bg-error-container text-on-error-container'
                : 'border-outline-variant/30 bg-surface-container-highest',
            )}
          >
            <Icon name={overdue ? 'warning' : 'timer'} className={cn('text-[16px]', waitTone)} />
            <LiveWait seconds={order.waitSeconds} className={cn('text-body-sm font-bold', waitTone)} />
          </div>
          <span className="text-[9px] uppercase tracking-wider text-outline">
            {doneCount}/{items.length} done
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest/80 p-2.5">
        {items.map((item, index) => (
          <div key={item.id}>
            <button
              type="button"
              onClick={() => onToggleItem(item.id, !item.done)}
              disabled={busy}
              className="flex w-full items-start gap-2 text-left disabled:opacity-60"
            >
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                  item.done
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-outline-variant bg-surface-container text-transparent hover:border-primary/50',
                )}
              >
                <Icon name="check" className="text-[14px]" />
              </span>
              <span className={cn('min-w-0 flex-1 transition-opacity', item.done && 'opacity-45')}>
                <span className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'text-body-md font-bold text-on-surface',
                      item.done && 'line-through',
                    )}
                  >
                    {item.qty}× {item.name}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-[9px] font-bold uppercase tracking-wider',
                      item.station === 'bar' ? 'text-secondary' : 'text-tertiary',
                    )}
                  >
                    {STATION_LABELS[item.station]}
                  </span>
                </span>
                {item.note ? (
                  <span className="mt-1 inline-block rounded bg-surface-container-highest px-1.5 py-0.5 text-[10px] font-medium text-tertiary">
                    Catatan: {item.note}
                  </span>
                ) : null}
              </span>
            </button>
            {index < items.length - 1 ? (
              <div className="mt-1.5 h-px bg-outline-variant/20" />
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 pt-0.5">
        <Button size="icon-sm" variant="secondary" onClick={printTicket} title="Print tiket">
          <Icon name="print" className="text-[17px]" />
        </Button>

        {order.status === 'accepted' ? (
          <Button
            size="md"
            variant={order.tableKind === 'billiard' ? 'primary' : 'cyan'}
            className="flex-1"
            onClick={onStart}
            loading={busy}
          >
            <Icon name="soup_kitchen" className="text-[18px]" />
            Mulai Masak
          </Button>
        ) : order.status === 'preparing' ? (
          <Button
            size="md"
            variant={allDone ? 'primary' : 'secondary'}
            className="flex-1"
            onClick={onReady}
            loading={busy}
          >
            <Icon name={allDone ? 'check_circle' : 'local_fire_department'} className="text-[18px]" />
            {allDone ? 'Siap Antar' : 'Tandai Siap'}
          </Button>
        ) : (
          <Button size="md" variant="primary" className="flex-1" onClick={onServed} loading={busy}>
            <Icon name="done_all" className="text-[18px]" />
            Selesai &amp; Arsipkan
          </Button>
        )}
      </div>
      {order.status === 'preparing' && !allDone ? (
        <p className="text-center text-[9px] uppercase tracking-wider text-outline">
          {items.length - doneCount} item belum ditandai
        </p>
      ) : null}
    </article>
  );
}
