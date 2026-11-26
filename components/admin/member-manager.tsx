'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  saveMemberAction,
  saveMemberTierAction,
} from '@/app/actions/membership';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { formatDate, formatRp, initials } from '@/lib/format';
import type { MemberAdminData, MemberTierView, MemberView } from '@/lib/types';

type MemberEditor = MemberView | 'new' | null;
type TierEditor = MemberTierView | 'new' | null;

export function MemberManager({ data }: { data: MemberAdminData }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [memberEditor, setMemberEditor] = useState<MemberEditor>(null);
  const [tierEditor, setTierEditor] = useState<TierEditor>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [active, setActive] = useState(true);

  const [tierName, setTierName] = useState('');
  const [tierMinSpend, setTierMinSpend] = useState(0);
  const [tierDiscount, setTierDiscount] = useState(0);
  const [tierMultiplier, setTierMultiplier] = useState(100);
  const [tierActive, setTierActive] = useState(true);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.members;
    return data.members.filter((member) =>
      `${member.name} ${member.phone} ${member.code} ${member.tierName ?? ''}`
        .toLowerCase()
        .includes(term),
    );
  }, [data.members, query]);

  const stats = useMemo(
    () => ({
      total: data.members.length,
      active: data.members.filter((member) => member.active).length,
      points: data.members.reduce((sum, member) => sum + member.points, 0),
      spend: data.members.reduce((sum, member) => sum + member.totalSpend, 0),
    }),
    [data.members],
  );

  function openNew() {
    setMemberEditor('new');
    setName('');
    setPhone('');
    setEmail('');
    setNote('');
    setConsent(false);
    setActive(true);
    setError(null);
  }

  function openEdit(member: MemberView) {
    setMemberEditor(member);
    setName(member.name);
    setPhone(member.phone);
    setEmail(member.email ?? '');
    setNote(member.note ?? '');
    setConsent(member.consent);
    setActive(member.active);
    setError(null);
  }

  async function saveMember() {
    setSaving(true);
    setError(null);
    const result = await saveMemberAction({
      id: memberEditor === 'new' || memberEditor === null ? undefined : memberEditor.id,
      name,
      phone,
      email: email || null,
      note: note || null,
      consent,
      active,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(memberEditor === 'new' ? 'Member ditambahkan' : 'Member diperbarui');
    setMemberEditor(null);
    router.refresh();
  }

  function openTier(tier: MemberTierView | 'new') {
    setTierEditor(tier);
    setTierName(tier === 'new' ? '' : tier.name);
    setTierMinSpend(tier === 'new' ? 0 : tier.minSpend);
    setTierDiscount(tier === 'new' ? 0 : tier.discountBps);
    setTierMultiplier(tier === 'new' ? 100 : tier.pointsMultiplierBps);
    setTierActive(tier === 'new' ? true : tier.active);
    setError(null);
  }

  async function saveTier() {
    setSaving(true);
    setError(null);
    const result = await saveMemberTierAction({
      id: tierEditor === 'new' || tierEditor === null ? undefined : tierEditor.id,
      name: tierName,
      minSpend: tierMinSpend,
      discountBps: tierDiscount,
      pointsMultiplierBps: tierMultiplier,
      active: tierActive,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Tier member disimpan');
    setTierEditor(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Loyalty"
        title="Member & Tier"
        description="Profil member, poin, total spend, dan diskon tier otomatis."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[17px] text-outline"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama, telepon, kode…"
                className="h-10 w-[230px] rounded-lg border border-outline-variant/40 bg-surface-container-lowest pl-9 pr-3 text-body-sm text-on-surface placeholder:text-outline/60 focus:border-primary/60 focus:outline-none"
              />
            </div>
            <Button variant="primary" size="md" onClick={openNew}>
              <Icon name="person_add" className="text-[18px]" />
              Tambah member
            </Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total member" value={stats.total} icon="groups" tone="primary" />
        <StatCard label="Member aktif" value={stats.active} icon="verified_user" tone="cyan" />
        <StatCard label="Total poin" value={stats.points.toLocaleString('id-ID')} icon="stars" tone="tertiary" />
        <StatCard label="Total spend member" value={formatRp(stats.spend)} icon="trending_up" tone="neutral" />
      </section>

      <section className="panel flex flex-col gap-3 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-headline-md font-bold text-on-surface">Tier & benefit</h2>
          <Button variant="ghost" size="sm" onClick={() => openTier('new')}>
            <Icon name="add" className="text-[16px]" />
            Tambah tier
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {data.tiers.map((tier) => (
            <div key={tier.id} className="rounded-lg border border-outline-variant/25 bg-surface-container p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-sm font-bold text-on-surface">{tier.name}</span>
                <Badge tone={tier.active ? 'primary' : 'neutral'}>{tier.active ? 'Active' : 'Off'}</Badge>
              </div>
              <p className="mt-1 text-[10px] text-on-surface-variant">
                Min spend {formatRp(tier.minSpend)}
              </p>
              <p className="text-[10px] text-on-surface-variant">
                Diskon {(tier.discountBps / 100).toFixed(0)}% · poin ×
                {(tier.pointsMultiplierBps / 10_000).toFixed(2)}
              </p>
              <Button variant="ghost" size="sm" className="mt-1 px-0" onClick={() => openTier(tier)}>
                <Icon name="edit" className="text-[15px]" />
                Edit tier
              </Button>
            </div>
          ))}
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState icon="groups" title="Belum ada member" description="Tambahkan member pertama." />
      ) : (
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          {filtered.map((member) => (
            <article key={member.id} className="panel rounded-xl p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-body-sm font-bold text-primary">
                    {initials(member.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-body-md font-bold text-on-surface">
                        {member.name}
                      </span>
                      {member.tierName ? <Badge tone="tertiary">{member.tierName}</Badge> : null}
                      <Badge tone={member.active ? 'primary' : 'error'} dot>
                        {member.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-body-sm text-on-surface-variant">{member.phone}</p>
                    <p className="text-[10px] text-outline">
                      {member.code} · sejak {formatDate(member.createdAt)}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => openEdit(member)}>
                  <Icon name="edit" className="text-[16px]" />
                  Edit
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-outline-variant/20 pt-2.5 text-[11px]">
                <div>
                  <span className="text-outline">Poin</span>
                  <p className="numeric font-bold text-primary">{member.points.toLocaleString('id-ID')}</p>
                </div>
                <div className="text-right">
                  <span className="text-outline">Total spend</span>
                  <p className="numeric font-bold text-on-surface">{formatRp(member.totalSpend)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={memberEditor !== null}
        onClose={() => (saving ? undefined : setMemberEditor(null))}
        title={memberEditor === 'new' ? 'Tambah member' : 'Edit member'}
        subtitle="Diskon tier otomatis dihitung ulang saat bill berubah."
        icon="loyalty"
        size="md"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setMemberEditor(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={saveMember} loading={saving}>
              <Icon name="save" className="text-[18px]" />
              Simpan member
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Nama" value={name} onChange={(event) => setName(event.target.value)} />
          <Input
            label="Nomor telepon"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="08xxxxxxxxxx"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Opsional"
          />
          <Textarea
            label="Catatan"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <Switch checked={consent} onChange={setConsent} label="Consent promo & loyalty" />
          <Switch checked={active} onChange={setActive} label="Member aktif" />
          <FormError message={error} />
        </div>
      </Modal>

      <Modal
        open={tierEditor !== null}
        onClose={() => (saving ? undefined : setTierEditor(null))}
        title={tierEditor === 'new' ? 'Tambah tier' : 'Edit tier'}
        icon="workspace_premium"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setTierEditor(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={saveTier} loading={saving}>
              Simpan tier
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Nama tier" value={tierName} onChange={(event) => setTierName(event.target.value)} />
          <div>
            <Label>Minimal total spend</Label>
            <Input
              type="number"
              min={0}
              value={tierMinSpend}
              onChange={(event) => setTierMinSpend(Math.max(0, Number(event.target.value) || 0))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Diskon (bps)</Label>
              <Input
                type="number"
                min={0}
                max={10000}
                value={tierDiscount}
                onChange={(event) => setTierDiscount(Math.max(0, Number(event.target.value) || 0))}
              />
              <p className="mt-1 text-[10px] text-outline">1000 bps = 10%</p>
            </div>
            <div>
              <Label>Multiplier poin (bps)</Label>
              <Input
                type="number"
                min={1}
                max={100000}
                value={tierMultiplier}
                onChange={(event) => setTierMultiplier(Math.max(1, Number(event.target.value) || 1))}
              />
              <p className="mt-1 text-[10px] text-outline">10000 = 1×</p>
            </div>
          </div>
          <Switch checked={tierActive} onChange={setTierActive} label="Tier aktif" />
          <FormError message={error} />
        </div>
      </Modal>
    </div>
  );
}
