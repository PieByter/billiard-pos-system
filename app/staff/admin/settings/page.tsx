import type { Metadata } from 'next';
import { VenueSettingsForm } from '@/components/admin/venue-settings-form';
import { requireStaff } from '@/lib/auth';
import { getStaffSettingsData } from '@/lib/queries/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pengaturan Venue',
};

export default async function SettingsPage() {
  await requireStaff(['owner']);
  const data = await getStaffSettingsData();
  return <VenueSettingsForm settings={data.settings} />;
}
