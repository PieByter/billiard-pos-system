import { formatRp } from '@/lib/format';
import type { CashierMetrics } from '@/lib/types';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/format';

function SegmentBar({
  segments,
}: {
  segments: Array<{ value: number; className: string; label: string }>;
}) {
  return (
    <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-container-highest">
      {segments.map((segment) =>
        segment.value > 0 ? (
          <div
            key={segment.label}
            className={cn('h-full rounded-full', segment.className)}
            style={{ width: `${Math.max(4, segment.value)}%` }}
            title={`${segment.label}: ${segment.value}%`}
          />
        ) : null,
      )}
    </div>
  );
}

export function CashierMetricsStrip({ metrics }: { metrics: CashierMetrics }) {
  const totalBilliard = Math.max(1, metrics.billiardTotal);
  const runningPct = (metrics.billiardRunning / totalBilliard) * 100;
  const pausedPct = (metrics.billiardPaused / totalBilliard) * 100;
  const availablePct = (metrics.billiardAvailable / totalBilliard) * 100;
  const cleaningPct = (metrics.billiardCleaning / totalBilliard) * 100;
  const cafePct = metrics.cafeTotal ? (metrics.cafeOccupied / metrics.cafeTotal) * 100 : 0;

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {/* Billiard capacity */}
      <div className="panel relative overflow-hidden rounded-xl p-4">
        <div className="pointer-events-none absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-primary/[0.06]" />
        <div className="flex items-center justify-between">
          <span className="text-label-badge font-bold uppercase tracking-[0.09em] text-on-surface-variant">
            Meja Billiard · {metrics.billiardTotal} total
          </span>
          <Icon name="sports_bar" className="text-[19px] text-primary" />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="numeric text-numeric-lg font-bold text-on-surface">
            {metrics.billiardRunning}
          </span>
          <span className="text-body-sm font-semibold text-primary">running</span>
          <span className="text-body-sm text-on-surface-variant">
            / {metrics.billiardPaused} pause / {metrics.billiardAvailable} ready
          </span>
        </div>
        <div className="mt-3">
          <SegmentBar
            segments={[
              { value: runningPct, className: 'bg-primary', label: 'running' },
              { value: pausedPct, className: 'bg-tertiary', label: 'paused' },
              { value: cleaningPct, className: 'bg-error', label: 'cleaning' },
              { value: availablePct, className: 'bg-outline-variant', label: 'available' },
            ]}
          />
        </div>
      </div>

      {/* Cafe capacity */}
      <div className="panel relative overflow-hidden rounded-xl p-4">
        <div className="pointer-events-none absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-secondary/[0.06]" />
        <div className="flex items-center justify-between">
          <span className="text-label-badge font-bold uppercase tracking-[0.09em] text-on-surface-variant">
            Cafe &amp; Lounge
          </span>
          <Icon name="table_restaurant" className="text-[19px] text-secondary" />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="numeric text-numeric-lg font-bold text-on-surface">
            {metrics.cafeOccupied}
          </span>
          <span className="text-body-sm font-semibold text-secondary">terisi</span>
          <span className="text-body-sm text-on-surface-variant">/ {metrics.cafeTotal} meja</span>
        </div>
        <div className="mt-3">
          <SegmentBar
            segments={[
              { value: cafePct, className: 'bg-secondary', label: 'terisi' },
              { value: 100 - cafePct, className: 'bg-outline-variant', label: 'kosong' },
            ]}
          />
        </div>
      </div>

      {/* Open bills */}
      <div className="panel relative overflow-hidden rounded-xl p-4">
        <div className="pointer-events-none absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-tertiary/[0.05]" />
        <div className="flex items-center justify-between">
          <span className="text-label-badge font-bold uppercase tracking-[0.09em] text-on-surface-variant">
            Total Open Bills
          </span>
          <Icon name="receipt_long" className="text-[19px] text-tertiary" />
        </div>
        <div className="mt-2">
          <span className="numeric text-numeric-lg font-bold tracking-tight text-tertiary">
            {formatRp(metrics.openBillTotal)}
          </span>
        </div>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          {metrics.openBillCount} bill aktif belum ditutup
        </p>
      </div>

      {/* Attention */}
      <div
        className={cn(
          'panel relative overflow-hidden rounded-xl p-4',
          metrics.pendingCount > 0 && 'glow-alert border-error/30',
        )}
      >
        <div className="pointer-events-none absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-error/[0.08]" />
        <div className="flex items-center justify-between">
          <span className="text-label-badge font-bold uppercase tracking-[0.09em] text-on-surface-variant">
            Perlu Aksi
          </span>
          {metrics.pendingCount > 0 ? (
            <span className="rounded-full bg-error-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-error-container">
              Action needed
            </span>
          ) : (
            <Icon name="task_alt" className="text-[19px] text-primary" />
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={cn(
              'numeric text-numeric-lg font-bold',
              metrics.pendingCount > 0 ? 'text-error' : 'text-primary',
            )}
          >
            {metrics.pendingCount}
          </span>
          <span className="text-body-sm text-on-surface-variant">self-order pending</span>
        </div>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          {metrics.serviceRequestCount > 0
            ? `${metrics.serviceRequestCount} panggilan waiter · cek banner`
            : 'Tidak ada panggilan waiter'}
        </p>
      </div>
    </section>
  );
}
