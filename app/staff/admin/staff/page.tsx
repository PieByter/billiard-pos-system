import type { Metadata } from 'next';
import { StaffManager } from '@/components/admin/staff-manager';
import { requireStaff } from '@/lib/auth';
import { getStaffSettingsData } from '@/lib/queries/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Staff & Akses',
};

export default async function StaffPage() {
  const staff = await requireStaff(['owner']);
  const data = await getStaffSettingsData();
  return (
    <StaffManager
      staff={data.staff}
      currentStaffId={staff.id}
      authMode={data.authMode}
      canProvisionAuth={data.canProvisionAuth}
    />
  );
}
