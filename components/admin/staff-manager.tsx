'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { saveStaffAction, setStaffActiveAction } from '@/app/actions/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label, Select } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { ROLE_LABELS } from '@/lib/constants';
import { formatDate, initials } from '@/lib/format';
import type { ProfileRole, StaffAdminView } from '@/lib/types';

type Editor = StaffAdminView | 'new' | null;

export function StaffManager({
  staff,
  currentStaffId,
  authMode,
  canProvisionAuth,
}: {
  staff: StaffAdminView[];
  currentStaffId: string;
  authMode: 'supabase' | 'demo' | 'disabled';
  canProvisionAuth: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Editor>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProfileRole>('cashier');
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return staff;
    return staff.filter((member) =>
      `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(term),
    );
  }, [query, staff]);

  const stats = useMemo(
    () => ({
      total: staff.length,
      active: staff.filter((member) => member.active).length,
      owners: staff.filter((member) => member.role === 'owner' && member.active).length,
    }),
    [staff],
  );

  function openNew() {
    setEditor('new');
    setName('');
    setEmail('');
    setRole('cashier');
    setActive(true);
    setPassword('');
    setError(null);
  }

  function openEdit(member: StaffAdminView) {
    setEditor(member);
    setName(member.name);
    setEmail(member.email);
    setRole(member.role);
    setActive(member.active);
    setPassword('');
    setError(null);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await saveStaffAction({
      id: editor === 'new' || editor === null ? undefined : editor.id,
      name,
      email,
      role,
      active,
      password: password || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(editor === 'new' ? 'Staff ditambahkan' : 'Staff diperbarui', {
      description: `${name} · ${ROLE_LABELS[role]}`,
    });
    setEditor(null);
    router.refresh();
  }

  async function toggleActive(member: StaffAdminView) {
    setBusyId(member.id);
    const result = await setStaffActiveAction(member.id, !member.active);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Staff ${member.name} ${result.data?.active ? 'diaktifkan' : 'dinonaktifkan'}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Owner console"
        title="Staff & Akses"
        description="Kelola akun kasir, kitchen, dan owner. Nonaktifkan akses tanpa menghapus histori."
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
                placeholder="Cari nama, email, role…"
                className="h-10 w-[230px] rounded-lg border border-outline-variant/40 bg-surface-container-lowest pl-9 pr-3 text-body-sm text-on-surface placeholder:text-outline/60 focus:border-primary/60 focus:outline-none"
              />
            </div>
            <Button variant="primary" size="md" onClick={openNew} disabled={!canProvisionAuth}>
              <Icon name="person_add" className="text-[18px]" />
              Tambah staff
            </Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total staff" value={stats.total} icon="badge" tone="primary" />
        <StatCard label="Aktif" value={stats.active} icon="verified_user" tone="cyan" />
        <StatCard label="Owner aktif" value={stats.owners} icon="admin_panel_settings" tone="tertiary" />
        <StatCard
          label="Mode auth"
          value={authMode === 'supabase' ? 'Supabase' : authMode === 'demo' ? 'Demo' : 'Off'}
          icon="lock"
          tone="neutral"
          hint={canProvisionAuth ? 'Provisioning aktif' : 'Butuh service role key'}
        />
      </section>

      {!canProvisionAuth ? (
        <div className="rounded-xl border border-tertiary/30 bg-tertiary/[0.06] p-3 text-body-sm text-tertiary">
          <b>Provisioning auth belum aktif.</b> Isi `SUPABASE_SERVICE_ROLE_KEY` di server untuk
          menambah staff dari UI. Di mode demo, provisioning berjalan otomatis.
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState icon="badge" title="Staff tidak ditemukan" description="Ubah kata kunci pencarian." />
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {filtered.map((member) => {
            const isSelf = member.id === currentStaffId;
            const canToggle = !isSelf && !(member.role === 'owner' && member.active && stats.owners <= 1);
            return (
              <article key={member.id} className="panel rounded-xl p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-body-sm font-bold text-primary">
                      {initials(member.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-body-md font-bold text-on-surface">
                          {member.name}
                        </span>
                        {isSelf ? <Badge tone="primary">You</Badge> : null}
                        <Badge tone={member.active ? 'primary' : 'error'} dot>
                          {member.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="truncate text-body-sm text-on-surface-variant">{member.email}</p>
                    </div>
                  </div>
                  <Badge tone={member.role === 'owner' ? 'tertiary' : member.role === 'cashier' ? 'cyan' : 'neutral'}>
                    {ROLE_LABELS[member.role]}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-outline-variant/20 pt-2.5">
                  <span className="text-[10px] text-outline">
                    Dibuat {formatDate(member.createdAt)}
                    {authMode === 'supabase' ? ' · Supabase Auth' : ' · password lokal'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(member)}>
                      <Icon name="edit" className="text-[16px]" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActive(member)}
                      loading={busyId === member.id}
                      disabled={!canToggle}
                    >
                      <Icon name={member.active ? 'block' : 'check_circle'} className="text-[16px]" />
                      {member.active ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={editor !== null}
        onClose={() => (saving ? undefined : setEditor(null))}
        title={editor === 'new' ? 'Tambah staff baru' : 'Edit staff'}
        subtitle={
          authMode === 'supabase'
            ? 'Akun akan dibuat di Supabase Auth dan profiles.'
            : 'Mode demo memakai password lokal yang di-hash.'
        }
        icon="badge"
        size="md"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditor(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={submit} loading={saving}>
              <Icon name="save" className="text-[18px]" />
              Simpan staff
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Nama lengkap"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nama staff"
          />
          <Input
            label="Email"
            type="email"
            value={email}
            maxLength={160}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@venue.com"
            disabled={authMode === 'supabase' && !canProvisionAuth}
          />
          <div>
            <Label>Role</Label>
            <Select
              className="mt-1.5"
              value={role}
              onChange={(event) => setRole(event.target.value as ProfileRole)}
            >
              <option value="cashier">Kasir</option>
              <option value="kitchen">Kitchen</option>
              <option value="owner">Owner</option>
            </Select>
          </div>
          <Input
            label={editor === 'new' ? 'Password awal' : 'Reset password'}
            hint={editor === 'new' ? 'Minimal 8 karakter' : 'Kosongkan jika tidak diubah'}
            type="password"
            value={password}
            maxLength={120}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={editor === 'new' ? 'Minimal 8 karakter' : '••••••••'}
            disabled={authMode === 'supabase' && !canProvisionAuth}
          />
          <Switch
            checked={active}
            onChange={setActive}
            label="Akses aktif"
            description="Nonaktifkan untuk memblokir login tanpa menghapus data."
          />
          <FormError message={error} />
        </div>
      </Modal>
    </div>
  );
}
