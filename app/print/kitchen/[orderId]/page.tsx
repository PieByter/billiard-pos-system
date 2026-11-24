import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getKitchenPrintData } from '@/lib/queries/print';
import { formatClock, formatDate } from '@/lib/format';
import { STATION_LABELS } from '@/lib/constants';
import { PrintButton } from '@/components/print/print-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cetak Tiket Kitchen',
};

const STATIONS = ['all', 'kitchen', 'bar'] as const;

export default async function KitchenPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ station?: string }>;
}) {
  await requireStaff();
  const { orderId } = await params;
  const query = await searchParams;
  const station = STATIONS.includes((query.station ?? 'all') as (typeof STATIONS)[number])
    ? ((query.station ?? 'all') as (typeof STATIONS)[number])
    : 'all';
  const data = await getKitchenPrintData(orderId, station);
  if (!data) notFound();

  const stationLabel = station === 'all' ? 'ALL STATIONS' : STATION_LABELS[station].toUpperCase();

  return (
    <div className="min-h-dvh bg-[#d7dbe0] py-6 print:bg-white print:py-0">
      <style>{`@page { size: 80mm auto; margin: 0; }`}</style>
      <div className="no-print mx-auto mb-4 flex w-[302px] items-center justify-between">
        <div className="text-[11px] font-semibold text-slate-700">Preview tiket {stationLabel}</div>
        <PrintButton label="Print tiket" />
      </div>

      <div className="mx-auto w-[302px] bg-white p-3 font-mono text-[11px] leading-[1.5] text-black shadow-xl print:w-[80mm] print:shadow-none">
        <div className="text-center">
          <div className="text-[16px] font-extrabold tracking-[0.18em]">{stationLabel}</div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider">
            CUE &amp; TAP · KITCHEN COPY
          </div>
        </div>
        <div className="my-2 border-y-2 border-black py-1">
          <div className="flex items-center justify-between text-[18px] font-extrabold">
            <span>MEJA {data.table.code}</span>
            <span className="text-[11px]">{data.order.orderNumber}</span>
          </div>
          <div className="text-[10px]">
            {data.table.zone} · {data.order.source === 'customer_qr' ? 'QR CUSTOMER' : 'KASIR POS'}
          </div>
        </div>

        <div className="mb-1.5 flex justify-between text-[9px]">
          <span>Masuk: {formatClock(data.order.createdAt)}</span>
          <span>{formatDate(data.order.createdAt)}</span>
        </div>
        <div className="mb-2 flex justify-between text-[9px]">
          <span>Print: {formatClock(data.printedAt)}</span>
          <span>Status: {data.order.status}</span>
        </div>

        <div className="border-t border-dashed border-black/50" />

        <div className="py-1">
          {data.items.map((item) => (
            <div key={item.id} className="border-b border-dotted border-black/25 py-1.5 last:border-0">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[15px] font-extrabold leading-tight">
                  {item.qty}× {item.nameSnapshot}
                </span>
                <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider">
                  {STATION_LABELS[item.station]}
                </span>
              </div>
              {item.note ? (
                <div className="mt-1 border-l-2 border-black pl-2 text-[10px] font-semibold">
                  Catatan: {item.note}
                </div>
              ) : null}
              {item.doneAt ? <div className="mt-0.5 text-[8px]">✓ sudah ditandai done</div> : null}
            </div>
          ))}
        </div>

        {data.order.note ? (
          <div className="mt-1 border-2 border-black p-2 text-[10px] font-semibold">
            ORDER NOTE: {data.order.note}
          </div>
        ) : null}

        <div className="my-2 border-t border-dashed border-black/50" />
        <div className="text-center text-[9px]">
          <p className="font-bold">Jangan lupa tandai item selesai di KDS.</p>
          <p>Priority: {data.table.kind === 'billiard' ? 'BILLIARD' : 'CAFE'} · {data.items.length} item</p>
        </div>
      </div>
    </div>
  );
}
