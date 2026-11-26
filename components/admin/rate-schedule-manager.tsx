'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  saveRateScheduleAction,
  toggleRateScheduleAction,
} from '@/app/actions/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label, Select } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { Switch } from '@/components/ui/switch';
import { cn, formatRp } from '@/lib/format';
import { minutesToTime, parseTime } from '@/lib/time';
import type { RateScheduleView, RateSchedulesAdminData } from '@/lib/types';

const DAYS = [
  { value: 1, label: 'Sen' },
  { value: 2, label: 'Sel' },
  { value: 3, label: 'Rab' },
  { value: 4, label: 'Kam' },
  { value: 5, label: 'Jum' },
  { value: 6, label: 'Sab' },
  { value: 7, label: 'Min' },
];

type Editor = RateScheduleView | 'new' | null;

export function RateScheduleManager({ data }: { data: RateSchedulesAdminData }) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor>(null);
  const [tableId, setTableId] = useState(data.tables[0]?.id ?? '');
  const [rateId, setRateId] = useState(data.rates[0]?.id ?? '');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [start, setStart] = useState('17:00');
  const [end, setEnd] = useState('23:00');
  const [priority, setPriority] = useState(10);
  const [active, setActive] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRates = useMemo(() => data.rates.filter((rate) => rate.active), [data.rates]);
  const grouped = useMemo(() => {
    return data.tables.map((table) => ({
      table,
      schedules: data.schedules.filter((schedule) => schedule.tableId === table.id),
    }));
  }, [data.schedules, data.tables]);

  const stats = useMemo(() => {
    const active = data.schedules.filter((schedule) => schedule.active).length;
    const covered = data.tables.filter((table) =>
      data.schedules.some((schedule) => schedule.tableId === table.id && schedule.active),
    ).length;
    return { active, covered, total: data.schedules.length };
  }, [data.schedules, data.tables]);

  function openNew(table?: string) {
    setEditor('new');
    setTableId(table ?? data.tables[0]?.id ?? '');
    setRateId(activeRates[0]?.id ?? '');
    setDays([1, 2, 3, 4, 5, 6, 7]);
    setStart('17:00');
    setEnd('23:00');
    setPriority(10);
    setActive(true);
    setError(null);
  }

  function openEdit(schedule: RateScheduleView) {
    setEditor(schedule);
    setTableId(schedule.tableId);
    setRateId(schedule.rateId);
    setDays(schedule.daysOfWeek);
    setStart(minutesToTime(schedule.startMinute));
    setEnd(minutesToTime(schedule.endMinute));
    setPriority(schedule.priority);
    setActive(schedule.active);
    setError(null);
  }

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );
  }

  async function save() {
    const startMinute = parseTime(start);
    const endMinute = parseTime(end);
    if (startMinute === null || endMinute === null) {
      setError('Format jam harus HH:MM.');
      return;
    }
    if (startMinute >= endMinute) {
      setError('Jam mulai harus lebih kecil dari jam selesai.');
      return;
    }
    if (days.length === 0) {
      setError('Pilih minimal satu hari.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveRateScheduleAction({
      id: editor === 'new' || editor === null ? undefined : editor.id,
      tableId,
      rateId,
      daysOfWeek: days,
      startMinute,
      endMinute,
      priority,
      active,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Jadwal tarif disimpan', {
      description: `${minutesToTime(startMinute)}–${minutesToTime(endMinute)} · prioritas ${priority}`,
    });
    setEditor(null);
    router.refresh();
  }

  async function toggle(schedule: RateScheduleView) {
    setBusyId(schedule.id);
    const result = await toggleRateScheduleAction(schedule.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Jadwal ${result.data?.active ? 'diaktifkan' : 'dinonaktifkan'}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Revenue rules"
        title="Jadwal Tarif Billiard"
        description="Tarif otomatis berdasarkan hari dan jam. Tarif default meja dipakai jika tidak ada jadwal yang cocok."
        actions={
          <Button variant="primary" size="md" onClick={() => openNew()} disabled={!data.tables.length}>
            <Icon name="add" className="text-[18px]" />
            Tambah jadwal
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total jadwal" value={stats.total} icon="schedule" tone="primary" />
        <StatCard label="Jadwal aktif" value={stats.active} icon="bolt" tone="cyan" />
        <StatCard label="Meja tercakup" value={stats.covered} icon="table_restaurant" tone="tertiary" />
        <StatCard
          label="Zona waktu"
          value="WIB"
          icon="public"
          tone="neutral"
          hint="Resolusi memakai Asia/Jakarta"
        />
      </section>

      <div className="rounded-lg border border-tertiary/25 bg-tertiary/[0.06] p-3 text-body-sm text-on-surface-variant">
        <span className="flex items-center gap-1.5 font-semibold text-tertiary">
          <Icon name="info" className="text-[18px]" />
          Prioritas menentukan pemenang saat jadwal overlap.
        </span>
        <p className="mt-1 text-[11px] leading-4">
          Tarif di-snapshot saat sesi dimulai. Mengubah jadwal tidak mengubah sesi yang sedang
          berjalan. Jadwal yang melewati tengah malam belum didukung; pecah menjadi dua jadwal.
        </p>
      </div>

      {data.tables.length === 0 ? (
        <EmptyState icon="table_restaurant" title="Belum ada meja billiard" />
      ) : (
        <div className="flex flex-col gap-2">
          {grouped.map(({ table, schedules }) => (
            <section key={table.id} className="panel rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="numeric text-body-lg font-bold text-on-surface">{table.code}</span>
                  <Badge tone="outline">{table.zone}</Badge>
                  <span className="text-body-sm text-on-surface-variant">
                    Default {table.rateName ?? 'tanpa tarif'}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => openNew(table.id)}>
                  <Icon name="add" className="text-[16px]" />
                  Jadwal
                </Button>
              </div>
              {schedules.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-outline-variant/30 px-3 py-2 text-body-sm text-outline">
                  Belum ada jadwal. Tarif default dipakai sepanjang hari.
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {schedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className={cn(
                        'rounded-lg border p-3',
                        schedule.active
                          ? 'border-outline-variant/30 bg-surface-container'
                          : 'border-dashed border-outline-variant/20 bg-surface-container-lowest opacity-60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-body-sm font-bold text-on-surface">
                              {schedule.rateName}
                            </span>
                            <Badge tone={schedule.active ? 'primary' : 'neutral'}>
                              {schedule.active ? 'Active' : 'Off'}
                            </Badge>
                            <Badge tone="paused">P{schedule.priority}</Badge>
                          </div>
                          <p className="mt-1 text-body-sm text-on-surface-variant">
                            {minutesToTime(schedule.startMinute)}–{minutesToTime(schedule.endMinute)} ·{' '}
                            {formatRp(schedule.pricePerHour)}/jam
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(schedule)}>
                            <Icon name="edit" className="text-[16px]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => toggle(schedule)}
                            loading={busyId === schedule.id}
                          >
                            <Icon
                              name={schedule.active ? 'toggle_on' : 'toggle_off'}
                              className={schedule.active ? 'text-primary' : 'text-outline'}
                            />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {DAYS.map((day) => (
                          <span
                            key={day.value}
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                              schedule.daysOfWeek.includes(day.value)
                                ? 'bg-primary/15 text-primary'
                                : 'bg-surface-container-high text-outline',
                            )}
                          >
                            {day.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={editor !== null}
        onClose={() => (saving ? undefined : setEditor(null))}
        title={editor === 'new' ? 'Tambah jadwal tarif' : 'Edit jadwal tarif'}
        subtitle="Rentang memakai waktu Asia/Jakarta. Berlaku untuk sesi baru."
        icon="schedule"
        size="md"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditor(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={save} loading={saving}>
              <Icon name="save" className="text-[18px]" />
              Simpan jadwal
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <Label>Meja</Label>
            <Select className="mt-1.5" value={tableId} onChange={(event) => setTableId(event.target.value)}>
              {data.tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.code} · {table.zone}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Tarif</Label>
            <Select className="mt-1.5" value={rateId} onChange={(event) => setRateId(event.target.value)}>
              {activeRates.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.name} · {formatRp(rate.pricePerHour)}/jam
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Hari berlaku</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={cn(
                    'h-8 rounded-lg border px-2.5 text-body-sm font-semibold transition-colors',
                    days.includes(day.value)
                      ? 'border-primary/50 bg-primary/15 text-primary'
                      : 'border-outline-variant/35 bg-surface-container text-on-surface-variant',
                  )}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Mulai"
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <Input
              label="Selesai"
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
          <Input
            label="Prioritas"
            type="number"
            min={0}
            max={100}
            value={priority}
            onChange={(event) => setPriority(Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
            hint="Lebih tinggi menang saat overlap"
          />
          <Switch
            checked={active}
            onChange={setActive}
            label="Jadwal aktif"
            description="Matikan untuk menyimpan tanpa menerapkan tarif."
          />
          <FormError message={error} />
        </div>
      </Modal>
    </div>
  );
}
