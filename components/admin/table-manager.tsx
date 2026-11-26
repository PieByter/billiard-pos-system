'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  rotateTableQrAction,
  saveTableAction,
  setTableMaintenanceAction,
  setTableSelfOrderAction,
} from '@/app/actions/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, Input, Label, Select } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn, formatRp } from '@/lib/format';
import type { TablesAdminData } from '@/lib/types';

type TableRow = TablesAdminData['tables'][number];

const STATE_LABEL: Record<string, string> = {
  available: 'Available',
  running: 'Running',
  paused: 'Paused',
  occupied: 'Occupied',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
};

export function TableManager({ data }: { data: TablesAdminData }) {
  const router = useRouter();
  const [kind, setKind] = useState<'all' | 'billiard' | 'cafe'>('all');
  const [editing, setEditing] = useState<TableRow | 'new' | null>(null);
  const [qrTable, setQrTable] = useState<TableRow | null>(null);
  const [rotateTarget, setRotateTarget] = useState<TableRow | null>(null);
  const [rotating, setRotating] = useState(false);
  const [maintenanceTarget, setMaintenanceTarget] = useState<TableRow | null>(null);
  const [maintenanceNote, setMaintenanceNote] = useState('');
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const billiard = data.tables.filter((table) => table.kind === 'billiard').length;
    const cafe = data.tables.filter((table) => table.kind === 'cafe').length;
    const selfOrder = data.tables.filter((table) => table.allowSelfOrder).length;
    const available = data.tables.filter((table) => table.state === 'available').length;
    return { billiard, cafe, selfOrder, available };
  }, [data.tables]);

  const filtered = data.tables.filter((table) => kind === 'all' || table.kind === kind);

  async function toggleSelfOrder(table: TableRow) {
    setBusyId(table.id);
    const result = await setTableSelfOrderAction(table.id, !table.allowSelfOrder);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Self-order meja ${table.code} ${result.data?.allowSelfOrder ? 'diaktifkan' : 'dimatikan'}`,
    );
    router.refresh();
  }

  async function rotateQr() {
    if (!rotateTarget) return;
    setRotating(true);
    const result = await rotateTableQrAction(rotateTarget.id);
    setRotating(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`QR meja ${rotateTarget.code} dirotasi`, {
      description: 'QR lama otomatis tidak berlaku.',
    });
    setRotateTarget(null);
    router.refresh();
  }

  function openMaintenance(table: TableRow) {
    setMaintenanceTarget(table);
    setMaintenanceNote(table.maintenanceNote ?? '');
  }

  async function toggleMaintenance() {
    if (!maintenanceTarget) return;
    setMaintenanceBusy(true);
    const nextActive = !maintenanceTarget.maintenanceAt;
    const result = await setTableMaintenanceAction(
      maintenanceTarget.id,
      nextActive,
      maintenanceNote,
    );
    setMaintenanceBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      nextActive
        ? `Meja ${maintenanceTarget.code} masuk maintenance`
        : `Meja ${maintenanceTarget.code} siap dipakai`,
    );
    setMaintenanceTarget(null);
    setMaintenanceNote('');
    router.refresh();
  }

  async function copyLink(table: TableRow) {
    try {
      await navigator.clipboard.writeText(table.customerUrl);
      toast.success(`Link meja ${table.code} disalin`);
    } catch {
      toast.error('Gagal menyalin link');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Admin floor"
        title="Meja & QR"
        description="Kapasitas, tarif, self-order flag, dan rotasi token QR."
        actions={
          <Button variant="primary" size="md" onClick={() => setEditing('new')}>
            <Icon name="add" className="text-[18px]" />
            Tambah meja
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Meja billiard" value={stats.billiard} icon="sports_bar" tone="primary" />
        <StatCard label="Meja cafe" value={stats.cafe} icon="table_restaurant" tone="cyan" />
        <StatCard
          label="Self-order aktif"
          value={stats.selfOrder}
          icon="qr_code_2"
          tone="tertiary"
          hint="Flag per meja, bukan hardcode"
        />
        <StatCard
          label="Meja kosong"
          value={stats.available}
          icon="event_available"
          tone="neutral"
          hint="Siap dipakai sekarang"
        />
      </section>

      <div className="panel flex items-center justify-between gap-2 rounded-xl p-2.5">
        <SegmentedControl
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Semua', count: data.tables.length },
            { value: 'billiard', label: 'Billiard', count: stats.billiard },
            { value: 'cafe', label: 'Cafe', count: stats.cafe },
          ]}
        />
        <span className="hidden items-center gap-1.5 text-[10px] uppercase tracking-wider text-outline sm:flex">
          <Icon name="info" className="text-[15px]" />
          Token QR bisa dirotasi kapan saja
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="table_restaurant" title="Belum ada meja" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((table) => (
            <article
              key={table.id}
              className="panel flex flex-col gap-3 rounded-xl p-3.5 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9)]"
            >
              <header className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container-high">
                    <Icon
                      name={table.kind === 'billiard' ? 'sports_bar' : 'table_restaurant'}
                      className={cn('text-[24px]', table.kind === 'billiard' ? 'text-primary' : 'text-secondary')}
                    />
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="numeric text-[22px] font-extrabold leading-none text-on-surface">
                        {table.code}
                      </span>
                      <Badge tone={table.kind === 'billiard' ? 'primary' : 'cyan'}>
                        {table.kind === 'billiard' ? 'Billiard' : 'Cafe'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-body-sm font-medium text-on-surface-variant">
                      {table.zone || 'Tanpa zona'} · {table.capacity} pax
                    </p>
                    <p className="text-[10px] text-outline">
                      {table.rateName ? `${table.rateName} · ${formatRp(table.rate?.pricePerHour ?? 0)}/jam` : 'Tanpa tarif'}
                    </p>
                  </div>
                </div>
                <Badge
                  tone={
                    table.state === 'running'
                      ? 'primary'
                      : table.state === 'paused'
                        ? 'paused'
                        : table.state === 'cleaning'
                          ? 'error'
                          : table.state === 'maintenance'
                            ? 'paused'
                            : table.state === 'occupied'
                              ? 'cyan'
                              : 'outline'
                  }
                  dot
                >
                  {STATE_LABEL[table.state]}
                </Badge>
              </header>

              <div className="flex items-center gap-2.5 rounded-lg border border-outline-variant/20 bg-surface-container-lowest/60 p-2">
                <button
                  type="button"
                  onClick={() => setQrTable(table)}
                  className="shrink-0 rounded-lg bg-white p-1 transition-transform hover:scale-105"
                  title="Lihat QR"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={table.qrDataUrl}
                    alt={`QR meja ${table.code}`}
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={table.allowSelfOrder ? 'primary' : 'neutral'}>
                      {table.allowSelfOrder ? 'Self-order ON' : 'Via kasir'}
                    </Badge>
                    {table.activeSession ? (
                      <span className="numeric text-[10px] text-primary">timer aktif</span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-on-surface-variant">
                    /t/{table.qrToken}
                  </p>
                  <div className="mt-1 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyLink(table)}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-secondary hover:bg-secondary/10"
                    >
                      <Icon name="content_copy" className="text-[13px]" />
                      Copy
                    </button>
                    <button
                      type="button"
                      disabled={busyId === table.id}
                      onClick={() => toggleSelfOrder(table)}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
                    >
                      <Icon name="sync_alt" className="text-[13px]" />
                      Toggle self-order
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setEditing(table)}
                >
                  <Icon name="edit" className="text-[15px]" />
                  Edit meja
                </Button>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  onClick={() => setQrTable(table)}
                  title="QR besar"
                >
                  <Icon name="qr_code_2" className="text-[17px]" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  onClick={() => setRotateTarget(table)}
                  title="Rotasi token QR"
                >
                  <Icon name="autorenew" className="text-[17px]" />
                </Button>
                <Button
                  variant={table.maintenanceAt ? 'primary' : 'secondary'}
                  size="icon-sm"
                  onClick={() => openMaintenance(table)}
                  title={
                    table.maintenanceAt ? 'Selesaikan maintenance' : 'Set meja maintenance'
                  }
                >
                  <Icon name="handyman" className="text-[17px]" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <TableDialog
        table={editing === 'new' ? null : editing}
        open={Boolean(editing)}
        rates={data.rates}
        onClose={() => setEditing(null)}
      />

      <Modal
        open={Boolean(qrTable)}
        onClose={() => setQrTable(null)}
        title={qrTable ? `QR meja ${qrTable.code}` : 'QR meja'}
        subtitle={qrTable?.customerUrl}
        icon="qr_code_2"
        size="sm"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => qrTable && copyLink(qrTable)}>
              <Icon name="content_copy" className="text-[17px]" />
              Copy link
            </Button>
            <a
              href={qrTable ? `/print/qr?table=${qrTable.id}` : '#'}
              target="_blank"
              rel="noreferrer"
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-body-md font-semibold text-on-primary transition-colors hover:bg-primary-fixed"
            >
              <Icon name="print" className="text-[17px]" />
              Cetak QR
            </a>
          </div>
        }
      >
        {qrTable ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrTable.qrDataUrl}
                alt={`QR meja ${qrTable.code}`}
                className="h-64 w-64"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="numeric text-headline-md font-bold text-on-surface">
                {qrTable.code}
              </span>
              <Badge tone={qrTable.allowSelfOrder ? 'primary' : 'neutral'}>
                {qrTable.allowSelfOrder ? 'Self-order' : 'View only'}
              </Badge>
            </div>
            <p className="text-center text-[11px] text-on-surface-variant">
              Rotasi token jika QR dicetak ulang atau bocor. Link lama langsung invalid.
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(maintenanceTarget)}
        onClose={() => (maintenanceBusy ? undefined : setMaintenanceTarget(null))}
        title={
          maintenanceTarget?.maintenanceAt
            ? `Selesaikan maintenance ${maintenanceTarget.code}`
            : `Set maintenance ${maintenanceTarget?.code ?? ''}`
        }
        subtitle="Meja maintenance tidak bisa dipakai untuk sesi, bill, atau self-order."
        icon="handyman"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setMaintenanceTarget(null)}
              disabled={maintenanceBusy}
            >
              Batal
            </Button>
            <Button
              variant={maintenanceTarget?.maintenanceAt ? 'primary' : 'danger'}
              className="flex-[2]"
              onClick={toggleMaintenance}
              loading={maintenanceBusy}
            >
              <Icon name="handyman" className="text-[17px]" />
              {maintenanceTarget?.maintenanceAt ? 'Selesai & siap pakai' : 'Mulai maintenance'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {maintenanceTarget?.maintenanceAt ? (
            <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-3 text-body-sm text-on-surface-variant">
              Meja sedang maintenance sejak{' '}
              {new Date(maintenanceTarget.maintenanceAt).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              .
            </div>
          ) : null}
          <Input
            label="Catatan maintenance"
            placeholder="Contoh: ganti kain meja, leveling, perbaikan cushion"
            maxLength={200}
            value={maintenanceNote}
            onChange={(event) => setMaintenanceNote(event.target.value)}
            disabled={Boolean(maintenanceTarget?.maintenanceAt)}
          />
          {!maintenanceTarget?.maintenanceAt ? (
            <p className="text-[10px] text-on-surface-variant">
              Bill atau sesi aktif harus ditutup terlebih dahulu. Setelah selesai, meja otomatis
              kembali available.
            </p>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(rotateTarget)}
        title={`Rotasi QR meja ${rotateTarget?.code ?? ''}?`}
        description="Semua QR lama untuk meja ini langsung tidak berlaku. Cetak ulang kartu QR setelah rotasi."
        confirmLabel="Rotasi QR"
        tone="danger"
        loading={rotating}
        onClose={() => setRotateTarget(null)}
        onConfirm={rotateQr}
      />
    </div>
  );
}

function TableDialog({
  table,
  open,
  rates,
  onClose,
}: {
  table: TableRow | null;
  open: boolean;
  rates: TablesAdminData['rates'];
  onClose: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'billiard' | 'cafe'>('billiard');
  const [zone, setZone] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [allowSelfOrder, setAllowSelfOrder] = useState(false);
  const [rateId, setRateId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState(99);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(table?.code ?? '');
    setKind(table?.kind ?? 'billiard');
    setZone(table?.zone ?? '');
    setCapacity(table?.capacity ?? 4);
    setAllowSelfOrder(table?.allowSelfOrder ?? false);
    setRateId(table?.rate?.id ?? rates[0]?.id ?? null);
    setSortOrder(99);
    setError(null);
    setLoading(false);
  }, [open, table, rates]);

  async function submit() {
    setLoading(true);
    setError(null);
    const result = await saveTableAction({
      id: table?.id,
      code,
      kind,
      zone,
      capacity,
      allowSelfOrder,
      rateId: kind === 'billiard' ? rateId : null,
      sortOrder,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(table ? 'Meja diperbarui' : 'Meja baru dibuat', {
      description: 'QR token siap dibagikan ke guest.',
    });
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={table ? `Edit meja · ${table.code}` : 'Tambah meja'}
      subtitle="Kode meja unik, QR token random 64-bit."
      icon="table_restaurant"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button variant="primary" onClick={submit} loading={loading} disabled={!code.trim()}>
            Simpan meja
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Kode meja"
            placeholder="B9 / C13"
            maxLength={12}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <Select
            label="Tipe meja"
            value={kind}
            onChange={(event) => setKind(event.target.value as 'billiard' | 'cafe')}
          >
            <option value="billiard">Billiard</option>
            <option value="cafe">Cafe &amp; Lounge</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Zona / label"
            placeholder="VIP 9ft"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
          />
          <Input
            label="Kapasitas"
            type="number"
            min={1}
            max={30}
            value={capacity}
            onChange={(event) => setCapacity(Number(event.target.value))}
          />
        </div>
        {kind === 'billiard' ? (
          <Select
            label="Tarif billiard"
            value={rateId ?? ''}
            onChange={(event) => setRateId(event.target.value || null)}
          >
            <option value="">— Pilih tarif —</option>
            {rates.map((rate) => (
              <option key={rate.id} value={rate.id}>
                {rate.name} · {formatRp(rate.pricePerHour)}/jam
              </option>
            ))}
          </Select>
        ) : null}
        <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-3">
          <Switch
            checked={allowSelfOrder}
            onChange={setAllowSelfOrder}
            label="Izinkan self-order QR"
            description="Billiard default off (order via kasir). Cafe default on."
          />
        </div>
        <Input
          label="Urutan tampil"
          type="number"
          min={0}
          max={999}
          value={sortOrder}
          onChange={(event) => setSortOrder(Number(event.target.value))}
        />
        <FormError message={error} />
        {!table ? (
          <p className="text-[10px] text-on-surface-variant">
            QR token akan dibuat otomatis dan bisa dicetak dari kartu meja.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
