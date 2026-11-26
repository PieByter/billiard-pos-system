'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  logMaintenanceAction,
  saveAssetAction,
} from '@/app/actions/maintenance';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label, Select, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { formatDate, formatRp } from '@/lib/format';
import type { MaintenanceData } from '@/lib/types';

type Asset = MaintenanceData['assets'][number];

export function MaintenanceManager({ data }: { data: MaintenanceData }) {
  const router = useRouter();
  const [assetEditor, setAssetEditor] = useState<Asset | 'new' | null>(null);
  const [logAsset, setLogAsset] = useState<Asset | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'cue' | 'table' | 'equipment'>('cue');
  const [status, setStatus] = useState<'active' | 'maintenance' | 'retired'>('active');
  const [tableId, setTableId] = useState('');
  const [notes, setNotes] = useState('');

  const [logType, setLogType] = useState<'service' | 'repair' | 'retipping' | 'inspection'>('service');
  const [logCost, setLogCost] = useState(0);
  const [logVendor, setLogVendor] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [logDue, setLogDue] = useState('');

  const stats = useMemo(
    () => ({
      total: data.assets.length,
      maintenance: data.assets.filter((asset) => asset.status === 'maintenance').length,
      due: data.logs.filter((log) => log.nextDueAt && new Date(log.nextDueAt) <= new Date()).length,
      cost: data.logs.reduce((sum, log) => sum + log.cost, 0),
    }),
    [data.assets, data.logs],
  );

  function openNew() {
    setAssetEditor('new');
    setCode('');
    setName('');
    setType('cue');
    setStatus('active');
    setTableId('');
    setNotes('');
    setError(null);
  }

  function openEdit(asset: Asset) {
    setAssetEditor(asset);
    setCode(asset.code);
    setName(asset.name);
    setType(asset.type);
    setStatus(asset.status);
    setTableId(asset.tableId ?? '');
    setNotes(asset.notes ?? '');
    setError(null);
  }

  async function saveAsset() {
    setSaving(true);
    setError(null);
    const result = await saveAssetAction({
      id: assetEditor === 'new' || assetEditor === null ? undefined : assetEditor.id,
      code,
      name,
      type,
      status,
      tableId: tableId || null,
      notes: notes || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Aset disimpan');
    setAssetEditor(null);
    router.refresh();
  }

  function openLog(asset: Asset) {
    setLogAsset(asset);
    setLogType('service');
    setLogCost(0);
    setLogVendor('');
    setLogNotes('');
    setLogDue('');
    setError(null);
  }

  async function saveLog() {
    if (!logAsset) return;
    setSaving(true);
    setError(null);
    const result = await logMaintenanceAction({
      assetId: logAsset.id,
      type: logType,
      cost: logCost,
      vendor: logVendor || null,
      notes: logNotes || null,
      nextDueAt: logDue ? new Date(logDue).toISOString() : null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Maintenance dicatat');
    setLogAsset(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Asset care"
        title="Maintenance Cue & Alat"
        description="Inventaris cue/meja/peralatan, jadwal servis, dan biaya perawatan."
        actions={
          <Button variant="primary" size="md" onClick={openNew}>
            <Icon name="add" className="text-[18px]" />
            Tambah aset
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total aset" value={stats.total} icon="build" tone="primary" />
        <StatCard label="Maintenance" value={stats.maintenance} icon="handyman" tone="error" />
        <StatCard label="Jatuh tempo" value={stats.due} icon="event_busy" tone="tertiary" />
        <StatCard label="Biaya tercatat" value={formatRp(stats.cost)} icon="payments" tone="cyan" />
      </section>

      {data.assets.length === 0 ? (
        <EmptyState icon="build" title="Belum ada aset" description="Tambahkan cue/meja/peralatan." />
      ) : (
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          {data.assets.map((asset) => (
            <article key={asset.id} className="panel rounded-xl p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="numeric text-body-sm font-bold text-primary">{asset.code}</span>
                    <Badge tone={asset.status === 'maintenance' ? 'error' : asset.status === 'retired' ? 'neutral' : 'primary'} dot>
                      {asset.status}
                    </Badge>
                    <Badge tone="outline">{asset.type}</Badge>
                  </div>
                  <p className="mt-1 text-body-md font-bold text-on-surface">{asset.name}</p>
                  <p className="text-[10px] text-on-surface-variant">
                    {asset.tableCode ? `Meja ${asset.tableCode}` : 'Tidak terikat meja'}
                    {asset.notes ? ` · ${asset.notes}` : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(asset)}
                    aria-label={`Edit aset ${asset.name}`}
                  >
                    <Icon name="edit" className="text-[16px]" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openLog(asset)}
                    aria-label={`Catat maintenance ${asset.name}`}
                  >
                    <Icon name="handyman" className="text-[16px]" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="panel rounded-xl p-4">
        <h2 className="text-body-md font-bold text-on-surface">Riwayat maintenance</h2>
        {data.logs.length === 0 ? (
          <p className="py-4 text-body-sm text-on-surface-variant">Belum ada log.</p>
        ) : (
          <div className="mt-2 flex flex-col divide-y divide-outline-variant/10">
            {data.logs.map((log) => (
              <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px]">
                <span className="text-on-surface-variant">
                  <b className="text-on-surface">{log.assetName}</b> · {log.type} ·{' '}
                  {formatDate(log.performedAt)}
                  {log.vendor ? ` · ${log.vendor}` : ''}
                </span>
                <span className="numeric text-on-surface">
                  {formatRp(log.cost)}
                  {log.nextDueAt ? ` · next ${formatDate(log.nextDueAt)}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={assetEditor !== null}
        onClose={() => (saving ? undefined : setAssetEditor(null))}
        title={assetEditor === 'new' ? 'Tambah aset' : 'Edit aset'}
        icon="build"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setAssetEditor(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={saveAsset} loading={saving}>
              Simpan aset
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Input label="Kode" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
            <Input label="Nama" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipe</Label>
              <Select className="mt-1.5" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
                <option value="cue">Cue</option>
                <option value="table">Meja</option>
                <option value="equipment">Peralatan</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select className="mt-1.5" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="retired">Retired</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Meja (opsional)</Label>
            <Select className="mt-1.5" value={tableId} onChange={(event) => setTableId(event.target.value)}>
              <option value="">Tidak terikat</option>
              {data.tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.code}
                </option>
              ))}
            </Select>
          </div>
          <Textarea label="Catatan" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          <FormError message={error} />
        </div>
      </Modal>

      <Modal
        open={Boolean(logAsset)}
        onClose={() => (saving ? undefined : setLogAsset(null))}
        title={logAsset ? `Maintenance ${logAsset.name}` : 'Maintenance'}
        icon="handyman"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setLogAsset(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={saveLog} loading={saving}>
              Simpan log
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipe</Label>
              <Select className="mt-1.5" value={logType} onChange={(event) => setLogType(event.target.value as typeof logType)}>
                <option value="service">Service</option>
                <option value="repair">Repair</option>
                <option value="retipping">Retipping</option>
                <option value="inspection">Inspection</option>
              </Select>
            </div>
            <Input
              label="Biaya"
              type="number"
              min={0}
              value={logCost}
              onChange={(event) => setLogCost(Math.max(0, Number(event.target.value) || 0))}
            />
          </div>
          <Input label="Vendor" value={logVendor} onChange={(event) => setLogVendor(event.target.value)} />
          <Input label="Jatuh tempo berikutnya" type="datetime-local" value={logDue} onChange={(event) => setLogDue(event.target.value)} />
          <Textarea label="Catatan" rows={2} value={logNotes} onChange={(event) => setLogNotes(event.target.value)} />
          <FormError message={error} />
        </div>
      </Modal>
    </div>
  );
}
