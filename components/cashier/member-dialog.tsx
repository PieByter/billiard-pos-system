'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  attachMemberAction,
  detachMemberAction,
  saveMemberAction,
  searchMembersAction,
} from '@/app/actions/membership';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { formatRp } from '@/lib/format';
import type { MemberView, TableView } from '@/lib/types';

export function MemberDialog({
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
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<MemberView[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTerm('');
    setError(null);
    setMode('search');
    setName('');
    setPhone('');
    setEmail('');
    setConsent(false);
    setSearching(true);
    void searchMembersAction('').then((result) => {
      setSearching(false);
      if (result.ok) setResults(result.data ?? []);
    });
  }, [open]);

  async function search() {
    setSearching(true);
    const result = await searchMembersAction(term);
    setSearching(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResults(result.data ?? []);
  }

  async function attach(member: MemberView) {
    if (!bill) return;
    setLoading(true);
    setError(null);
    const result = await attachMemberAction(bill.id, member.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Member terhubung', {
      description: `${member.name} · diskon ${formatRp(result.data?.discount ?? 0)}`,
    });
    onClose();
    onDone?.();
    router.refresh();
  }

  async function detach() {
    if (!bill) return;
    setLoading(true);
    const result = await detachMemberAction(bill.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Member dilepas dari bill');
    onClose();
    onDone?.();
    router.refresh();
  }

  async function createAndAttach() {
    if (!bill) return;
    setLoading(true);
    setError(null);
    const created = await saveMemberAction({ name, phone, email: email || null, consent });
    if (!created.ok) {
      setLoading(false);
      setError(created.error);
      return;
    }
    const result = await attachMemberAction(bill.id, created.data!.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Member baru terhubung', { description: name });
    onClose();
    onDone?.();
    router.refresh();
  }

  return (
    <Modal
      open={open && Boolean(table)}
      onClose={onClose}
      title="Member & loyalty"
      subtitle={table ? `Meja ${table.code} · ${bill?.number ?? ''}` : undefined}
      icon="loyalty"
      size="md"
      footer={
        bill?.memberId ? (
          <Button variant="danger" onClick={detach} loading={loading}>
            Lepas member dari bill
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-3">
        {bill?.memberId ? (
          <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-3 text-body-sm">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <Icon name="verified" className="text-[18px]" />
              Member aktif di bill ini
            </div>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              Diskon member saat ini {formatRp(bill.memberDiscountAmount)}. Poin akan ditambahkan
              otomatis saat bill lunas.
            </p>
          </div>
        ) : null}

        <div className="flex items-center gap-1 rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-1">
          <button
            type="button"
            onClick={() => setMode('search')}
            className={`flex-1 rounded-md px-2 py-1.5 text-body-sm font-semibold ${
              mode === 'search' ? 'bg-surface-container-high text-primary' : 'text-on-surface-variant'
            }`}
          >
            Cari member
          </button>
          <button
            type="button"
            onClick={() => setMode('new')}
            className={`flex-1 rounded-md px-2 py-1.5 text-body-sm font-semibold ${
              mode === 'new' ? 'bg-surface-container-high text-primary' : 'text-on-surface-variant'
            }`}
          >
            Member baru
          </button>
        </div>

        {mode === 'search' ? (
          <>
            <div className="flex gap-2">
              <Input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void search();
                }}
                placeholder="Nama, telepon, atau kode member…"
                leading={<Icon name="search" className="text-[18px]" />}
              />
              <Button variant="secondary" onClick={search} loading={searching}>
                Cari
              </Button>
            </div>
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {results.length === 0 ? (
                <p className="py-6 text-center text-body-sm text-on-surface-variant">
                  Member tidak ditemukan.
                </p>
              ) : (
                results.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => attach(member)}
                    disabled={loading}
                    className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant/25 bg-surface-container p-2.5 text-left transition-colors hover:border-primary/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-body-sm font-bold text-on-surface">
                          {member.name}
                        </span>
                        {member.tierName ? <Badge tone="tertiary">{member.tierName}</Badge> : null}
                      </div>
                      <p className="text-[10px] text-on-surface-variant">
                        {member.phone} · {member.points} poin · spend {formatRp(member.totalSpend)}
                      </p>
                    </div>
                    <Icon name="add_circle" className="text-[19px] text-primary" />
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              label="Nama member"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nama lengkap"
            />
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
            <label className="flex items-center gap-2 text-body-sm text-on-surface-variant">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="h-4 w-4 rounded border-outline-variant accent-primary"
              />
              Setuju menerima info promo & loyalty
            </label>
            <Button variant="primary" onClick={createAndAttach} loading={loading}>
              <Icon name="person_add" className="text-[18px]" />
              Buat &amp; hubungkan
            </Button>
          </div>
        )}
        <FormError message={error} />
      </div>
    </Modal>
  );
}
