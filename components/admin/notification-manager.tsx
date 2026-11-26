'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  processNotificationsAction,
  retryNotificationAction,
  runNotificationCronAction,
  saveNotificationTemplateAction,
} from '@/app/actions/notifications';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Select, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { cn, formatClock, formatDate } from '@/lib/format';
import type { NotificationTemplateView, NotificationsData } from '@/lib/types';

const TYPE_LABEL: Record<NotificationsData['items'][number]['type'], string> = {
  receipt: 'E-receipt',
  order_ready: 'Order ready',
  reservation: 'Reservasi',
  reservation_reminder: 'Reminder reservasi',
  test: 'Test',
};

export function NotificationManager({ data }: { data: NotificationsData }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [runningCron, setRunningCron] = useState(false);
  const [templateEditor, setTemplateEditor] = useState<NotificationTemplateView | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateChannel, setTemplateChannel] = useState<'' | 'email' | 'whatsapp' | 'log'>('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateActive, setTemplateActive] = useState(true);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

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

  async function runCron() {
    setRunningCron(true);
    const result = await runNotificationCronAction();
    setRunningCron(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Cron notifikasi selesai', {
      description: `${result.data?.reminders ?? 0} reminder · ${result.data?.sent ?? 0} terkirim · ${result.data?.failed ?? 0} gagal`,
    });
    router.refresh();
  }

  function openTemplate(template: NotificationTemplateView) {
    setTemplateEditor(template);
    setTemplateName(template.name);
    setTemplateChannel(template.channel ?? '');
    setTemplateSubject(template.subject ?? '');
    setTemplateBody(template.body);
    setTemplateActive(template.active);
    setTemplateError(null);
  }

  async function saveTemplate() {
    if (!templateEditor) return;
    setTemplateSaving(true);
    setTemplateError(null);
    const result = await saveNotificationTemplateAction({
      templateKey: templateEditor.templateKey,
      name: templateName,
      channel: templateChannel || null,
      subject: templateSubject || null,
      body: templateBody,
      active: templateActive,
    });
    setTemplateSaving(false);
    if (!result.ok) {
      setTemplateError(result.error);
      return;
    }
    toast.success('Template notifikasi disimpan');
    setTemplateEditor(null);
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
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="md" onClick={runCron} loading={runningCron}>
              <Icon name="schedule" className="text-[18px]" />
              Cron + reminder
            </Button>
            <Button variant="primary" size="md" onClick={processQueue} loading={processing}>
              <Icon name="send" className="text-[18px]" />
              Proses antrean
            </Button>
          </div>
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

      <section className="panel flex flex-col gap-3 rounded-xl p-4">
        <div>
          <h2 className="text-headline-md font-bold text-on-surface">Template pesan</h2>
          <p className="text-body-sm text-on-surface-variant">
            Placeholder: {'{{memberName}}'}, {'{{billNumber}}'}, {'{{tableCode}}'}, {'{{total}}'},{' '}
            {'{{orderNumber}}'}, {'{{guestName}}'}, {'{{reservationCode}}'}, {'{{startAt}}'}.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {data.templates.map((template) => (
            <div
              key={template.templateKey}
              className="rounded-lg border border-outline-variant/20 bg-surface-container p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-body-sm font-bold text-on-surface">{template.name}</span>
                    {template.isDefault ? <Badge tone="outline">default</Badge> : null}
                    <Badge tone={template.active ? 'primary' : 'neutral'}>
                      {template.active ? 'Active' : 'Off'}
                    </Badge>
                    {template.channel ? <Badge tone="cyan">{template.channel}</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] text-on-surface-variant">
                    {template.body}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openTemplate(template)}
                  aria-label={`Edit template ${template.name}`}
                >
                  <Icon name="edit" className="text-[15px]" />
                </Button>
              </div>
            </div>
          ))}
        </div>
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

      <Modal
        open={Boolean(templateEditor)}
        onClose={() => (templateSaving ? undefined : setTemplateEditor(null))}
        title={templateEditor ? `Edit template ${templateEditor.name}` : 'Edit template'}
        subtitle="Channel kosong = pilih otomatis sesuai kredensial & opt-in member."
        icon="notifications"
        size="md"
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setTemplateEditor(null)}
              disabled={templateSaving}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              className="flex-[2]"
              onClick={saveTemplate}
              loading={templateSaving}
            >
              Simpan template
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Nama template"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Select
                label="Channel"
                value={templateChannel}
                onChange={(event) =>
                  setTemplateChannel(event.target.value as '' | 'email' | 'whatsapp' | 'log')
                }
              >
                <option value="">Otomatis</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="log">Log</option>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2.5 text-body-sm text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={templateActive}
                  onChange={(event) => setTemplateActive(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Template aktif
              </label>
            </div>
          </div>
          <Input
            label="Subject"
            value={templateSubject}
            onChange={(event) => setTemplateSubject(event.target.value)}
          />
          <Textarea
            label="Isi pesan"
            rows={8}
            value={templateBody}
            onChange={(event) => setTemplateBody(event.target.value)}
          />
          <FormError message={templateError} />
        </div>
      </Modal>
    </div>
  );
}
