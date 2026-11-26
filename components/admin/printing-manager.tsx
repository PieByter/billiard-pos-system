'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  queueTestPrintAction,
  retryPrintJobAction,
} from '@/app/actions/printing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { formatClock, formatDate } from '@/lib/format';
import type { PrintQueueData } from '@/lib/types';

export function PrintingManager({ data }: { data: PrintQueueData }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function retry(id: string) {
    setBusyId(id);
    const result = await retryPrintJobAction(id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Job dikembalikan ke antrean');
    router.refresh();
  }

  async function testPrint() {
    setTesting(true);
    const result = await queueTestPrintAction();
    setTesting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Test print masuk antrean', {
      description: 'Jalankan print agent untuk memproses.',
    });
    router.refresh();
  }

  const stats = {
    queued: data.jobs.filter((job) => job.status === 'queued').length,
    processing: data.jobs.filter((job) => job.status === 'processing').length,
    printed: data.jobs.filter((job) => job.status === 'printed').length,
    failed: data.jobs.filter((job) => job.status === 'failed').length,
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Hardware bridge"
        title="Printer & Antrean ESC/POS"
        description="Job print dari kasir masuk antrean. Print agent lokal mengambil job, mencetak, lalu melaporkan hasil."
        actions={
          <Button variant="primary" size="md" onClick={testPrint} loading={testing}>
            <Icon name="print" className="text-[18px]" />
            Test print
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Queued" value={stats.queued} icon="schedule" tone="tertiary" />
        <StatCard label="Processing" value={stats.processing} icon="sync" tone="cyan" />
        <StatCard label="Printed" value={stats.printed} icon="check_circle" tone="primary" />
        <StatCard label="Failed" value={stats.failed} icon="error" tone="error" />
      </section>

      <section className="panel flex flex-col gap-2 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-body-md font-bold text-on-surface">Konfigurasi print agent</h2>
          <Badge tone={data.agentConfigured ? 'primary' : 'paused'} dot>
            {data.agentConfigured ? 'Token aktif' : 'Token belum diset'}
          </Badge>
        </div>
        <p className="text-body-sm text-on-surface-variant">
          Set <code className="rounded bg-surface-container px-1">PRINT_AGENT_TOKEN</code> di server,
          lalu jalankan agent lokal yang memanggil endpoint berikut setiap beberapa detik:
        </p>
        <pre className="overflow-x-auto rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3 font-mono text-[10px] text-on-surface-variant">
{`GET  /api/print/jobs?agent=printer-1
     Authorization: Bearer $PRINT_AGENT_TOKEN

POST /api/print/jobs
     { "id": "...", "ok": true }
     { "id": "...", "ok": false, "error": "kertas habis" }`}
        </pre>
        <p className="text-[10px] text-outline">
          Payload berisi teks 42 kolom. Agent dapat mengirim ke printer RAW spooler, network
          port 9100, atau WebUSB. Tombol WebUSB tersedia di halaman cetak bill (Chrome/Edge).
        </p>
      </section>

      {data.jobs.length === 0 ? (
        <EmptyState
          icon="print"
          title="Belum ada job print"
          description="Job struk dan kitchen ticket muncul otomatis setelah pembayaran/order."
        />
      ) : (
        <section className="panel flex flex-col divide-y divide-outline-variant/10 rounded-xl p-2">
          {data.jobs.map((job) => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={job.type === 'kitchen' ? 'tertiary' : 'cyan'}>{job.type}</Badge>
                  <Badge
                    tone={
                      job.status === 'printed'
                        ? 'primary'
                        : job.status === 'failed'
                          ? 'error'
                          : job.status === 'processing'
                            ? 'cyan'
                            : 'paused'
                    }
                    dot
                  >
                    {job.status}
                  </Badge>
                  <span className="text-body-sm font-semibold text-on-surface">{job.title}</span>
                </div>
                <p className="text-[10px] text-on-surface-variant">
                  {formatDate(job.createdAt)} {formatClock(job.createdAt)} · {job.attempts} percobaan
                  {job.printedAt ? ` · printed ${formatClock(job.printedAt)}` : ''}
                </p>
                {job.lastError ? <p className="text-[10px] text-error">{job.lastError}</p> : null}
              </div>
              {job.status === 'failed' || job.status === 'printed' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => retry(job.id)}
                  loading={busyId === job.id}
                >
                  <Icon name="refresh" className="text-[15px]" />
                  Retry
                </Button>
              ) : null}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
