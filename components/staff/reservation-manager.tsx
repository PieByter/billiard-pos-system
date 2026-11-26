'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  checkInReservationAction,
  createReservationAction,
  createWaitlistAction,
  setReservationDepositAction,
  setReservationStatusAction,
  setWaitlistStatusAction,
} from '@/app/actions/reservations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label, Select, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { formatClock, formatDate, formatRelative, formatRp } from '@/lib/format';
import type { ReservationView, ReservationsData, WaitlistView } from '@/lib/types';

const STATUS_LABEL: Record<ReservationView['status'], string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  completed: 'Selesai',
  cancelled: 'Batal',
  no_show: 'No-show',
};

const STATUS_TONE: Record<
  ReservationView['status'],
  'primary' | 'paused' | 'error' | 'cyan' | 'tertiary' | 'neutral'
> = {
  pending: 'paused',
  confirmed: 'primary',
  checked_in: 'cyan',
  completed: 'neutral',
  cancelled: 'error',
  no_show: 'error',
};

const WAITLIST_LABEL: Record<WaitlistView['status'], string> = {
  waiting: 'Menunggu',
  called: 'Dipanggil',
  seated: 'Duduk',
  cancelled: 'Batal',
  no_show: 'No-show',
};

const WAITLIST_TONE: Record<
  WaitlistView['status'],
  'primary' | 'paused' | 'error' | 'cyan' | 'neutral'
> = {
  waiting: 'paused',
  called: 'primary',
  seated: 'cyan',
  cancelled: 'error',
  no_show: 'error',
};

function jakartaDateKey(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function jakartaToday() {
  return jakartaDateKey(new Date());
}

export function ReservationManager({ data }: { data: ReservationsData }) {
  const router = useRouter();
  const [tab, setTab] = useState<'reservations' | 'waitlist'>('reservations');
  const [reservationOpen, setReservationOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [tableId, setTableId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(jakartaToday());
  const [startTime, setStartTime] = useState('19:00');
  const [duration, setDuration] = useState(60);
  const [deposit, setDeposit] = useState(0);
  const [note, setNote] = useState('');

  const [wlGuest, setWlGuest] = useState('');
  const [wlPhone, setWlPhone] = useState('');
  const [wlParty, setWlParty] = useState(2);
  const [wlPreference, setWlPreference] = useState<'billiard' | 'cafe'>('billiard');
  const [wlWait, setWlWait] = useState(15);
  const [wlNote, setWlNote] = useState('');

  const stats = useMemo(() => {
    const today = jakartaToday();
    const todayReservations = data.reservations.filter(
      (reservation) =>
        jakartaDateKey(reservation.startAt) === today &&
        !['cancelled', 'no_show'].includes(reservation.status),
    );
    return {
      today: todayReservations.length,
      confirmed: data.reservations.filter((r) => r.status === 'confirmed').length,
      checkedIn: data.reservations.filter((r) => r.status === 'checked_in').length,
      waiting: data.waitlist.filter((entry) => entry.status === 'waiting').length,
    };
  }, [data]);

  const activeReservations = useMemo(
    () =>
      data.reservations
        .filter((reservation) => ['confirmed', 'pending', 'checked_in'].includes(reservation.status))
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [data.reservations],
  );
  const historyReservations = useMemo(
    () =>
      data.reservations
        .filter((reservation) => ['completed', 'cancelled', 'no_show'].includes(reservation.status))
        .sort((a, b) => b.startAt.localeCompare(a.startAt))
        .slice(0, 12),
    [data.reservations],
  );

  function openReservation() {
    const table = data.tables[0];
    setTableId(table?.id ?? '');
    setPartySize(Math.min(2, table?.capacity ?? 4));
    setGuestName('');
    setPhone('');
    setDate(jakartaToday());
    setStartTime('19:00');
    setDuration(60);
    setDeposit(0);
    setNote('');
    setError(null);
    setReservationOpen(true);
  }

  async function saveReservation() {
    setSaving(true);
    setError(null);
    const result = await createReservationAction({
      tableId,
      guestName,
      phone: phone || null,
      partySize,
      date,
      startTime,
      durationMinutes: duration,
      depositAmount: deposit,
      note: note || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Reservasi ${result.data?.code} dibuat`, {
      description: `Meja ${result.data?.tableCode} · ${date} ${startTime}`,
    });
    setReservationOpen(false);
    router.refresh();
  }

  async function reservationStatus(
    reservation: ReservationView,
    status: 'confirmed' | 'completed' | 'cancelled' | 'no_show',
  ) {
    setBusyId(reservation.id);
    const result = await setReservationStatusAction(reservation.id, status);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Reservasi ${reservation.code} → ${STATUS_LABEL[status]}`);
    router.refresh();
  }

  async function checkIn(reservation: ReservationView) {
    setBusyId(reservation.id);
    const result = await checkInReservationAction(reservation.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Check-in ${reservation.code}`, {
      description: `Bill dan sesi meja ${reservation.tableCode} dibuat.`,
    });
    router.refresh();
  }

  async function depositPaid(reservation: ReservationView) {
    setBusyId(reservation.id);
    const result = await setReservationDepositAction(reservation.id, 'paid');
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Deposit ${reservation.code} diterima`);
    router.refresh();
  }

  function openWaitlist() {
    setWlGuest('');
    setWlPhone('');
    setWlParty(2);
    setWlPreference('billiard');
    setWlWait(15);
    setWlNote('');
    setError(null);
    setWaitlistOpen(true);
  }

  async function saveWaitlist() {
    setSaving(true);
    setError(null);
    const result = await createWaitlistAction({
      guestName: wlGuest,
      phone: wlPhone || null,
      partySize: wlParty,
      preference: wlPreference,
      estimatedWaitMinutes: wlWait,
      note: wlNote || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Antrean ${result.data?.code} ditambahkan`);
    setWaitlistOpen(false);
    router.refresh();
  }

  async function waitlistStatus(
    entry: WaitlistView,
    status: 'called' | 'seated' | 'cancelled' | 'no_show',
  ) {
    setBusyId(entry.id);
    const result = await setWaitlistStatusAction(entry.id, status);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Antrean ${entry.code} → ${WAITLIST_LABEL[status]}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Front desk"
        title="Reservasi & Waitlist"
        description="Booking meja, deposit, check-in ke sesi/bill, dan antrean walk-in."
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={tab === 'reservations' ? openReservation : openWaitlist}
          >
            <Icon name={tab === 'reservations' ? 'event_available' : 'group_add'} className="text-[18px]" />
            {tab === 'reservations' ? 'Buat reservasi' : 'Tambah antrean'}
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Reservasi hari ini" value={stats.today} icon="event" tone="primary" />
        <StatCard label="Confirmed" value={stats.confirmed} icon="event_available" tone="cyan" />
        <StatCard label="Checked in" value={stats.checkedIn} icon="login" tone="tertiary" />
        <StatCard label="Waitlist menunggu" value={stats.waiting} icon="groups" tone="neutral" />
      </section>

      <div className="flex items-center gap-1 rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-1">
        <button
          type="button"
          onClick={() => setTab('reservations')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-body-sm font-semibold transition-colors ${
            tab === 'reservations'
              ? 'bg-surface-container-high text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Icon name="event" className="text-[18px]" />
          Reservasi
        </button>
        <button
          type="button"
          onClick={() => setTab('waitlist')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-body-sm font-semibold transition-colors ${
            tab === 'waitlist'
              ? 'bg-surface-container-high text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Icon name="groups" className="text-[18px]" />
          Waitlist
        </button>
      </div>

      {tab === 'reservations' ? (
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h2 className="text-headline-md font-bold text-on-surface">Aktif & mendatang</h2>
            {activeReservations.length === 0 ? (
              <EmptyState
                icon="event_available"
                title="Belum ada reservasi aktif"
                description="Buat reservasi untuk mengunci meja dan mencatat deposit."
              />
            ) : (
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {activeReservations.map((reservation) => (
                  <article key={reservation.id} className="panel rounded-xl p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="numeric text-body-sm font-bold text-on-surface">
                            {reservation.code}
                          </span>
                          <Badge tone={STATUS_TONE[reservation.status]}>
                            {STATUS_LABEL[reservation.status]}
                          </Badge>
                          <Badge tone="outline">{reservation.tableCode}</Badge>
                          {reservation.depositAmount > 0 ? (
                            <Badge
                              tone={
                                reservation.depositStatus === 'paid'
                                  ? 'primary'
                                  : reservation.depositStatus === 'forfeited'
                                    ? 'error'
                                    : 'paused'
                              }
                            >
                              Deposit {formatRp(reservation.depositAmount)} · {reservation.depositStatus}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-body-md font-bold text-on-surface">
                          {reservation.guestName}
                        </p>
                        <p className="text-body-sm text-on-surface-variant">
                          {reservation.partySize} pax · {reservation.tableZone}
                          {reservation.phone ? ` · ${reservation.phone}` : ''}
                        </p>
                        <p className="mt-1 text-body-sm text-on-surface">
                          {formatDate(reservation.startAt)} · {formatClock(reservation.startAt)}–
                          {formatClock(reservation.endAt)}
                        </p>
                        {reservation.note ? (
                          <p className="mt-1 text-[10px] italic text-outline">{reservation.note}</p>
                        ) : null}
                      </div>
                      <span className="material-symbols-outlined text-[22px] text-outline">
                        event
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-outline-variant/20 pt-2.5">
                      {reservation.status === 'pending' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => reservationStatus(reservation, 'confirmed')}
                          loading={busyId === reservation.id}
                        >
                          Konfirmasi
                        </Button>
                      ) : null}
                      {reservation.status === 'confirmed' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => checkIn(reservation)}
                          loading={busyId === reservation.id}
                        >
                          <Icon name="login" className="text-[16px]" />
                          Check-in
                        </Button>
                      ) : null}
                      {reservation.depositStatus === 'pending' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => depositPaid(reservation)}
                          loading={busyId === reservation.id}
                        >
                          <Icon name="payments" className="text-[16px]" />
                          Deposit lunas
                        </Button>
                      ) : null}
                      {reservation.status === 'checked_in' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => reservationStatus(reservation, 'completed')}
                          loading={busyId === reservation.id}
                        >
                          <Icon name="task_alt" className="text-[16px]" />
                          Selesai
                        </Button>
                      ) : null}
                      {reservation.status !== 'checked_in' ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => reservationStatus(reservation, 'no_show')}
                            loading={busyId === reservation.id}
                          >
                            No-show
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => reservationStatus(reservation, 'cancelled')}
                            loading={busyId === reservation.id}
                          >
                            Batal
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {historyReservations.length > 0 ? (
            <section className="panel rounded-xl p-4">
              <h2 className="text-body-md font-bold text-on-surface">Riwayat terbaru</h2>
              <div className="mt-2 flex flex-col divide-y divide-outline-variant/10">
                {historyReservations.map((reservation) => (
                  <div key={reservation.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="numeric text-[11px] font-semibold text-on-surface">
                          {reservation.code}
                        </span>
                        <Badge tone={STATUS_TONE[reservation.status]}>
                          {STATUS_LABEL[reservation.status]}
                        </Badge>
                      </div>
                      <p className="truncate text-[10px] text-on-surface-variant">
                        {reservation.guestName} · {reservation.tableCode} ·{' '}
                        {formatDate(reservation.startAt)} {formatClock(reservation.startAt)}
                      </p>
                    </div>
                    {reservation.depositAmount > 0 ? (
                      <span className="text-[10px] text-outline">
                        Deposit {formatRp(reservation.depositAmount)}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <section className="flex flex-col gap-2">
          {data.waitlist.length === 0 ? (
            <EmptyState
              icon="groups"
              title="Waitlist kosong"
              description="Tambahkan tamu walk-in yang sedang menunggu meja."
            />
          ) : (
            <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
              {data.waitlist.map((entry) => (
                <article key={entry.id} className="panel rounded-xl p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="numeric text-body-sm font-bold text-on-surface">
                          {entry.code}
                        </span>
                        <Badge tone={WAITLIST_TONE[entry.status]}>
                          {WAITLIST_LABEL[entry.status]}
                        </Badge>
                        <Badge tone="outline">
                          {entry.preference === 'billiard' ? 'Billiard' : 'Cafe'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-body-md font-bold text-on-surface">{entry.guestName}</p>
                      <p className="text-body-sm text-on-surface-variant">
                        {entry.partySize} pax
                        {entry.phone ? ` · ${entry.phone}` : ''} · menunggu{' '}
                        {formatRelative(entry.createdAt)}
                      </p>
                      <p className="text-[10px] text-outline">
                        Estimasi {entry.estimatedWaitMinutes} menit
                        {entry.note ? ` · ${entry.note}` : ''}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-[22px] text-outline">groups</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-outline-variant/20 pt-2.5">
                    {entry.status === 'waiting' ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => waitlistStatus(entry, 'called')}
                        loading={busyId === entry.id}
                      >
                        <Icon name="campaign" className="text-[16px]" />
                        Panggil
                      </Button>
                    ) : null}
                    {entry.status === 'called' ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => waitlistStatus(entry, 'seated')}
                        loading={busyId === entry.id}
                      >
                        <Icon name="chair" className="text-[16px]" />
                        Duduk
                      </Button>
                    ) : null}
                    {['waiting', 'called'].includes(entry.status) ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => waitlistStatus(entry, 'no_show')}
                          loading={busyId === entry.id}
                        >
                          No-show
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => waitlistStatus(entry, 'cancelled')}
                          loading={busyId === entry.id}
                        >
                          Batal
                        </Button>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <Modal
        open={reservationOpen}
        onClose={() => (saving ? undefined : setReservationOpen(false))}
        title="Buat reservasi"
        subtitle="Cek konflik jadwal otomatis. Deposit dicatat terpisah dari bill."
        icon="event_available"
        size="md"
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setReservationOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={saveReservation} loading={saving}>
              <Icon name="save" className="text-[18px]" />
              Simpan reservasi
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label>Meja</Label>
              <Select className="mt-1.5" value={tableId} onChange={(event) => setTableId(event.target.value)}>
                {data.tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.code} · {table.zone} · {table.capacity} pax
                  </option>
                ))}
              </Select>
            </div>
            <Input
              label="Tanggal"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Jam mulai"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
            <div>
              <Label>Durasi</Label>
              <Select
                className="mt-1.5"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              >
                <option value={30}>30 menit</option>
                <option value={60}>1 jam</option>
                <option value={90}>1,5 jam</option>
                <option value={120}>2 jam</option>
                <option value={180}>3 jam</option>
                <option value={240}>4 jam</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
            <Input
              label="Nama tamu"
              value={guestName}
              maxLength={80}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="Nama tamu"
            />
            <Input
              label="Pax"
              type="number"
              min={1}
              max={30}
              value={partySize}
              onChange={(event) => setPartySize(Math.max(1, Number(event.target.value) || 1))}
            />
          </div>
          <Input
            label="Nomor telepon"
            value={phone}
            maxLength={30}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Opsional"
          />
          <div>
            <Label hint="Opsional">Deposit</Label>
            <div className="mt-1.5">
              <MoneyInput value={deposit} onChange={setDeposit} />
            </div>
          </div>
          <Textarea
            label="Catatan"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Contoh: minta meja dekat jendela, bayar DP QRIS."
          />
          <FormError message={error} />
        </div>
      </Modal>

      <Modal
        open={waitlistOpen}
        onClose={() => (saving ? undefined : setWaitlistOpen(false))}
        title="Tambah waitlist"
        subtitle="Antrean walk-in yang menunggu meja."
        icon="group_add"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setWaitlistOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={saveWaitlist} loading={saving}>
              <Icon name="save" className="text-[18px]" />
              Simpan antrean
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Nama tamu"
            value={wlGuest}
            maxLength={80}
            onChange={(event) => setWlGuest(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Pax"
              type="number"
              min={1}
              max={30}
              value={wlParty}
              onChange={(event) => setWlParty(Math.max(1, Number(event.target.value) || 1))}
            />
            <div>
              <Label>Preferensi</Label>
              <Select
                className="mt-1.5"
                value={wlPreference}
                onChange={(event) => setWlPreference(event.target.value as 'billiard' | 'cafe')}
              >
                <option value="billiard">Billiard</option>
                <option value="cafe">Cafe</option>
              </Select>
            </div>
          </div>
          <Input
            label="Nomor telepon"
            value={wlPhone}
            maxLength={30}
            onChange={(event) => setWlPhone(event.target.value)}
            placeholder="Opsional"
          />
          <Input
            label="Estimasi tunggu (menit)"
            type="number"
            min={0}
            max={240}
            value={wlWait}
            onChange={(event) => setWlWait(Math.max(0, Number(event.target.value) || 0))}
          />
          <Textarea
            label="Catatan"
            rows={2}
            maxLength={500}
            value={wlNote}
            onChange={(event) => setWlNote(event.target.value)}
          />
          <FormError message={error} />
        </div>
      </Modal>
    </div>
  );
}
