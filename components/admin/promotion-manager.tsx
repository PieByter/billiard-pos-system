'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  savePromotionAction,
  togglePromotionAction,
} from '@/app/actions/promotions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label, Select, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { formatDate, formatRp } from '@/lib/format';
import type { PromotionView, PromotionsAdminData } from '@/lib/types';

type Editor = PromotionView | 'new' | null;

function toDateTimeLocal(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function PromotionManager({ data }: { data: PromotionsAdminData }) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState(1000);
  const [minSpend, setMinSpend] = useState(0);
  const [maxDiscount, setMaxDiscount] = useState(0);
  const [maxUses, setMaxUses] = useState(0);
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [appliesTo, setAppliesTo] = useState<'all' | 'billiard' | 'fnb'>('all');
  const [memberOnly, setMemberOnly] = useState(false);
  const [active, setActive] = useState(true);

  const stats = useMemo(
    () => ({
      total: data.promotions.length,
      active: data.promotions.filter((promo) => promo.active).length,
      uses: data.promotions.reduce((sum, promo) => sum + promo.usesCount, 0),
    }),
    [data.promotions],
  );

  function openNew() {
    setEditor('new');
    setCode('');
    setName('');
    setDescription('');
    setType('percent');
    setValue(1000);
    setMinSpend(0);
    setMaxDiscount(0);
    setMaxUses(0);
    setValidFrom('');
    setValidTo('');
    setAppliesTo('all');
    setMemberOnly(false);
    setActive(true);
    setError(null);
  }

  function openEdit(promo: PromotionView) {
    setEditor(promo);
    setCode(promo.code);
    setName(promo.name);
    setDescription(promo.description ?? '');
    setType(promo.type);
    setValue(promo.value);
    setMinSpend(promo.minSpend);
    setMaxDiscount(promo.maxDiscount ?? 0);
    setMaxUses(promo.maxUses ?? 0);
    setValidFrom(toDateTimeLocal(promo.validFrom));
    setValidTo(toDateTimeLocal(promo.validTo));
    setAppliesTo(promo.appliesTo);
    setMemberOnly(promo.memberOnly);
    setActive(promo.active);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await savePromotionAction({
      id: editor === 'new' || editor === null ? undefined : editor.id,
      code,
      name,
      description: description || null,
      type,
      value,
      minSpend,
      maxDiscount: maxDiscount || null,
      maxUses: maxUses || null,
      validFrom: validFrom ? new Date(validFrom).toISOString() : null,
      validTo: validTo ? new Date(validTo).toISOString() : null,
      appliesTo,
      memberOnly,
      active,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(editor === 'new' ? 'Promosi dibuat' : 'Promosi diperbarui');
    setEditor(null);
    router.refresh();
  }

  async function toggle(promo: PromotionView) {
    setBusyId(promo.id);
    const result = await togglePromotionAction(promo.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Promo ${promo.code} ${result.data?.active ? 'diaktifkan' : 'dinonaktifkan'}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Revenue rules"
        title="Promo & Voucher"
        description="Kode promo persentase/nominal, minimum spend, kuota, dan masa berlaku."
        actions={
          <Button variant="primary" size="md" onClick={openNew}>
            <Icon name="add" className="text-[18px]" />
            Tambah promo
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total promo" value={stats.total} icon="sell" tone="primary" />
        <StatCard label="Promo aktif" value={stats.active} icon="bolt" tone="cyan" />
        <StatCard label="Total pemakaian" value={stats.uses} icon="redeem" tone="tertiary" />
        <StatCard label="Model" value="Kode" icon="confirmation_number" tone="neutral" />
      </section>

      {data.promotions.length === 0 ? (
        <EmptyState icon="sell" title="Belum ada promo" description="Buat kode promo pertama." />
      ) : (
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          {data.promotions.map((promo) => (
            <article key={promo.id} className="panel rounded-xl p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="numeric text-body-md font-bold text-primary">{promo.code}</span>
                    <Badge tone={promo.active ? 'primary' : 'neutral'} dot>
                      {promo.active ? 'Active' : 'Off'}
                    </Badge>
                    <Badge tone={promo.type === 'percent' ? 'cyan' : 'tertiary'}>
                      {promo.type === 'percent'
                        ? `${(promo.value / 100).toFixed(0)}%`
                        : formatRp(promo.value)}
                    </Badge>
                    {promo.memberOnly ? <Badge tone="paused">Member only</Badge> : null}
                  </div>
                  <p className="mt-1 text-body-sm font-semibold text-on-surface">{promo.name}</p>
                  <p className="text-[10px] text-on-surface-variant">
                    {promo.appliesTo === 'all'
                      ? 'Semua item'
                      : promo.appliesTo === 'billiard'
                        ? 'Billiard'
                        : 'F&B'}{' '}
                    · min {formatRp(promo.minSpend)}
                    {promo.maxDiscount ? ` · maks ${formatRp(promo.maxDiscount)}` : ''}
                    {promo.maxUses ? ` · ${promo.usesCount}/${promo.maxUses} pakai` : ` · ${promo.usesCount}x`}
                  </p>
                  <p className="text-[10px] text-outline">
                    {promo.validFrom || promo.validTo
                      ? `${promo.validFrom ? formatDate(promo.validFrom) : '—'} → ${
                          promo.validTo ? formatDate(promo.validTo) : '∞'
                        }`
                      : 'Tanpa batas waktu'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(promo)}>
                    <Icon name="edit" className="text-[16px]" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => toggle(promo)}
                    loading={busyId === promo.id}
                  >
                    <Icon
                      name={promo.active ? 'toggle_on' : 'toggle_off'}
                      className={promo.active ? 'text-primary' : 'text-outline'}
                    />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={editor !== null}
        onClose={() => (saving ? undefined : setEditor(null))}
        title={editor === 'new' ? 'Tambah promo' : 'Edit promo'}
        subtitle="Promo berlaku saat diterapkan ke bill; kuota bertambah saat bill lunas."
        icon="sell"
        size="md"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditor(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={save} loading={saving}>
              <Icon name="save" className="text-[18px]" />
              Simpan promo
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Kode"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="WEEKEND10"
            />
            <Input label="Nama" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <Textarea
            label="Deskripsi"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipe</Label>
              <Select
                className="mt-1.5"
                value={type}
                onChange={(event) => {
                  const next = event.target.value as 'percent' | 'fixed';
                  setType(next);
                  setValue(next === 'percent' ? 1000 : 10_000);
                }}
              >
                <option value="percent">Persentase</option>
                <option value="fixed">Nominal</option>
              </Select>
            </div>
            <Input
              label={type === 'percent' ? 'Nilai (bps)' : 'Nominal (Rp)'}
              type="number"
              min={1}
              value={value}
              onChange={(event) => setValue(Math.max(1, Number(event.target.value) || 1))}
              hint={type === 'percent' ? '1000 = 10%' : undefined}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Min spend (Rp)"
              type="number"
              min={0}
              value={minSpend}
              onChange={(event) => setMinSpend(Math.max(0, Number(event.target.value) || 0))}
            />
            <Input
              label="Maks diskon (Rp)"
              type="number"
              min={0}
              value={maxDiscount}
              onChange={(event) => setMaxDiscount(Math.max(0, Number(event.target.value) || 0))}
              hint="0 = tanpa batas"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Maks pemakaian"
              type="number"
              min={0}
              value={maxUses}
              onChange={(event) => setMaxUses(Math.max(0, Number(event.target.value) || 0))}
              hint="0 = unlimited"
            />
            <div>
              <Label>Cakupan</Label>
              <Select
                className="mt-1.5"
                value={appliesTo}
                onChange={(event) => setAppliesTo(event.target.value as 'all' | 'billiard' | 'fnb')}
              >
                <option value="all">Semua item</option>
                <option value="billiard">Billiard</option>
                <option value="fnb">F&B</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Berlaku dari"
              type="datetime-local"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
            />
            <Input
              label="Berlaku sampai"
              type="datetime-local"
              value={validTo}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </div>
          <Switch checked={memberOnly} onChange={setMemberOnly} label="Hanya member" />
          <Switch checked={active} onChange={setActive} label="Promo aktif" />
          <FormError message={error} />
        </div>
      </Modal>
    </div>
  );
}
