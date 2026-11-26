'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { saveVenueSettingsAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { SectionHeader, StatCard } from '@/components/ui/stat-card';
import { formatDate, formatRp } from '@/lib/format';
import type { VenueSettingsView } from '@/lib/types';

function bpsToPercent(bps: number) {
  return Math.round((bps / 100) * 100) / 100;
}

export function VenueSettingsForm({ settings }: { settings: VenueSettingsView }) {
  const router = useRouter();
  const [venueName, setVenueName] = useState(settings.venueName);
  const [address, setAddress] = useState(settings.address);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [taxPercent, setTaxPercent] = useState(bpsToPercent(settings.taxRateBps));
  const [servicePercent, setServicePercent] = useState(bpsToPercent(settings.serviceRateBps));
  const [warningMinutes, setWarningMinutes] = useState(settings.warningMinutes);
  const [receiptFooter, setReceiptFooter] = useState(settings.receiptFooter);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taxRateBps = Math.round(taxPercent * 100);
  const serviceRateBps = Math.round(servicePercent * 100);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveVenueSettingsAction({
      venueName,
      address,
      timezone,
      taxRateBps,
      serviceRateBps,
      warningMinutes,
      receiptFooter,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Pengaturan venue disimpan', {
      description: 'Berlaku untuk bill baru. Bill berjalan tetap memakai snapshot.',
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Owner console"
        title="Pengaturan Venue"
        description="Identitas venue, pajak, service charge, dan preferensi operasional."
        actions={
          <Button variant="primary" size="md" onClick={save} loading={saving}>
            <Icon name="save" className="text-[18px]" />
            Simpan pengaturan
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="PB1"
          value={`${taxPercent}%`}
          icon="percent"
          tone="primary"
          hint="Berlaku untuk bill baru"
        />
        <StatCard
          label="Service charge"
          value={`${servicePercent}%`}
          icon="room_service"
          tone="cyan"
          hint="Berlaku untuk bill baru"
        />
        <StatCard
          label="Contoh total Rp100.000"
          value={formatRp(Math.round(100_000 * (1 + (taxRateBps + serviceRateBps) / 10_000)))}
          icon="calculate"
          tone="tertiary"
          hint={`+${formatRp(Math.round(100_000 * ((taxRateBps + serviceRateBps) / 10_000)))} pajak & service`}
        />
        <StatCard
          label="Warning sisa waktu"
          value={`${warningMinutes} mnt`}
          icon="timer"
          tone="neutral"
          hint="Untuk fitur lampu/peringatan"
        />
      </section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-start">
        <section className="panel flex flex-col gap-3 rounded-xl p-4 xl:col-span-7">
          <h2 className="text-headline-md font-bold text-on-surface">Identitas & struk</h2>
          <Input
            label="Nama venue"
            value={venueName}
            maxLength={100}
            onChange={(event) => setVenueName(event.target.value)}
            placeholder="Cue & Tap"
          />
          <Textarea
            label="Alamat"
            rows={2}
            maxLength={240}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Alamat venue untuk struk"
          />
          <Input
            label="Timezone"
            value={timezone}
            maxLength={60}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="Asia/Jakarta"
          />
          <Textarea
            label="Footer struk"
            rows={2}
            maxLength={240}
            value={receiptFooter}
            onChange={(event) => setReceiptFooter(event.target.value)}
            placeholder="Terima kasih sudah mampir…"
          />
          <p className="text-[10px] text-outline">
            Terakhir diubah:{' '}
            {settings.updatedAt
              ? `${formatDate(settings.updatedAt)} · ${settings.updatedByName ?? 'Sistem'}`
              : 'Default sistem'}
          </p>
        </section>

        <section className="panel flex flex-col gap-3 rounded-xl p-4 xl:col-span-5">
          <h2 className="text-headline-md font-bold text-on-surface">Pajak & operasional</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="PB1 (%)"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={taxPercent}
              onChange={(event) => setTaxPercent(Number(event.target.value) || 0)}
            />
            <Input
              label="Service (%)"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={servicePercent}
              onChange={(event) => setServicePercent(Number(event.target.value) || 0)}
            />
          </div>
          <Input
            label="Warning sisa waktu (menit)"
            type="number"
            min={0}
            max={120}
            value={warningMinutes}
            onChange={(event) => setWarningMinutes(Math.max(0, Number(event.target.value) || 0))}
            hint="Dipakai fitur lampu/peringatan di masa depan"
          />
          <div className="rounded-lg border border-tertiary/25 bg-tertiary/[0.06] p-3 text-body-sm text-on-surface-variant">
            <span className="flex items-center gap-1.5 font-semibold text-tertiary">
              <Icon name="info" className="text-[18px]" />
              Snapshot per bill
            </span>
            <p className="mt-1 text-[11px] leading-4">
              Perubahan PB1/service hanya berlaku untuk bill baru. Bill yang sedang berjalan tetap
              memakai tarif saat bill dibuka.
            </p>
          </div>
          <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-3">
            <Label>Preview perhitungan</Label>
            <div className="mt-1.5 flex flex-col gap-1 text-body-sm">
              <div className="flex justify-between text-on-surface-variant">
                <span>Subtotal</span>
                <span className="numeric">{formatRp(100_000)}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>PB1 {taxPercent}%</span>
                <span className="numeric">{formatRp(Math.round(100_000 * (taxRateBps / 10_000)))}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Service {servicePercent}%</span>
                <span className="numeric">
                  {formatRp(Math.round(100_000 * (serviceRateBps / 10_000)))}
                </span>
              </div>
              <div className="mt-1 flex justify-between border-t border-outline-variant/25 pt-1 font-bold text-on-surface">
                <span>Total</span>
                <span className="numeric text-primary">
                  {formatRp(Math.round(100_000 * (1 + (taxRateBps + serviceRateBps) / 10_000)))}
                </span>
              </div>
            </div>
          </div>
          <FormError message={error} />
        </section>
      </div>
    </div>
  );
}
