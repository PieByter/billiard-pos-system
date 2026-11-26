import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getSplitPrintData } from '@/lib/queries/splits';
import { formatClock, formatDate, formatRp } from '@/lib/format';
import { PrintButton } from '@/components/print/print-button';
import { ReceiptDivider, ReceiptLine } from '@/components/print/receipt-parts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cetak Split Bill',
};

export default async function SplitPrintPage({
  params,
}: {
  params: Promise<{ splitId: string }>;
}) {
  await requireStaff(['cashier', 'owner']);
  const { splitId } = await params;
  const result = await getSplitPrintData(splitId);
  if (!result) notFound();
  const { data, split } = result;

  return (
    <div className="min-h-dvh bg-[#d7dbe0] py-6 print:bg-white print:py-0">
      <style>{`@page { size: 80mm auto; margin: 0; }`}</style>
      <div className="no-print mx-auto mb-4 flex w-[302px] items-center justify-between">
        <div className="text-[11px] font-semibold text-slate-700">Preview split bill 80mm</div>
        <PrintButton />
      </div>

      <div className="mx-auto w-[302px] bg-white p-3 font-mono text-[10.5px] leading-[1.45] text-black shadow-xl print:w-[80mm] print:shadow-none">
        <div className="text-center">
          <div className="text-[15px] font-extrabold tracking-widest">CUE &amp; TAP</div>
          <div className="text-[9px] uppercase tracking-[0.16em]">Split Bill</div>
          <div className="mt-1 border-y-2 border-black py-1 text-[13px] font-extrabold tracking-[0.16em]">
            {split.label.toUpperCase()}
          </div>
        </div>

        <ReceiptDivider />
        <ReceiptLine label="Bill" value={data.bill.number} />
        <ReceiptLine label="Meja" value={data.table.code} />
        <ReceiptLine label="Guest" value={data.bill.guestName || 'Walk-in'} />
        <ReceiptLine
          label="Waktu"
          value={`${formatDate(data.serverNow)} ${formatClock(data.serverNow)}`}
        />

        <ReceiptDivider />
        {split.items.map((item) => (
          <div key={item.id} className="flex justify-between gap-2 py-0.5">
            <span>
              {item.qty}× {item.name}
            </span>
            <span className="font-semibold">{formatRp(item.amount)}</span>
          </div>
        ))}

        <ReceiptDivider />
        <ReceiptLine label="Subtotal" value={formatRp(split.subtotal)} />
        {split.discountAmount > 0 ? (
          <ReceiptLine label="Diskon" value={`- ${formatRp(split.discountAmount)}`} />
        ) : null}
        <ReceiptLine label="PB1" value={formatRp(split.taxAmount)} />
        <ReceiptLine label="Service" value={formatRp(split.serviceAmount)} />
        <div className="mt-1 border-t border-black" />
        <div className="flex justify-between py-1 text-[14px] font-extrabold">
          <span>TOTAL</span>
          <span>{formatRp(split.total)}</span>
        </div>
        <div className="border-t border-black" />
        <ReceiptLine label="Status" value={split.status === 'paid' ? 'LUNAS' : 'OPEN'} />
        {split.paidAt ? <ReceiptLine label="Dibayar" value={formatClock(split.paidAt)} /> : null}

        <ReceiptDivider />
        <div className="text-center text-[9px] leading-4">
          <p>Struk split group. Simpan sebagai bukti pembayaran.</p>
          <p className="mt-1 text-[8px] tracking-wider">
            {formatDate(data.serverNow)} {formatClock(data.serverNow)} · POS v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
