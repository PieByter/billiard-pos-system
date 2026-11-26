'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  applyVoucherAction,
  attachMemberAction,
  cancelPointsAction,
  cancelVoucherAction,
  detachMemberAction,
  getMemberBenefitsAction,
  redeemPointsAction,
  saveMemberAction,
  searchMembersAction,
} from '@/app/actions/membership';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { formatRp } from '@/lib/format';
import type { MemberBenefitView, MemberView, TableView } from '@/lib/types';

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
  const [benefits, setBenefits] = useState<MemberBenefitView | null>(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [voucherCode, setVoucherCode] = useState('');

  useEffect(() => {
    if (!open) return;
    setTerm('');
    setError(null);
    setMode('search');
    setName('');
    setPhone('');
    setEmail('');
    setConsent(false);
    setBenefits(null);
    setPointsToRedeem(0);
    setVoucherCode('');
    setSearching(true);
    void searchMembersAction('').then((result) => {
      setSearching(false);
      if (result.ok) setResults(result.data ?? []);
    });
  }, [open]);

  useEffect(() => {
    if (!open || !bill?.memberId) {
      setBenefits(null);
      return;
    }
    let cancelled = false;
    void getMemberBenefitsAction(bill.id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setBenefits(result.data ?? null);
        setPointsToRedeem(result.data?.maxRedeemablePoints ?? 0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, bill?.id, bill?.memberId, bill?.pointsRedeemed, bill?.voucherCode]);

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

  async function redeemPoints() {
    if (!bill || pointsToRedeem <= 0) return;
    setLoading(true);
    setError(null);
    const result = await redeemPointsAction(bill.id, pointsToRedeem);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`${result.data?.points ?? 0} poin ditukar`, {
      description: `Potongan ${formatRp(result.data?.value ?? 0)}`,
    });
    router.refresh();
  }

  async function cancelPoints() {
    if (!bill) return;
    setLoading(true);
    const result = await cancelPointsAction(bill.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Tukar poin dibatalkan');
    router.refresh();
  }

  async function applyVoucher(codeValue: string) {
    if (!bill) return;
    setLoading(true);
    setError(null);
    const result = await applyVoucherAction(bill.id, codeValue);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Voucher ${result.data?.code} dipakai`, {
      description: `Potongan ${formatRp(result.data?.discount ?? 0)}`,
    });
    setVoucherCode('');
    router.refresh();
  }

  async function cancelVoucher() {
    if (!bill) return;
    setLoading(true);
    const result = await cancelVoucherAction(bill.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Voucher dilepas');
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
          <div className="flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] p-3 text-body-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <Icon name="verified" className="text-[18px]" />
                {benefits?.memberName ?? 'Member aktif di bill ini'}
              </div>
              {benefits?.tierName ? <Badge tone="tertiary">{benefits.tierName}</Badge> : null}
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Diskon member saat ini {formatRp(bill.memberDiscountAmount)}. Poin bertambah otomatis
              saat bill lunas.
            </p>
            {benefits ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-2">
                    <span className="text-[10px] uppercase tracking-wider text-outline">Poin</span>
                    <p className="numeric text-body-md font-bold text-primary">
                      {benefits.points.toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-2">
                    <span className="text-[10px] uppercase tracking-wider text-outline">Saldo</span>
                    <p className="numeric text-body-md font-bold text-on-surface">
                      {formatRp(benefits.balance)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-on-surface">Tukar poin</span>
                    <span className="text-[10px] text-outline">
                      1 poin = {formatRp(100)} · maks {benefits.maxRedeemablePoints} poin
                    </span>
                  </div>
                  {bill.pointsRedeemed > 0 ? (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-primary">
                        {bill.pointsRedeemed} poin · -{formatRp(bill.pointsDiscountAmount)}
                      </span>
                      <Button variant="ghost" size="sm" onClick={cancelPoints} loading={loading}>
                        Batalkan
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-end gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={benefits.maxRedeemablePoints}
                        value={pointsToRedeem}
                        onChange={(event) =>
                          setPointsToRedeem(
                            Math.max(
                              0,
                              Math.min(
                                benefits.maxRedeemablePoints,
                                Number(event.target.value) || 0,
                              ),
                            ),
                          )
                        }
                      />
                      <Button
                        variant="secondary"
                        onClick={redeemPoints}
                        loading={loading}
                        disabled={pointsToRedeem <= 0}
                      >
                        Tukar
                      </Button>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-on-surface">Voucher</span>
                    {bill.voucherCode ? (
                      <Button variant="ghost" size="sm" onClick={cancelVoucher} loading={loading}>
                        Lepas {bill.voucherCode}
                      </Button>
                    ) : null}
                  </div>
                  {bill.voucherCode ? (
                    <p className="mt-1 text-[11px] text-primary">
                      {bill.voucherCode} · -{formatRp(bill.voucherDiscountAmount)}
                    </p>
                  ) : (
                    <div className="mt-2 flex items-end gap-2">
                      <Input
                        placeholder="Kode voucher"
                        value={voucherCode}
                        onChange={(event) => setVoucherCode(event.target.value.toUpperCase())}
                      />
                      <Button
                        variant="secondary"
                        onClick={() => applyVoucher(voucherCode)}
                        loading={loading}
                        disabled={!voucherCode.trim()}
                      >
                        Pakai
                      </Button>
                    </div>
                  )}
                  {benefits.vouchers.length > 0 ? (
                    <div className="mt-2 flex flex-col gap-1">
                      {benefits.vouchers.map((voucher) => (
                        <button
                          key={voucher.id}
                          type="button"
                          onClick={() => applyVoucher(voucher.code)}
                          className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2 py-1.5 text-left text-[10px] transition-colors hover:border-primary/40"
                        >
                          <span>
                            <b className="text-primary">{voucher.code}</b> · {voucher.name}
                          </span>
                          <span className="numeric text-on-surface">
                            {voucher.type === 'percent'
                              ? `${(voucher.value / 100).toFixed(0)}%`
                              : formatRp(voucher.value)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
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
