import type { Metadata } from 'next';
import { RateScheduleManager } from '@/components/admin/rate-schedule-manager';
import { requireStaff } from '@/lib/auth';
import { getRateSchedulesAdminData } from '@/lib/queries/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Jadwal Tarif',
};

export default async function SchedulesPage() {
  await requireStaff(['owner']);
  const data = await getRateSchedulesAdminData();
  return <RateScheduleManager data={data} />;
}
