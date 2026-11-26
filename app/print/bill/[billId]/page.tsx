import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getBillPrintData } from '@/lib/queries/print';
import { formatClock, formatDate, formatRp } from '@/lib/format';
import { PAY_METHOD_LABELS } from '@/lib/constants';
import { PrintButton } from '@/components/print/print-button';
import { ReceiptDivider, ReceiptItem, ReceiptLine } from '@/components/print/receipt-parts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cetak Bill',
};

export default async function BillPrintPage({
  params,
}: {
  params: Promise<{ billId: string }>;
}) {
  await requireStaff(['cashier', 'owner']);
  const { billId } = await params;
  const data = await getBillPrintData(billId);
  if (!data) notFound();

  const { bill, table, payments, paid, refunded, refunds, venue } = data;
  const discount = bill.discountAmount;
  const isPaid = bill.status === 'paid';
  const isVoid = bill.status === 'void';
  const remaining = Math.max(0, bill.total - paid);

  return (
    <div className="min-h-dvh bg-[#d7dbe0] py-6 print:bg-white print:py-0">
      <style>{`@page { size: 80mm auto; margin: 0; }`}</style>
      <div className="no-print mx-auto mb-4 flex w-[302px] items-center justify-between">
        <div className="text-[11px] font-semibold text-slate-700">Preview struk 80mm</div>
        <PrintButton />
      </div>

      <div className="mx-auto w-[302px] bg-white p-3 font-mono text-[10.5px] leading-[1.45] text-black shadow-xl print:w-[80mm] print:shadow-none">
        <div className="text-center">
          <div className="text-[15px] font-extrabold uppercase tracking-widest">
            {venue.venueName}
          </div>
          <div className="text-[9px] uppercase tracking-[0.16em]">Billiard Hall &amp; Lounge</div>
          {venue.address ? <div className="mt-1 text-[9px]">{venue.address}</div> : null}
        </div>

        <ReceiptDivider />

        <ReceiptLine label="Bill" value={bill.number} />
        <ReceiptLine label="Meja" value={`${table.code} ${table.zone ? `· ${table.zone}` : ''}`} />
        <ReceiptLine label="Guest" value={bill.guestName || 'Walk-in'} />
        <ReceiptLine label="Buka" value={`${formatDate(bill.openedAt)} ${formatClock(bill.openedAt)}`} />
        <ReceiptLine label="Kasir" value={data.openedByName ?? '—'} />

        {isVoid ? (
          <div className="my-2 border-2 border-black py-1 text-center text-[13px] font-extrabold tracking-[0.2em]">
            VOID
          </div>
        ) : !isPaid ? (
          <div className="my-2 border border-black py-1 text-center text-[10px] font-bold tracking-[0.14em]">
            SEMENTARA · BELUM DIBAYAR
          </div>
        ) : null}

        <ReceiptDivider />

        {bill.sessions.map((session, index) => (
          <div key={session.id} className="py-0.5">
            <div className="flex justify-between gap-2">
              <span className="font-semibold">Sesi Billiard #{index + 1}</span>
              <span className="font-semibold">{formatRp(session.amount ?? session.estimate)}</span>
            </div>
            <div className="text-[9px] text-black/70">
              {formatRp(session.ratePerHour)}/jam · {formatClock(session.startedAt)}
              {session.endedAt ? ` → ${formatClock(session.endedAt)}` : ' → berjalan'}
            </div>
            <div className="text-[9px] text-black/70">
              Min {session.minMinutes}m · increment {session.incrementMinutes}m · pause{' '}
              {Math.round(session.pausedSeconds / 60)}m
            </div>
          </div>
        ))}

        {bill.orders.length > 0 ? <ReceiptDivider /> : null}

        {bill.orders.map((order) => (
          <div key={order.id} className="mb-1.5">
            <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
              <span>{order.number}</span>
              <span>{order.status}</span>
            </div>
            {order.items.map((item) => (
              <ReceiptItem
                key={item.id}
                qty={item.qty}
                name={item.name}
                price={item.price}
                note={item.note}
              />
            ))}
          </div>
        ))}

        <ReceiptDivider />

        <ReceiptLine label="Subtotal" value={formatRp(bill.subtotal)} />
        {discount > 0 ? <ReceiptLine label="Diskon manual" value={`- ${formatRp(discount)}`} /> : null}
        {bill.memberDiscountAmount > 0 ? (
          <ReceiptLine label="Member tier" value={`- ${formatRp(bill.memberDiscountAmount)}`} />
        ) : null}
        {bill.promoDiscountAmount > 0 ? (
          <ReceiptLine
            label={`Promo ${bill.promotionCode ?? ''}`}
            value={`- ${formatRp(bill.promoDiscountAmount)}`}
          />
        ) : null}
        {bill.penaltyAmount > 0 ? (
          <ReceiptLine label="Denda" value={formatRp(bill.penaltyAmount)} />
        ) : null}
        <ReceiptLine
          label={`PB1 ${(bill.taxRateBps / 100).toFixed(0)}%`}
          value={formatRp(bill.taxAmount)}
        />
        <ReceiptLine
          label={`Service ${(bill.serviceRateBps / 100).toFixed(0)}%`}
          value={formatRp(bill.serviceAmount)}
        />
        <div className="mt-1 border-t border-black" />
        <div className="flex justify-between py-1 text-[14px] font-extrabold">
          <span>TOTAL</span>
          <span>{formatRp(bill.total)}</span>
        </div>
        <div className="border-t border-black" />

        {isPaid ? (
          <>
            <div className="mt-1.5 text-[9px] font-bold uppercase tracking-wider">Pembayaran</div>
            {payments.map((payment) => (
              <ReceiptLine
                key={payment.id}
                label={`${PAY_METHOD_LABELS[payment.method] ?? payment.method}${
                  payment.staffName ? ` · ${payment.staffName}` : ''
                }`}
                value={formatRp(payment.amount)}
              />
            ))}
            <ReceiptLine label="Dibayar" value={formatRp(paid)} />
            {refunded > 0 ? (
              <>
                <ReceiptLine label="Refund" value={`- ${formatRp(refunded)}`} />
                <ReceiptLine label="Net diterima" value={formatRp(paid - refunded)} />
              </>
            ) : null}
            {remaining > 0 ? <ReceiptLine label="Sisa" value={formatRp(remaining)} /> : null}
            <ReceiptLine
              label="Status"
              value={refunded >= bill.total ? 'LUNAS · FULL REFUND' : 'LUNAS'}
            />
            {refunds.map((refund) => (
              <div key={refund.id} className="mt-1 border-t border-black/30 pt-1 text-[8px] leading-3 text-black/70">
                <div className="flex justify-between">
                  <span>Refund {refund.category}</span>
                  <span>- {formatRp(refund.amount)}</span>
                </div>
                <div>
                  {formatClock(refund.createdAt)} · {refund.reason}
                  {refund.restocked ? ' · stok kembali' : ''}
                </div>
              </div>
            ))}
          </>
        ) : (
          <ReceiptLine label="Status" value={isVoid ? 'VOID' : 'OPEN — BELUM LUNAS'} />
        )}

        <ReceiptDivider />

        <div className="text-center text-[9px] leading-4">
          <p className="font-semibold">{venue.receiptFooter}</p>
          <p>Simpan struk ini sebagai bukti pembayaran.</p>
          <p className="mt-1">PB1 &amp; service charge sesuai ketentuan venue.</p>
          <p className="mt-1 text-[8px] tracking-wider">
            {formatDate(data.printedAt)} {formatClock(data.printedAt)} · POS v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
