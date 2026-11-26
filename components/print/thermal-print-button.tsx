'use client';

import { useState } from 'react';
import {
  completePrintJobAction,
  getPrintJobPayloadAction,
  reprintBillAction,
} from '@/app/actions/printing';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { buildEscPosDocument } from '@/lib/print/escpos';
import { printViaWebUsb } from '@/lib/print/webusb';

type Payload = {
  title?: string;
  subtitle?: string | null;
  lines?: string[];
  footer?: string | null;
  width?: number;
};

export function ThermalPrintButton({ billId }: { billId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function printUsb() {
    setLoading(true);
    setMessage(null);
    try {
      const queued = await reprintBillAction(billId);
      if (!queued.ok) throw new Error(queued.error);
      const payloadResult = await getPrintJobPayloadAction(queued.data!.jobId);
      if (!payloadResult.ok) throw new Error(payloadResult.error);
      const payload = payloadResult.data!.payload as Payload;
      const bytes = buildEscPosDocument({
        title: payload.title ?? 'CUE & TAP',
        subtitle: payload.subtitle ?? undefined,
        lines: payload.lines ?? [],
        footer: payload.footer ?? undefined,
        width: payload.width ?? 42,
      });
      await printViaWebUsb(bytes);
      await completePrintJobAction(queued.data!.jobId, true);
      setMessage('Tercetak via WebUSB');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal cetak WebUSB');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="md" onClick={printUsb} loading={loading}>
        <Icon name="usb" className="text-[18px]" />
        Cetak USB
      </Button>
      {message ? <span className="text-[10px] text-slate-600">{message}</span> : null}
    </div>
  );
}
