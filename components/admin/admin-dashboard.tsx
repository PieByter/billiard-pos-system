'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SectionHeader, StatCard, EmptyState } from '@/components/ui/stat-card';
import { LiveClock } from '@/components/live/live';
import { RatesMaster } from './rates-master';
import { ShiftBalanceCard } from './shift-balance-card';
import { useRealtimeRefresh } from '@/components/realtime/use-realtime-refresh';
import { cn, formatClock, formatDate, formatDuration, formatRp, initials } from '@/lib/format';
import { PAY_METHOD_LABELS, ROLE_LABELS } from '@/lib/constants';
import type { AdminData } from '@/lib/types';

export function AdminDashboard({
  data,
  ownerName,
}: {
  data: AdminData;
  ownerName: string;
}) {
  const router = useRouter();
  const { shiftStats: stats, shift } = data;
  const billiardShare = stats.revenue
    ? Math.max(0, Math.round((stats.billiardRevenue / stats.revenue) * 100))
    : 0;
  const fnbShare = stats.revenue
    ? Math.max(0, Math.round((stats.fnbRevenue / stats.revenue) * 100))
    : 0;

  useRealtimeRefresh(['payments', 'bills', 'shifts', 'audit_log']);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Owner console"
        title="Administrasi & Tutup Shift"
        description="Otorisasi finansial, snapshot tarif billiard, dan audit trail pencegahan fraud."
        actions={
          <>
            <div className="hidden items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container-lowest px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface-variant md:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${shift ? 'bg-primary animate-pulse' : 'bg-tertiary'}`} />
              {shift ? 'Shift aktif' : 'No shift'} · <LiveClock className="text-[10px]" />
            </div>
            <Button variant="secondary" size="md" onClick={() => router.refresh()}>
              <Icon name="sync" className="text-[18px]" />
              <span className="hidden sm:inline">Sinkron</span>
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                if (shift) window.open(`/print/shift/${shift.id}`, '_blank');
                else toast.info('Belum ada shift aktif untuk dicetak.');
              }}
            >
              <Icon name="print" className="text-[18px]" />
              <span className="hidden sm:inline">Cetak X-report</span>
              <span className="sm:hidden">X-report</span>
            </Button>
          </>
        }
      />

      {/* KPI matrix */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard
          label="Omset shift berjalan"
          value={formatRp(stats.revenue)}
          icon="trending_up"
          tone="primary"
          hint={
            stats.refundAmount > 0
              ? `${stats.transactionCount} transaksi · refund ${formatRp(stats.refundAmount)}`
              : `${stats.transactionCount} transaksi settled`
          }
        />
        <StatCard
          label="Pendapatan billiard"
          value={formatRp(stats.billiardRevenue)}
          icon="sports_score"
          tone="cyan"
          hint={`${formatDuration(stats.totalPlaySeconds)} total main`}
          footer={
            <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
              <span>Share omzet</span>
              <span className="numeric rounded bg-surface-container-high px-1.5 py-0.5 text-secondary">
                {billiardShare}%
              </span>
            </div>
          }
        />
        <StatCard
          label="Pendapatan F&B"
          value={formatRp(stats.fnbRevenue)}
          icon="restaurant"
          tone="tertiary"
          hint={`${data.menuCount} menu aktif`}
          footer={
            <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
              <span>Share omzet</span>
              <span className="numeric rounded bg-surface-container-high px-1.5 py-0.5 text-tertiary">
                {fnbShare}%
              </span>
            </div>
          }
        />
        <StatCard
          label="Kas fisik laci"
          value={formatRp(stats.cashInDrawer)}
          icon="point_of_sale"
          tone="primary"
          hint={`Modal ${formatRp(shift?.openingCash ?? 0)} + cash ${formatRp(stats.cashRevenue)}`}
        />
        <StatCard
          label="Non-tunai"
          value={formatRp(stats.nonCashRevenue)}
          icon="credit_card"
          tone="cyan"
          hint="QRIS · EDC · transfer"
          footer={
            <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
              <span>Capture rate</span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">
                {stats.revenue ? Math.round((stats.nonCashRevenue / stats.revenue) * 100) : 0}% share
              </span>
            </div>
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-start">
        <div className="xl:col-span-7">
          <ShiftBalanceCard shift={shift} stats={stats} ownerName={ownerName} />
        </div>
        <div className="xl:col-span-5">
          <CompositionCard data={data} />
        </div>
      </div>

      <RatesMaster rates={data.rates} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-start">
        <div className="xl:col-span-8">
          <AuditTable audits={data.audits} />
        </div>
        <div className="flex flex-col gap-3 xl:col-span-4">
          <QuickOps data={data} />
          <ShiftHistory data={data} />
        </div>
      </div>
    </div>
  );
}

function CompositionCard({ data }: { data: AdminData }) {
  const stats = data.shiftStats;
  const total = Math.max(1, stats.revenue);
  const cashShare = Math.max(0, Math.min(1, stats.cashRevenue / total));
  const circumference = 2 * Math.PI * 76;
  const cashLength = cashShare * circumference;

  return (
    <section className="panel flex h-full flex-col gap-3 rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-headline-md font-bold text-on-surface">Komposisi kas &amp; volume</h2>
          <p className="text-body-sm text-on-surface-variant">Breakdown penerimaan window shift</p>
        </div>
        <Badge tone="primary" dot pulse>
          Real-time
        </Badge>
      </div>

      <div className="relative flex h-48 items-center justify-center">
        <svg viewBox="0 0 200 200" className="h-44 w-44 -rotate-90">
          <circle
            cx="100"
            cy="100"
            r="76"
            fill="transparent"
            stroke="#2d3449"
            strokeWidth="16"
          />
          {stats.nonCashRevenue > 0 ? (
            <circle
              cx="100"
              cy="100"
              r="76"
              fill="transparent"
              stroke="#4cd7f6"
              strokeWidth="16"
              strokeDasharray={`${((stats.nonCashRevenue / total) * circumference).toFixed(2)} ${circumference.toFixed(2)}`}
              strokeDashoffset={(-cashLength).toFixed(2)}
              strokeLinecap="round"
            />
          ) : null}
          {stats.cashRevenue > 0 ? (
            <circle
              cx="100"
              cy="100"
              r="76"
              fill="transparent"
              stroke="#4edea3"
              strokeWidth="16"
              strokeDasharray={`${Math.max(0, cashLength - 4).toFixed(2)} ${circumference.toFixed(2)}`}
              strokeLinecap="round"
            />
          ) : null}
        </svg>
        <div className="absolute flex flex-col items-center text-center">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">
            Total transaksi
          </span>
          <span className="numeric text-numeric-lg font-bold text-on-surface">
            {stats.transactionCount}
          </span>
          <span className="numeric text-[10px] text-primary">100% settled</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low p-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
              Cash
            </span>
          </div>
          <p className="numeric mt-1 text-body-md font-bold text-on-surface">
            {formatRp(stats.cashRevenue)}
          </p>
          <p className="text-[9px] text-outline">{Math.round(cashShare * 100)}% share</p>
        </div>
        <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low p-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-secondary" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
              Non-tunai
            </span>
          </div>
          <p className="numeric mt-1 text-body-md font-bold text-on-surface">
            {formatRp(stats.nonCashRevenue)}
          </p>
          <p className="text-[9px] text-outline">
            {100 - Math.round(cashShare * 100)}% share
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {stats.paymentBreakdown.map((row) => (
          <div key={row.method} className="flex items-center gap-2">
            <span className="w-20 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              {PAY_METHOD_LABELS[row.method]}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
              <div
                className={cn(
                  'h-full rounded-full',
                  row.method === 'cash' ? 'bg-primary' : 'bg-secondary',
                )}
                style={{ width: `${stats.revenue ? (row.amount / stats.revenue) * 100 : 0}%` }}
              />
            </div>
            <span className="numeric w-20 text-right text-[10px] text-on-surface">
              {formatRp(row.amount)}
            </span>
            <span className="numeric w-6 text-right text-[9px] text-outline">{row.count}x</span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-1 border-t border-outline-variant/20 pt-2 text-[11px] text-on-surface-variant">
        <div className="flex justify-between">
          <span>Rata-rata durasi main</span>
          <span className="numeric text-on-surface">
            {stats.avgPlaySeconds !== null ? formatDuration(stats.avgPlaySeconds) : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Meja paling laris</span>
          <span className="text-secondary">
            {stats.topTable ? `Meja ${stats.topTable.code} · ${formatRp(stats.topTable.amount)}` : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Open bill saat ini</span>
          <span className="numeric text-tertiary">
            {stats.openBills} · {formatRp(stats.openBillTotal)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Thermal print</span>
          <span className="flex items-center gap-1 text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Browser 80mm ready
          </span>
        </div>
      </div>
    </section>
  );
}

function AuditTable({ audits }: { audits: AdminData['audits'] }) {
  function exportCsv() {
    const header = ['timestamp', 'staff', 'role', 'action', 'entity', 'entityId', 'detail'];
    const rows = audits.map((entry) => [
      new Date(entry.createdAt).toISOString(),
      entry.staffName,
      entry.staffRole,
      entry.action,
      entry.entityType,
      entry.entityId ?? '',
      entry.detail ? JSON.stringify(entry.detail).replaceAll('"', "'") : '',
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cuetap-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Audit log diekspor');
  }

  return (
    <section className="panel flex flex-col gap-3 rounded-xl p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-error/10 text-error">
            <Icon name="policy" className="text-[22px]" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-headline-md font-bold text-on-surface">
                Security audit log
              </h2>
              <Badge tone="error">Immutable</Badge>
            </div>
            <p className="text-body-sm text-on-surface-variant">
              Void, diskon, panggilan, dan mutasi finansial sensitif.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2.5 py-1.5 text-[10px] text-on-surface-variant">
            Semua event
          </span>
          <button
            type="button"
            onClick={exportCsv}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/30 text-on-surface-variant transition-colors hover:text-primary"
            title="Ekspor CSV"
          >
            <Icon name="download" className="text-[18px]" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-outline-variant/20">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="bg-surface-container-high text-label-badge uppercase tracking-[0.08em] text-on-surface-variant">
              <th className="px-3 py-2.5 font-bold">Waktu</th>
              <th className="px-3 py-2.5 font-bold">Operator</th>
              <th className="px-3 py-2.5 font-bold">Event</th>
              <th className="px-3 py-2.5 font-bold">Objek</th>
              <th className="px-3 py-2.5 font-bold">Detail</th>
              <th className="px-3 py-2.5 font-bold">Otorisasi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/15 text-body-sm">
            {audits.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-on-surface-variant">
                  Belum ada audit event.
                </td>
              </tr>
            ) : (
              audits.map((entry) => {
                const sensitive =
                  entry.action.includes('void') ||
                  entry.action.includes('discount') ||
                  entry.action.includes('cancel') ||
                  entry.action.includes('reject');
                return (
                  <tr
                    key={entry.id}
                    className={cn(
                      'transition-colors hover:bg-surface-container-high/20',
                      sensitive && 'bg-error-container/[0.03]',
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Icon name="schedule" className="text-[14px] text-outline" />
                        <span className="numeric text-[11px] text-on-surface">
                          {formatClock(entry.createdAt)}
                        </span>
                      </div>
                      <span className="text-[9px] text-outline">{formatDate(entry.createdAt)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold',
                            entry.staffRole === 'owner'
                              ? 'bg-tertiary-container text-on-tertiary-container'
                              : 'bg-surface-container-high text-primary',
                          )}
                        >
                          {initials(entry.staffName)}
                        </span>
                        <div>
                          <div className="text-body-sm font-semibold text-on-surface">
                            {entry.staffName}
                          </div>
                          <div className="text-[9px] uppercase tracking-wider text-outline">
                            {ROLE_LABELS[entry.staffRole] ?? 'System'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                          sensitive
                            ? 'bg-error/15 text-error'
                            : entry.action.startsWith('bill')
                              ? 'bg-primary/15 text-primary'
                              : 'bg-secondary/15 text-secondary',
                        )}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-body-sm font-semibold text-on-surface">
                      {entry.entityType}
                      {entry.entityId ? (
                        <span className="numeric ml-1 text-[9px] text-outline">
                          {entry.entityId.slice(0, 6)}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-[240px] px-3 py-2.5 text-[11px] text-on-surface-variant">
                      <span className="line-clamp-2">
                        {entry.detail
                          ? Object.entries(entry.detail)
                              .slice(0, 3)
                              .map(([key, value]) => `${key}: ${String(value)}`)
                              .join(' · ')
                          : '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Badge tone={sensitive ? 'error' : entry.staffRole === 'owner' ? 'paused' : 'neutral'}>
                        {sensitive
                          ? entry.staffRole === 'owner'
                            ? 'Owner verified'
                            : 'Staff action'
                          : entry.staffRole === 'owner'
                            ? 'Executive'
                            : entry.staffName === 'Sistem'
                              ? 'System'
                              : 'POS session'}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1 text-[10px] text-outline sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-1">
          <Icon name="history_edu" className="text-[15px]" />
          Semua mutasi void &amp; diskon dicatat append-only.
        </span>
        <span className="numeric">
          Ledger head: #{audits[0]?.id.slice(0, 4) ?? '0000'}-{audits[0]?.id.slice(4, 8) ?? '0000'}
        </span>
      </div>
    </section>
  );
}

function QuickOps({ data }: { data: AdminData }) {
  return (
    <section className="panel flex flex-col gap-2 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-body-md font-bold text-on-surface">Operasional cepat</h2>
        <Badge tone="outline">{data.tableCount} meja</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/staff/admin/menu"
          className="flex flex-col gap-1 rounded-lg border border-outline-variant/25 bg-surface-container p-2.5 transition-colors hover:border-primary/30 hover:bg-surface-container-high"
        >
          <Icon name="restaurant_menu" className="text-[19px] text-tertiary" />
          <span className="text-body-sm font-semibold text-on-surface">Menu &amp; stok</span>
          <span className="text-[10px] text-outline">{data.menuCount} item</span>
        </Link>
        <Link
          href="/staff/admin/tables"
          className="flex flex-col gap-1 rounded-lg border border-outline-variant/25 bg-surface-container p-2.5 transition-colors hover:border-secondary/30 hover:bg-surface-container-high"
        >
          <Icon name="table_restaurant" className="text-[19px] text-secondary" />
          <span className="text-body-sm font-semibold text-on-surface">Meja &amp; QR</span>
          <span className="text-[10px] text-outline">{data.tableCount} meja</span>
        </Link>
        <Link
          href="/staff/admin/reports"
          className="flex flex-col gap-1 rounded-lg border border-outline-variant/25 bg-surface-container p-2.5 transition-colors hover:border-primary/30 hover:bg-surface-container-high"
        >
          <Icon name="monitoring" className="text-[19px] text-primary" />
          <span className="text-body-sm font-semibold text-on-surface">Laporan</span>
          <span className="text-[10px] text-outline">7 hari terakhir</span>
        </Link>
        <Link
          href="/staff/admin/refunds"
          className="flex flex-col gap-1 rounded-lg border border-outline-variant/25 bg-surface-container p-2.5 transition-colors hover:border-error/30 hover:bg-surface-container-high"
        >
          <Icon name="undo" className="text-[19px] text-error" />
          <span className="text-body-sm font-semibold text-on-surface">Refund</span>
          <span className="text-[10px] text-outline">{formatRp(data.shiftStats.refundAmount)}</span>
        </Link>
        <Link
          href="/staff/admin/staff"
          className="flex flex-col gap-1 rounded-lg border border-outline-variant/25 bg-surface-container p-2.5 transition-colors hover:border-secondary/30 hover:bg-surface-container-high"
        >
          <Icon name="badge" className="text-[19px] text-secondary" />
          <span className="text-body-sm font-semibold text-on-surface">Staff</span>
          <span className="text-[10px] text-outline">Akses &amp; role</span>
        </Link>
        <Link
          href="/staff/admin/settings"
          className="flex flex-col gap-1 rounded-lg border border-outline-variant/25 bg-surface-container p-2.5 transition-colors hover:border-tertiary/30 hover:bg-surface-container-high"
        >
          <Icon name="settings" className="text-[19px] text-tertiary" />
          <span className="text-body-sm font-semibold text-on-surface">Pengaturan</span>
          <span className="text-[10px] text-outline">Pajak &amp; venue</span>
        </Link>
      </div>
      <div className="rounded-lg border border-error/20 bg-error/[0.04] px-2.5 py-2 text-[10px] leading-4 text-on-surface-variant">
        Void, diskon, dan refund hanya bisa dilakukan owner dan otomatis tercatat di audit log.
      </div>
    </section>
  );
}

function ShiftHistory({ data }: { data: AdminData }) {
  return (
    <section className="panel flex flex-col gap-2 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-body-md font-bold text-on-surface">Riwayat shift</h2>
        <Badge tone="outline">{data.shiftHistory.length}</Badge>
      </div>
      {data.shiftHistory.length === 0 ? (
        <EmptyState compact icon="history" title="Belum ada shift ditutup" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.shiftHistory.map((shift) => (
            <div
              key={shift.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant/20 bg-surface-container p-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-body-sm font-semibold text-on-surface">
                    {shift.staffName}
                  </span>
                  <span className="text-[9px] text-outline">{formatDate(shift.openedAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px]">
                  <span className="text-on-surface-variant">
                    Aktual {formatRp(shift.actualCash ?? 0)}
                  </span>
                  <span
                    className={cn(
                      'numeric font-semibold',
                      (shift.difference ?? 0) === 0
                        ? 'text-primary'
                        : (shift.difference ?? 0) > 0
                          ? 'text-secondary'
                          : 'text-error',
                    )}
                  >
                    {(shift.difference ?? 0) === 0
                      ? 'match'
                      : `${(shift.difference ?? 0) > 0 ? '+' : '-'}${formatRp(
                          Math.abs(shift.difference ?? 0),
                        )}`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.open(`/print/shift/${shift.id}`, '_blank')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
                title="Cetak Z-report"
              >
                <Icon name="receipt_long" className="text-[18px]" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
