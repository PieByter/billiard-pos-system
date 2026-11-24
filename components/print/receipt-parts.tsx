import { formatRp } from '@/lib/format';

export function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span>{label}</span>
      <span className="whitespace-nowrap font-semibold">{value}</span>
    </div>
  );
}

export function ReceiptDivider() {
  return <div className="my-1.5 border-t border-dashed border-black/50" />;
}

export function ReceiptItem({
  qty,
  name,
  price,
  note,
}: {
  qty: number;
  name: string;
  price: number;
  note?: string | null;
}) {
  return (
    <div className="py-0.5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          {qty}× {name}
        </span>
        <span className="whitespace-nowrap font-semibold">{formatRp(qty * price)}</span>
      </div>
      {note ? <div className="pl-3 text-[9px] italic text-black/70">↳ {note}</div> : null}
    </div>
  );
}
