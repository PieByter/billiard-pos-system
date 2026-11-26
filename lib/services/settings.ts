import { and, eq } from 'drizzle-orm';
import { dbNow, getDb } from '@/lib/db';
import { venueSettings, type VenueSettings } from '@/lib/db/schema';
import { DEFAULT_OUTLET_ID } from '@/lib/constants';
import { AppError } from '@/lib/errors';
import { getActiveOutletId } from '@/lib/outlet';
import { audit } from './audit';

export type VenueSettingsInput = {
  venueName: string;
  address?: string | null;
  timezone?: string;
  taxRateBps: number;
  serviceRateBps: number;
  warningMinutes: number;
  receiptFooter?: string | null;
};

export const DEFAULT_VENUE_SETTINGS: VenueSettings = {
  id: 'default',
  outletId: DEFAULT_OUTLET_ID,
  venueName: 'Cue & Tap',
  address: '',
  timezone: 'Asia/Jakarta',
  taxRateBps: 1000,
  serviceRateBps: 500,
  warningMinutes: 15,
  receiptFooter: 'Terima kasih sudah mampir. Sampai jumpa lagi!',
  updatedAt: new Date(0),
  updatedBy: null,
};

export async function loadVenueSettings(outletId?: string): Promise<VenueSettings> {
  const db = await getDb();
  const scope = outletId ?? (await getActiveOutletId());
  const [settings] = await db
    .select()
    .from(venueSettings)
    .where(eq(venueSettings.outletId, scope))
    .limit(1);
  return settings ?? { ...DEFAULT_VENUE_SETTINGS, outletId: scope };
}

export async function saveVenueSettings(staffId: string, input: VenueSettingsInput) {
  const outletId = await getActiveOutletId();
  const venueName = input.venueName.trim();
  if (venueName.length < 2) throw new AppError('INVALID_NAME', 'Nama venue wajib diisi.');
  if (input.taxRateBps < 0 || input.taxRateBps > 10_000) {
    throw new AppError('INVALID_TAX', 'PB1 harus antara 0% dan 100%.');
  }
  if (input.serviceRateBps < 0 || input.serviceRateBps > 10_000) {
    throw new AppError('INVALID_SERVICE', 'Service charge harus antara 0% dan 100%.');
  }
  if (input.warningMinutes < 0 || input.warningMinutes > 120) {
    throw new AppError('INVALID_WARNING', 'Warning menit harus antara 0 dan 120.');
  }

  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [settings] = await tx
      .insert(venueSettings)
      .values({
        id: outletId === DEFAULT_OUTLET_ID ? 'default' : `outlet-${outletId}`,
        outletId,
        venueName,
        address: input.address?.trim() ?? '',
        timezone: input.timezone?.trim() || 'Asia/Jakarta',
        taxRateBps: input.taxRateBps,
        serviceRateBps: input.serviceRateBps,
        warningMinutes: input.warningMinutes,
        receiptFooter: input.receiptFooter?.trim() ?? '',
        updatedAt: now,
        updatedBy: staffId,
      })
      .onConflictDoUpdate({
        target: venueSettings.id,
        set: {
          venueName,
          address: input.address?.trim() ?? '',
          timezone: input.timezone?.trim() || 'Asia/Jakarta',
          taxRateBps: input.taxRateBps,
          serviceRateBps: input.serviceRateBps,
          warningMinutes: input.warningMinutes,
          receiptFooter: input.receiptFooter?.trim() ?? '',
          updatedAt: now,
          updatedBy: staffId,
        },
      })
      .returning();

    await audit(tx, {
      staffId,
      action: 'venue.settings_updated',
      entityType: 'venue_settings',
      entityId: settings.id,
      detail: {
        venueName,
        taxRateBps: input.taxRateBps,
        serviceRateBps: input.serviceRateBps,
        warningMinutes: input.warningMinutes,
      },
      at: now,
    });

    return { settings };
  });
}

export async function getVenueSettingsForAdmin() {
  const db = await getDb();
  const outletId = await getActiveOutletId();
  const [settings] = await db
    .select()
    .from(venueSettings)
    .where(and(eq(venueSettings.outletId, outletId)))
    .limit(1);
  return settings ?? { ...DEFAULT_VENUE_SETTINGS, outletId };
}
