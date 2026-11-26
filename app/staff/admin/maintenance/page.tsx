import type { Metadata } from 'next';
import { MaintenanceManager } from '@/components/admin/maintenance-manager';
import { requireStaff } from '@/lib/auth';
import { getMaintenanceData } from '@/lib/services/maintenance';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Maintenance Cue & Alat',
};

export default async function MaintenancePage() {
  await requireStaff(['owner']);
  const data = await getMaintenanceData();
  return <MaintenanceManager data={data} />;
}
