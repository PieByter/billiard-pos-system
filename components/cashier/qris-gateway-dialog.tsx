'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  createQrisIntentAction,
  getQrisIntentStatusAction,
  simulateMockIntentPaidAction,
} from '@/app/actions/payment-intents';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { formatClock, formatRp } from '@/lib/format';
import type { TableView } from '@/lib/types';

type Intent = {
  intentId: string;
  amount: number;
  qrDataUrl: string;
  expiresAt: string;
  providerLabel: string;
  mock: boolean;
};

export function QrisGatewayDialog({
  open,
  table,
  onClose,
  onDone,
}: {
  open: boolean;
  table: TableView | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [simulating, setSimulating] = useState(false);

  const billId = table?.bill?.id ?? null;

  useEffect(() => {
    if (!open || !billId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setIntent(null);
    setStatus('pending');
    void createQrisIntentAction(billId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIntent(result.data ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, billId]);

  useEffect(() => {
    if (!open || !intent || status !== 'pending') return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      const result = await getQrisIntentStatusAction(intent.intentId);
      if (cancelled || !result.ok || !result.data) return;
      setStatus(result.data.status);
      if (result.data.status === 'paid') {
        window.clearInterval(timer);
        toast.success('QRIS dibayar', {
          description: `Bill ${table?.bill?.number ?? ''} · ${formatRp(result.data.amount)}`,
        });
        onDone?.();
        onClose();
        router.refresh();
      }
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, intent, status, table?.bill?.number, onDone, onClose, router]);

  async function simulate() {
    if (!intent) return;
    setSimulating(true);
    const result = await simulateMockIntentPaidAction(intent.intentId);
    setSimulating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus('paid');
    toast.success('Simulasi QRIS lunas');
    onDone?.();
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open && Boolean(table)}
      onClose={onClose}
      title="QRIS dinamis"
      subtitle={table ? `Meja ${table.code} · ${table.bill?.number ?? ''}` : undefined}
      icon="qr_code_2"
      size="sm"
      footer={
        <div className="flex flex-col gap-2">
          {intent?.mock ? (
            <Button variant="cyan" onClick={simulate} loading={simulating}>
              <Icon name="science" className="text-[18px]" />
              Simulasikan pembayaran
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={simulating}>
            Tutup
          </Button>
          <FormError message={error} />
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {loading ? (
          <div className="flex h-56 w-56 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container">
            <span className="material-symbols-outlined animate-spin text-[32px] text-primary">
              progress_activity
            </span>
          </div>
        ) : intent ? (
          <>
            <div className="rounded-2xl border border-outline-variant/30 bg-white p-3 shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={intent.qrDataUrl} alt="QRIS" className="h-56 w-56" />
            </div>
            <div>
              <div className="numeric text-numeric-lg font-bold text-primary">
                {formatRp(intent.amount)}
              </div>
              <p className="text-body-sm text-on-surface-variant">
                {intent.providerLabel} · berlaku sampai {formatClock(intent.expiresAt)}
              </p>
              <p className="mt-1 text-[10px] text-outline">
                Status: {status.toUpperCase()} · halaman ini cek otomatis tiap 4 detik
              </p>
            </div>
            <div className="rounded-lg border border-secondary/20 bg-secondary/[0.05] p-2.5 text-[10px] leading-4 text-on-surface-variant">
              Minta tamu scan QR ini. Setelah gateway mengirim settlement, bill otomatis lunas dan
              meja masuk cleaning.
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-tertiary/25 bg-tertiary/[0.06] p-3 text-body-sm text-on-surface-variant">
            QRIS dinamis belum tersedia. Gunakan QRIS manual dari dialog pembayaran, atau isi
            kredensial payment gateway.
          </div>
        )}
      </div>
    </Modal>
  );
}
