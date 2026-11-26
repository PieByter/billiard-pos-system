'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { applyPromotionAction, removePromotionAction } from '@/app/actions/promotions';
import { Button } from '@/components/ui/button';
import { FormError, Input } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { formatRp } from '@/lib/format';
import type { TableView } from '@/lib/types';

export function PromoDialog({
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
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setError(null);
      setLoading(false);
    }
  }, [open, table?.id]);

  async function apply() {
    if (!bill) return;
    setLoading(true);
    setError(null);
    const result = await applyPromotionAction(bill.id, code);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Promo ${result.data?.code} diterapkan`, {
      description: `Diskon ${formatRp(result.data?.discount ?? 0)} · total ${formatRp(result.data?.total ?? 0)}`,
    });
    onClose();
    onDone?.();
    router.refresh();
  }

  async function remove() {
    if (!bill) return;
    setLoading(true);
    const result = await removePromotionAction(bill.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Promo dilepas');
    onClose();
    onDone?.();
    router.refresh();
  }

  return (
    <Modal
      open={open && Boolean(table)}
      onClose={onClose}
      title="Promo bill"
      subtitle={table ? `Meja ${table.code} · ${bill?.number ?? ''}` : undefined}
      icon="sell"
      size="sm"
      footer={
        <div className="flex flex-col gap-2">
          {bill?.promotionCode && code.trim().length < 3 ? (
            <Button variant="danger" onClick={remove} loading={loading}>
              <Icon name="delete_sweep" className="text-[17px]" />
              Lepas semua promo
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                onClick={apply}
                loading={loading}
                disabled={code.trim().length < 3}
              >
                <Icon name="sell" className="text-[18px]" />
                Terapkan promo
              </Button>
              {bill?.promotionCode ? (
                <Button variant="ghost" onClick={remove} loading={loading}>
                  Lepas semua promo
                </Button>
              ) : null}
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {bill?.promotionCode ? (
          <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-3 text-body-sm">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <Icon name="sell" className="text-[18px]" />
              {bill.promotionCode}
            </div>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              Diskon promo {formatRp(bill.promoDiscountAmount)} sedang aktif. Promo stackable bisa
              ditambah dengan kode lain; promo non-stackable harus dilepas dulu.
            </p>
          </div>
        ) : null}
        <Input
          label="Kode promo"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void apply();
          }}
          placeholder="Contoh: WEEKEND10"
          hint="Huruf besar, tanpa spasi"
        />
        <FormError message={error} />
      </div>
    </Modal>
  );
}
