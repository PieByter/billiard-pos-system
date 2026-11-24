import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { getTablesAdminData } from '@/lib/queries/admin';
import { PrintButton } from '@/components/print/print-button';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cetak QR Meja',
};

export default async function QrPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>;
}) {
  await requireStaff(['cashier', 'owner']);
  const params = await searchParams;
  const data = await getTablesAdminData();
  const tables = params.table
    ? data.tables.filter((table) => table.id === params.table)
    : data.tables;

  return (
    <div className="min-h-dvh bg-[#d7dbe0] py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 10mm; }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-4xl items-center justify-between px-4">
        <div>
          <div className="text-sm font-bold text-slate-800">Kartu QR meja</div>
          <div className="text-[11px] text-slate-600">
            {tables.length} kartu · potong dan letakkan di meja
          </div>
        </div>
        <PrintButton label="Print kartu QR" />
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 px-4 sm:grid-cols-2 print:grid-cols-2 print:gap-6">
        {tables.map((table) => (
          <div
            key={table.id}
            className="break-inside-avoid rounded-2xl border-2 border-slate-900 bg-white p-5 text-slate-900"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Scan untuk menu &amp; order
                </div>
                <div className="mt-1 text-3xl font-extrabold tracking-tight">
                  MEJA {table.code}
                </div>
                <div className="text-[11px] font-semibold text-slate-600">
                  {table.zone || 'Cue & Tap Lounge'} · {table.kind === 'billiard' ? 'Billiard' : 'Cafe'}
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-slate-900 text-[18px] font-extrabold">
                C&amp;T
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={table.qrDataUrl} alt={`QR ${table.code}`} className="h-48 w-48" />
            </div>

            <div className="mt-4 text-center">
              <div className="text-[13px] font-bold">Cue &amp; Tap Billiard Hall &amp; Lounge</div>
              <div className="mt-1 text-[10px] leading-4 text-slate-600">
                Buka kamera HP → scan QR → pilih menu → kirim pesanan.
                <br />
                {table.allowSelfOrder
                  ? 'Self-order aktif. Pesanan dikonfirmasi kasir.'
                  : 'Untuk meja ini, pesanan melalui waiter / kasir.'}
              </div>
              <div className="mt-2 font-mono text-[8px] text-slate-400">
                /t/{table.qrToken}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
