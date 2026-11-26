import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getShiftReport } from '@/lib/queries/admin';
import { formatClock, formatDate, formatRp } from '@/lib/format';
import { PAY_METHOD_LABELS } from '@/lib/constants';
import { PrintButton } from '@/components/print/print-button';
import { ReceiptDivider, ReceiptLine } from '@/components/print/receipt-parts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cetak Laporan Shift',
};

export default async function ShiftPrintPage({
  params,
}: {
  params: Promise<{ shiftId: string }>;
}) {
  await requireStaff(['cashier', 'owner']);
  const { shiftId } = await params;
  const data = await getShiftReport(shiftId);
  if (!data) notFound();

  const interim = data.shift.status === 'open';
  const closedAt = data.shift.closedAt ?? data.serverNow;
  const difference = data.shift.actualCash !== null ? data.shift.actualCash - data.expectedCash : null;

  return (
    <div className="min-h-dvh bg-[#d7dbe0] py-6 print:bg-white print:py-0">
      <style>{`@page { size: 80mm auto; margin: 0; }`}</style>
      <div className="no-print mx-auto mb-4 flex w-[302px] items-center justify-between">
        <div className="text-[11px] font-semibold text-slate-700">
          Preview {interim ? 'X-report' : 'Z-report'}
        </div>
        <PrintButton label={interim ? 'Print X-report' : 'Print Z-report'} />
      </div>

      <div className="mx-auto w-[302px] bg-white p-3 font-mono text-[10px] leading-[1.45] text-black shadow-xl print:w-[80mm] print:shadow-none">
        <div className="text-center">
          <div className="text-[15px] font-extrabold uppercase tracking-[0.16em]">
            {data.venueName}
          </div>
          <div className="text-[9px] uppercase tracking-[0.16em]">
            {data.venueAddress || 'Billiard Hall & Lounge'}
          </div>
          <div className="mt-1 border-y-2 border-black py-1 text-[13px] font-extrabold tracking-[0.2em]">
            {interim ? 'X-REPORT' : 'Z-REPORT'}
          </div>
        </div>

        <ReceiptLine label="Shift" value={data.shift.id.slice(0, 8).toUpperCase()} />
        <ReceiptLine label="Kasir" value={data.staffName} />
        <ReceiptLine label="Buka" value={`${formatDate(data.shift.openedAt)} ${formatClock(data.shift.openedAt)}`} />
        <ReceiptLine
          label={interim ? 'Cetak' : 'Tutup'}
          value={`${formatDate(closedAt)} ${formatClock(closedAt)}`}
        />

        <ReceiptDivider />

        <div className="flex justify-between font-bold">
          <span>Modal awal</span>
          <span>{formatRp(data.shift.openingCash)}</span>
        </div>
        <div className="flex justify-between">
          <span>Penjualan cash</span>
          <span>+ {formatRp(data.cashRevenue)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-black pt-1 font-bold">
          <span>Expected cash</span>
          <span>{formatRp(data.expectedCash)}</span>
        </div>
        {data.shift.actualCash !== null ? (
          <>
            <div className="flex justify-between">
              <span>Actual cash</span>
              <span>{formatRp(data.shift.actualCash)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Selisih</span>
              <span>
                {(difference ?? 0) === 0
                  ? 'Rp 0'
                  : `${(difference ?? 0) > 0 ? '+' : '-'}${formatRp(Math.abs(difference ?? 0))}`}
              </span>
            </div>
          </>
        ) : (
          <div className="mt-1 border border-black py-0.5 text-center text-[9px] font-bold tracking-wider">
            INTERIM — BELUM DITUTUP
          </div>
        )}

        <ReceiptDivider />

        <div className="font-bold uppercase tracking-wider">Rekap metode bayar</div>
        {data.totals.map((total) => (
          <ReceiptLine
            key={total.method}
            label={`${PAY_METHOD_LABELS[total.method]} (${total.count}x)`}
            value={formatRp(total.amount)}
          />
        ))}
        {data.refundTotal > 0 ? (
          <div className="mt-1 flex justify-between text-[10px]">
            <span>Refund ({data.refunds.length}x)</span>
            <span>− {formatRp(data.refundTotal)}</span>
          </div>
        ) : null}
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-[12px] font-extrabold">
          <span>TOTAL OMZET NETO</span>
          <span>{formatRp(data.totalRevenue)}</span>
        </div>

        <ReceiptDivider />

        <div className="font-bold uppercase tracking-wider">Transaksi ({data.payments.length})</div>
        {data.payments.length === 0 ? (
          <div className="py-1 text-center text-[9px]">Belum ada pembayaran.</div>
        ) : (
          data.payments.slice(0, 40).map((payment) => (
            <div key={payment.id} className="border-b border-dotted border-black/20 py-0.5">
              <div className="flex justify-between">
                <span>
                  {payment.tableCode} · {payment.billNumber.slice(-8)}
                </span>
                <span className="font-semibold">{formatRp(payment.amount)}</span>
              </div>
              <div className="flex justify-between text-[8px] text-black/60">
                <span>{PAY_METHOD_LABELS[payment.method]}</span>
                <span>{formatClock(payment.createdAt)}</span>
              </div>
            </div>
          ))
        )}
        {data.payments.length > 40 ? (
          <div className="py-1 text-center text-[8px]">
            +{data.payments.length - 40} transaksi lainnya di sistem
          </div>
        ) : null}

        {data.refunds.length > 0 ? (
          <>
            <ReceiptDivider />
            <div className="font-bold uppercase tracking-wider">Refund ({data.refunds.length})</div>
            {data.refunds.slice(0, 20).map((refund) => (
              <div key={refund.id} className="border-b border-dotted border-black/20 py-0.5">
                <div className="flex justify-between">
                  <span>
                    {refund.tableCode} · {refund.billNumber.slice(-8)}
                  </span>
                  <span className="font-semibold">− {formatRp(refund.amount)}</span>
                </div>
                <div className="flex justify-between text-[8px] text-black/60">
                  <span>{PAY_METHOD_LABELS[refund.method]}</span>
                  <span>{formatClock(refund.createdAt)}</span>
                </div>
              </div>
            ))}
          </>
        ) : null}

        <ReceiptDivider />

        <div className="text-[9px]">
          <div className="font-bold uppercase tracking-wider">Catatan serah terima</div>
          <p className="mt-0.5 whitespace-pre-wrap">{data.shift.notes || '—'}</p>
        </div>

        <div className="mt-4 flex justify-between gap-3 text-center text-[9px]">
          <div className="flex-1 border-t border-black pt-1">Kasir</div>
          <div className="flex-1 border-t border-black pt-1">Supervisor</div>
        </div>

        <div className="mt-3 text-center text-[8px]">
          <p>{formatDate(data.serverNow)} {formatClock(data.serverNow)} · POS v1.0</p>
          <p>Audit ledger append-only · Cue &amp; Tap</p>
        </div>
      </div>
    </div>
  );
}
