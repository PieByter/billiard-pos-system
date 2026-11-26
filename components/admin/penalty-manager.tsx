'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  savePenaltyRuleAction,
  togglePenaltyRuleAction,
  waivePenaltyAction,
} from '@/app/actions/penalties';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label, Select } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { SectionHeader, StatCard } from '@/components/ui/stat-card';
import { formatDate, formatRp } from '@/lib/format';
import type { PenaltyAdminData, PenaltyRuleView } from '@/lib/types';

const TYPES: PenaltyRuleView['type'][] = [
  'overtime',
  'no_show',
  'cancellation',
  'damage',
  'loss',
  'other',
];

export function PenaltyManager({ data }: { data: PenaltyAdminData }) {
  const router = useRouter();
  const [editor, setEditor] = useState<PenaltyRuleView | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<PenaltyRuleView['type']>('damage');
  const [defaultAmount, setDefaultAmount] = useState(0);
  const [maxAmount, setMaxAmount] = useState(0);
  const [active, setActive] = useState(true);

  function openNew() {
    setEditor('new');
    setName('');
    setType('damage');
    setDefaultAmount(0);
    setMaxAmount(0);
    setActive(true);
    setError(null);
  }

  function openEdit(rule: PenaltyRuleView) {
    setEditor(rule);
    setName(rule.name);
    setType(rule.type);
    setDefaultAmount(rule.defaultAmount);
    setMaxAmount(rule.maxAmount ?? 0);
    setActive(rule.active);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await savePenaltyRuleAction({
      id: editor === 'new' || editor === null ? undefined : editor.id,
      name,
      type,
      defaultAmount,
      maxAmount: maxAmount || null,
      active,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Aturan denda disimpan');
    setEditor(null);
    router.refresh();
  }

  async function toggle(rule: PenaltyRuleView) {
    const result = await togglePenaltyRuleAction(rule.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Aturan ${rule.name} ${result.data?.active ? 'diaktifkan' : 'dinonaktifkan'}`);
    router.refresh();
  }

  async function waive(penaltyId: string) {
    const reason = window.prompt('Alasan waive denda:');
    if (!reason || reason.trim().length < 3) return;
    const result = await waivePenaltyAction(penaltyId, reason);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Denda di-waive');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Risk control"
        title="Denda & Penalti"
        description="Aturan denda manual (kerusakan/kehilangan/overtime) dan riwayat."
        actions={
          <Button variant="primary" size="md" onClick={openNew}>
            <Icon name="gavel" className="text-[18px]" />
            Tambah aturan
          </Button>
        }
      />
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Aturan aktif" value={data.rules.filter((rule) => rule.active).length} icon="rule" tone="primary" />
        <StatCard label="Total denda" value={data.penalties.length} icon="gavel" tone="tertiary" />
        <StatCard
          label="Nilai denda"
          value={formatRp(data.penalties.filter((p) => p.status === 'approved').reduce((sum, p) => sum + p.amount, 0))}
          icon="payments"
          tone="error"
        />
        <StatCard label="Waive" value={data.penalties.filter((p) => p.status === 'waived').length} icon="undo" tone="neutral" />
      </section>

      <section className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {data.rules.map((rule) => (
          <article key={rule.id} className="panel rounded-xl p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-body-sm font-bold text-on-surface">{rule.name}</span>
                  <Badge tone={rule.active ? 'primary' : 'neutral'}>{rule.active ? 'Active' : 'Off'}</Badge>
                  <Badge tone="outline">{rule.type}</Badge>
                </div>
                <p className="mt-1 text-[10px] text-on-surface-variant">
                  Default {formatRp(rule.defaultAmount)}
                  {rule.maxAmount ? ` · maks ${formatRp(rule.maxAmount)}` : ''}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(rule)}>
                  <Icon name="edit" className="text-[16px]" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => toggle(rule)}>
                  <Icon name={rule.active ? 'toggle_on' : 'toggle_off'} className={rule.active ? 'text-primary' : 'text-outline'} />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="panel rounded-xl p-4">
        <h2 className="text-body-md font-bold text-on-surface">Riwayat denda</h2>
        {data.penalties.length === 0 ? (
          <p className="py-4 text-body-sm text-on-surface-variant">Belum ada denda.</p>
        ) : (
          <div className="mt-2 flex flex-col divide-y divide-outline-variant/10">
            {data.penalties.map((penalty) => (
              <div key={penalty.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px]">
                <span className="text-on-surface-variant">
                  <b className="text-on-surface">{penalty.billNumber ?? 'Bill'}</b> · {penalty.type} ·{' '}
                  {formatDate(penalty.createdAt)} · {penalty.reason}
                </span>
                <span className="flex items-center gap-2">
                  <span className="numeric font-semibold text-on-surface">{formatRp(penalty.amount)}</span>
                  <Badge tone={penalty.status === 'approved' ? 'error' : penalty.status === 'waived' ? 'neutral' : 'paused'}>
                    {penalty.status}
                  </Badge>
                  {penalty.status === 'approved' ? (
                    <Button variant="ghost" size="sm" onClick={() => waive(penalty.id)}>
                      Waive
                    </Button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={editor !== null}
        onClose={() => (saving ? undefined : setEditor(null))}
        title={editor === 'new' ? 'Tambah aturan denda' : 'Edit aturan denda'}
        icon="gavel"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditor(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={save} loading={saving}>
              Simpan aturan
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Nama aturan" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipe</Label>
              <Select className="mt-1.5" value={type} onChange={(event) => setType(event.target.value as PenaltyRuleView['type'])}>
                {TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              label="Nominal default"
              type="number"
              min={0}
              value={defaultAmount}
              onChange={(event) => setDefaultAmount(Math.max(0, Number(event.target.value) || 0))}
            />
          </div>
          <Input
            label="Maksimum (opsional)"
            type="number"
            min={0}
            value={maxAmount}
            onChange={(event) => setMaxAmount(Math.max(0, Number(event.target.value) || 0))}
          />
          <label className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 accent-primary" />
            Aturan aktif
          </label>
          <FormError message={error} />
        </div>
      </Modal>
    </div>
  );
}
