import type { Metadata } from 'next';
import { OutletManager } from '@/components/admin/outlet-manager';
import { VenueSettingsForm } from '@/components/admin/venue-settings-form';
import { requireStaff } from '@/lib/auth';
import { getStaffSettingsData } from '@/lib/queries/admin';
import { listOutlets } from '@/lib/outlet';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pengaturan Venue',
};

export default async function SettingsPage() {
  await requireStaff(['owner']);
  const [data, outlets] = await Promise.all([getStaffSettingsData(), listOutlets()]);
  return (
    <div className="flex flex-col gap-4">
      <VenueSettingsForm settings={data.settings} />
      <OutletManager
        outlets={outlets.map((outlet) => ({
          id: outlet.id,
          code: outlet.code,
          name: outlet.name,
          address: outlet.address,
          timezone: outlet.timezone,
          active: outlet.active,
          createdAt: outlet.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
