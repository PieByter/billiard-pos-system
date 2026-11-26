'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { applyPenaltyAction } from '@/app/actions/penalties';
import { Button } from '@/components/ui/button';
import { FormError, Label, Select, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { MoneyInput } from '@/components/ui/money-input';
import { formatRp } from '@/lib/format';
import type { TableView } from '@/lib/types';

const TYPES = [
  { value: 'damage', label: 'Kerusakan' },
  { value: 'loss', label: 'Kehilangan' },
  { value: 'overtime', label: 'Overtime' },
  { value: 'no_show', label: 'No-show' },
  { value: 'cancellation', label: 'Pembatalan' },
  { value: 'other', label: 'Lainnya' },
] as const;

export function PenaltyDialog({
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
  const bill = table?.bill ?? null;
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('damage');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType('damage');
      setAmount(0);
      setReason('');
      setError(null);
      setLoading(false);
    }
  }, [open, table?.id]);

  async function submit() {
    if (!bill) return;
    setLoading(true);
    setError(null);
    const result = await applyPenaltyAction(bill.id, {
      type,
      amount,
      reason,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Denda ditambahkan ke bill', {
      description: `${formatRp(result.data?.amount ?? 0)} · total ${formatRp(result.data?.total ?? 0)}`,
    });
    onClose();
    onDone?.();
    router.refresh();
  }

  return (
    <Modal
      open={open && Boolean(table)}
      onClose={onClose}
      title="Tambah denda"
      subtitle={table ? `Meja ${table.code} · ${bill?.number ?? ''}` : undefined}
      icon="gavel"
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            variant="danger"
            className="flex-[2]"
            onClick={submit}
            loading={loading}
            disabled={amount <= 0 || reason.trim().length < 3}
          >
            <Icon name="gavel" className="text-[18px]" />
            Terapkan denda
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {bill && bill.penaltyAmount > 0 ? (
          <div className="rounded-lg border border-error/25 bg-error/[0.06] p-2.5 text-[11px] text-error">
            Denda saat ini: {formatRp(bill.penaltyAmount)}
          </div>
        ) : null}
        <div>
          <Label>Jenis denda</Label>
          <Select className="mt-1.5" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
            {TYPES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Nominal</Label>
          <div className="mt-1.5">
            <MoneyInput value={amount} onChange={setAmount} />
          </div>
        </div>
        <Textarea
          label="Alasan / bukti"
          rows={2}
          maxLength={240}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Contoh: cue patah, bola hilang, overtime 30 menit…"
        />
        <p className="text-[10px] text-on-surface-variant">
          Denda ditambahkan ke total bill dan tidak dikenakan PB1/service. Hanya owner.
        </p>
        <FormError message={error} />
      </div>
    </Modal>
  );
}
