'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  processNotificationsAction,
  retryNotificationAction,
} from '@/app/actions/notifications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { cn, formatClock, formatDate } from '@/lib/format';
import type { NotificationsData } from '@/lib/types';

const TYPE_LABEL: Record<NotificationsData['items'][number]['type'], string> = {
  receipt: 'E-receipt',
  order_ready: 'Order ready',
  reservation: 'Reservasi',
  test: 'Test',
};

export function NotificationManager({ data }: { data: NotificationsData }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  async function processQueue() {
    setProcessing(true);
    const result = await processNotificationsAction();
    setProcessing(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Antrean notifikasi diproses', {
      description: `${result.data?.sent ?? 0} terkirim · ${result.data?.failed ?? 0} gagal`,
    });
    router.refresh();
  }

  async function retry(id: string) {
    setBusyId(id);
    const result = await retryNotificationAction(id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Notifikasi dikembalikan ke antrean');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Notification center"
        title="E-receipt & Notifikasi"
        description="Antrean notifikasi keluar. Pengiriman tidak memblokir alur kasir."
        actions={
          <Button variant="primary" size="md" onClick={processQueue} loading={processing}>
            <Icon name="send" className="text-[18px]" />
            Proses antrean
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Pending" value={data.stats.pending} icon="schedule" tone="tertiary" />
        <StatCard label="Terkirim" value={data.stats.sent} icon="check_circle" tone="primary" />
        <StatCard label="Gagal" value={data.stats.failed} icon="error" tone="error" />
        <StatCard
          label="Provider"
          value={data.config.label}
          icon="notifications"
          tone="neutral"
          hint={
            data.config.preferred === 'log'
              ? 'Mode demo: pesan ditulis ke log server'
              : 'Kirim via provider eksternal'
          }
        />
      </section>

      {data.items.length === 0 ? (
        <EmptyState
          icon="mark_email_read"
          title="Belum ada notifikasi"
          description="E-receipt akan masuk antrean saat bill member lunas."
        />
      ) : (
        <div className="panel flex flex-col divide-y divide-outline-variant/10 rounded-xl p-2">
          {data.items.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 p-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={item.type === 'receipt' ? 'tertiary' : 'cyan'}>
                      {TYPE_LABEL[item.type]}
                    </Badge>
                    <Badge tone="outline">{item.channel}</Badge>
                    <Badge
                      tone={
                        item.status === 'sent'
                          ? 'primary'
                          : item.status === 'failed'
                            ? 'error'
                            : 'paused'
                      }
                      dot
                    >
                      {item.status}
                    </Badge>
                    <span className="numeric text-[10px] text-outline">
                      {item.billNumber ?? item.orderNumber ?? item.id.slice(0, 8)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-body-sm font-semibold text-on-surface">
                    {item.subject ?? item.body.slice(0, 80)}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">
                    {item.recipient} · {formatDate(item.createdAt)} {formatClock(item.createdAt)}
                    {item.attempts > 0 ? ` · ${item.attempts} percobaan` : ''}
                  </p>
                  {item.lastError ? (
                    <p className="mt-1 text-[10px] text-error">{item.lastError}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {item.status === 'failed' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => retry(item.id)}
                      loading={busyId === item.id}
                    >
                      <Icon name="refresh" className="text-[16px]" />
                      Retry
                    </Button>
                  ) : null}
                </div>
              </div>
              <details className="group">
                <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-outline hover:text-on-surface">
                  Lihat isi pesan
                </summary>
                <pre
                  className={cn(
                    'mt-1 whitespace-pre-wrap rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-2.5',
                    'font-mono text-[10px] leading-4 text-on-surface-variant',
                  )}
                >
                  {item.body}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
