import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { SectionHeader, StatCard } from '@/components/ui/stat-card';
import { cn, formatRp } from '@/lib/format';
import { PAY_METHOD_LABELS } from '@/lib/constants';
import type { ReportData } from '@/lib/types';

const RANGES = [7, 14, 30];

function dayLabel(key: string) {
  const date = new Date(`${key}T00:00:00+07:00`);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function ReportView({ data, range }: { data: ReportData; range: number }) {
  const maxDay = Math.max(1, ...data.days.map((day) => day.revenue));
  const totalMix = Math.max(1, data.totals.revenue);
  const billiardShare = totalMix
    ? Math.max(0, Math.round((data.totals.billiard / totalMix) * 100))
    : 0;
  const fnbShare = totalMix
    ? Math.max(0, Math.round((data.totals.fnb / totalMix) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Business intelligence"
        title="Laporan Penjualan"
        description="Tren omzet, komposisi billiard vs F&B, metode bayar, dan menu terlaris."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/reports/export?range=${range}`}
              className="flex items-center gap-1.5 rounded-lg border border-outline-variant/35 bg-surface-container px-3 py-2 text-body-sm font-semibold text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Icon name="download" className="text-[17px]" />
              Export CSV
            </a>
            <div className="flex items-center gap-1 rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-1">
              {RANGES.map((value) => (
                <Link
                  key={value}
                  href={`/staff/admin/reports?range=${value}`}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-body-sm font-semibold transition-colors',
                    range === value
                      ? 'bg-surface-container-high text-primary'
                      : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  {value} hari
                </Link>
              ))}
            </div>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label={`Omzet ${range} hari`}
          value={formatRp(data.totals.revenue)}
          icon="trending_up"
          tone="primary"
          hint={
            data.totals.refunds > 0
              ? `${data.totals.transactions} transaksi · refund ${formatRp(data.totals.refunds)}`
              : `${data.totals.transactions} transaksi settled`
          }
        />
        <StatCard
          label="Rata-rata per bill"
          value={formatRp(data.totals.avgBill)}
          icon="receipt_long"
          tone="cyan"
          hint="Average check size"
        />
        <StatCard
          label="Billiard"
          value={formatRp(data.totals.billiard)}
          icon="sports_score"
          tone="tertiary"
          hint={`${billiardShare}% share omzet`}
        />
        <StatCard
          label="F&B Cafe"
          value={formatRp(data.totals.fnb)}
          icon="restaurant"
          tone="primary"
          hint={`${fnbShare}% share omzet`}
        />
      </section>

      <section className="panel flex flex-col gap-4 rounded-xl p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-headline-md font-bold text-on-surface">Tren omzet harian</h2>
            <p className="text-body-sm text-on-surface-variant">
              Bar = omzet, split billiard (cyan) dan F&B (amber)
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-secondary" /> Billiard
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-tertiary" /> F&B
            </span>
          </div>
        </div>

        <div className="flex h-64 items-end gap-2 border-b border-outline-variant/25 pb-2">
          {data.days.map((day) => {
            const height = Math.max(2, (day.revenue / maxDay) * 100);
            const billiardHeight = day.revenue ? (day.billiardRevenue / day.revenue) * 100 : 0;
            const fnbHeight = day.revenue ? (day.fnbRevenue / day.revenue) * 100 : 0;
            return (
              <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="relative flex h-full w-full items-end justify-center">
                  <div
                    className="relative w-full max-w-[44px] overflow-hidden rounded-t-md border border-outline-variant/20 bg-surface-container-high transition-all group-hover:brightness-110"
                    style={{ height: `${height}%` }}
                    title={`${dayLabel(day.date)} · ${formatRp(day.revenue)} · ${day.transactionCount} transaksi`}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 bg-secondary/80"
                      style={{ height: `${billiardHeight}%` }}
                    />
                    <div
                      className="absolute inset-x-0 bottom-0 bg-tertiary/85"
                      style={{ height: `${fnbHeight}%`, bottom: `${billiardHeight}%` }}
                    />
                  </div>
                </div>
                <span className="text-[9px] uppercase tracking-wider text-outline">
                  {dayLabel(day.date)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="text-label-badge uppercase tracking-[0.08em] text-on-surface-variant">
                <th className="py-2 font-bold">Tanggal</th>
                <th className="py-2 font-bold">Transaksi</th>
                <th className="py-2 font-bold">Billiard</th>
                <th className="py-2 font-bold">F&B</th>
                {data.totals.refunds > 0 ? <th className="py-2 font-bold">Refund</th> : null}
                <th className="py-2 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-body-sm">
              {[...data.days].reverse().map((day) => (
                <tr key={day.date} className="hover:bg-surface-container-high/20">
                  <td className="py-2.5 text-on-surface">{dayLabel(day.date)}</td>
                  <td className="numeric py-2.5 text-on-surface-variant">{day.transactionCount}</td>
                  <td className="numeric py-2.5 text-secondary">{formatRp(day.billiardRevenue)}</td>
                  <td className="numeric py-2.5 text-tertiary">{formatRp(day.fnbRevenue)}</td>
                  {data.totals.refunds > 0 ? (
                    <td className="numeric py-2.5 text-error">
                      {day.refunds > 0 ? `- ${formatRp(day.refunds)}` : '—'}
                    </td>
                  ) : null}
                  <td className="numeric py-2.5 text-right font-bold text-on-surface">
                    {formatRp(day.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-start">
        <section className="panel flex flex-col gap-3 rounded-xl p-4 xl:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-headline-md font-bold text-on-surface">Metode bayar</h2>
            <Badge tone="outline">{data.totals.transactions} bills</Badge>
          </div>
          {data.paymentMix.map((row) => (
            <div key={row.method} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-body-sm">
                <span className="flex items-center gap-1.5 text-on-surface">
                  <Icon
                    name={
                      row.method === 'cash'
                        ? 'payments'
                        : row.method === 'qris'
                          ? 'qr_code_2'
                          : row.method === 'edc'
                            ? 'credit_card'
                            : 'account_balance'
                    }
                    className="text-[16px] text-on-surface-variant"
                  />
                  {PAY_METHOD_LABELS[row.method]}
                </span>
                <span className="numeric font-semibold text-on-surface">{formatRp(row.amount)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      row.method === 'cash' ? 'bg-primary' : 'bg-secondary',
                    )}
                    style={{ width: `${Math.max(0, row.share)}%` }}
                  />
                </div>
                <span className="numeric w-10 text-right text-[10px] text-outline">{row.share}%</span>
              </div>
            </div>
          ))}
          <div className="mt-auto rounded-lg border border-outline-variant/20 bg-surface-container-low p-2.5 text-[10px] leading-4 text-on-surface-variant">
            Semua pembayaran memiliki idempotency key / external ref unik. Webhook QRIS tercatat
            sebagai append-only payment.
          </div>
        </section>

        <section className="panel flex flex-col gap-2 rounded-xl p-4 xl:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-headline-md font-bold text-on-surface">Menu terlaris</h2>
            <Badge tone="tertiary">Top 6</Badge>
          </div>
          {data.topItems.length === 0 ? (
            <p className="py-6 text-center text-body-sm text-on-surface-variant">Belum ada data.</p>
          ) : (
            data.topItems.map((item, index) => (
              <div
                key={item.name}
                className="flex items-center gap-2.5 rounded-lg border border-outline-variant/15 bg-surface-container p-2.5"
              >
                <span className="numeric flex h-7 w-7 items-center justify-center rounded-lg bg-surface-container-highest text-[10px] font-bold text-tertiary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-semibold text-on-surface">{item.name}</p>
                  <p className="text-[10px] text-outline">{item.qty} porsi terjual</p>
                </div>
                <span className="numeric text-body-sm font-bold text-primary">
                  {formatRp(item.revenue)}
                </span>
              </div>
            ))
          )}
        </section>

        <section className="panel flex flex-col gap-2 rounded-xl p-4 xl:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-headline-md font-bold text-on-surface">Meja terlaris</h2>
            <Badge tone="cyan">Top tables</Badge>
          </div>
          {data.topTables.length === 0 ? (
            <p className="py-6 text-center text-body-sm text-on-surface-variant">Belum ada data.</p>
          ) : (
            data.topTables.map((table, index) => (
              <div
                key={table.code}
                className="flex items-center gap-2.5 rounded-lg border border-outline-variant/15 bg-surface-container p-2.5"
              >
                <span className="numeric flex h-7 w-7 items-center justify-center rounded-lg bg-surface-container-highest text-[10px] font-bold text-secondary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-semibold text-on-surface">
                    Meja {table.code}
                    <span className="ml-1.5 text-[10px] font-normal text-outline">{table.zone}</span>
                  </p>
                  <p className="text-[10px] text-outline">{table.sessions} sesi selesai</p>
                </div>
                <span className="numeric text-body-sm font-bold text-primary">
                  {formatRp(table.revenue)}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
