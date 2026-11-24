'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { saveRateAction, toggleRateAction } from '@/app/actions/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { MoneyInput } from '@/components/ui/money-input';
import { Switch } from '@/components/ui/switch';
import { formatRp } from '@/lib/format';
import type { AdminData, RateView } from '@/lib/types';

type RateRow = RateView & { tableCount: number };

export function RatesMaster({ rates }: { rates: RateRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<RateRow | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(rate: RateRow) {
    setBusyId(rate.id);
    const result = await toggleRateAction(rate.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Tarif ${rate.name} ${result.data?.active ? 'diaktifkan' : 'dinonaktifkan'}`);
    router.refresh();
  }

  return (
    <section className="panel flex flex-col gap-3 rounded-xl p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high text-secondary">
            <Icon name="price_change" className="text-[22px]" />
          </span>
          <div>
            <h2 className="text-headline-md font-bold text-on-surface">Master tarif billiard</h2>
            <p className="text-body-sm text-on-surface-variant">
              Snapshot tarif mengunci harga saat sesi dimulai.
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
          <Icon name="add_circle" className="text-[17px] text-secondary" />
          Tambah tarif
        </Button>
      </header>

      <div className="flex items-start gap-2 rounded-lg border border-secondary/20 bg-secondary/[0.06] p-3">
        <Icon name="info" className="mt-0.5 text-[20px] text-secondary" />
        <div>
          <p className="text-body-sm font-bold text-secondary">Snapshot rate enforced</p>
          <p className="mt-0.5 text-[11px] leading-4 text-on-surface-variant">
            Perubahan tarif tidak mengubah sesi yang sedang berjalan. Session menyimpan
            price/hour, min duration, dan increment saat Start ditekan.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-outline-variant/20">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="bg-surface-container-high text-label-badge uppercase tracking-[0.08em] text-on-surface-variant">
              <th className="px-3 py-2.5 font-bold">Skema</th>
              <th className="px-3 py-2.5 font-bold">Tarif / jam</th>
              <th className="px-3 py-2.5 font-bold">Min. durasi</th>
              <th className="px-3 py-2.5 font-bold">Increment</th>
              <th className="px-3 py-2.5 font-bold">Berlaku</th>
              <th className="px-3 py-2.5 font-bold">Status</th>
              <th className="px-3 py-2.5 text-right font-bold">Opsi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/15 text-body-sm">
            {rates.map((rate) => (
              <tr key={rate.id} className="transition-colors hover:bg-surface-container-high/25">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Icon
                      name={rate.tableCount > 0 ? 'sports_bar' : 'price_change'}
                      className="text-[18px] text-tertiary"
                    />
                    <div>
                      <p className="font-bold text-on-surface">{rate.name}</p>
                      <p className="max-w-[260px] truncate text-[10px] text-outline">
                        {rate.description || 'Tanpa deskripsi'}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="numeric font-bold text-primary">
                    {formatRp(rate.pricePerHour)}
                  </span>
                  <span className="text-[10px] text-on-surface-variant"> /jam</span>
                </td>
                <td className="numeric px-3 py-3 text-on-surface">{rate.minMinutes} mnt</td>
                <td className="numeric px-3 py-3 text-on-surface">{rate.incrementMinutes} mnt</td>
                <td className="px-3 py-3">
                  <Badge tone="outline">{rate.tableCount} meja</Badge>
                </td>
                <td className="px-3 py-3">
                  <Badge tone={rate.active ? 'primary' : 'neutral'} dot>
                    {rate.active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(rate)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-secondary"
                      title="Edit tarif"
                    >
                      <Icon name="edit" className="text-[17px]" />
                    </button>
                    <button
                      type="button"
                      disabled={busyId === rate.id}
                      onClick={() => toggle(rate)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary disabled:opacity-50"
                      title={rate.active ? 'Nonaktifkan' : 'Aktifkan'}
                    >
                      <Icon
                        name={busyId === rate.id ? 'progress_activity' : rate.active ? 'toggle_on' : 'toggle_off'}
                        className="text-[22px]"
                      />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RateDialog
        rate={editing === 'new' ? null : editing}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

function RateDialog({
  rate,
  open,
  onClose,
}: {
  rate: RateRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(50_000);
  const [minMinutes, setMinMinutes] = useState(30);
  const [incrementMinutes, setIncrementMinutes] = useState(15);
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(99);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(rate?.name ?? '');
    setDescription(rate?.description ?? '');
    setPrice(rate?.pricePerHour ?? 50_000);
    setMinMinutes(rate?.minMinutes ?? 30);
    setIncrementMinutes(rate?.incrementMinutes ?? 15);
    setActive(rate?.active ?? true);
    setSortOrder(rate?.sortOrder ?? 99);
    setError(null);
    setLoading(false);
  }, [open, rate]);

  async function submit() {
    setLoading(true);
    setError(null);
    const result = await saveRateAction({
      id: rate?.id,
      name,
      description,
      pricePerHour: price,
      minMinutes,
      incrementMinutes,
      active,
      sortOrder,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(rate ? 'Tarif diperbarui' : 'Tarif baru dibuat');
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rate ? `Edit tarif · ${rate.name}` : 'Tambah tarif billiard'}
      subtitle="Tarif baru berlaku untuk sesi yang dimulai setelah disimpan."
      icon="price_change"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit} loading={loading} disabled={!name.trim()}>
            Simpan tarif
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Nama skema"
          placeholder="Contoh: VIP 9ft Prime Time"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Textarea
          label="Deskripsi"
          rows={2}
          placeholder="Catatan internal, jam berlaku, atau fasilitas."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div>
          <Label>Tarif per jam</Label>
          <div className="mt-1.5">
            <MoneyInput value={price} onChange={setPrice} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Minimal durasi (menit)"
            type="number"
            min={1}
            max={600}
            value={minMinutes}
            onChange={(event) => setMinMinutes(Number(event.target.value))}
          />
          <Input
            label="Increment (menit)"
            type="number"
            min={1}
            max={600}
            value={incrementMinutes}
            onChange={(event) => setIncrementMinutes(Number(event.target.value))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Urutan tampil"
            type="number"
            min={0}
            max={999}
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value))}
          />
          <div className="flex items-end pb-1.5">
            <Switch
              label="Tarif aktif"
              description="Nonaktif menyembunyikan dari start sesi"
              checked={active}
              onChange={setActive}
            />
          </div>
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  );
}
