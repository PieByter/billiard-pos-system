import type { Metadata } from 'next';
import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { requireStaff } from '@/lib/auth';
import { getAdminData } from '@/lib/queries/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin & Shift',
};

export default async function AdminPage() {
  const staff = await requireStaff(['owner']);
  const data = await getAdminData();
  return <AdminDashboard data={data} ownerName={staff.name} />;
}
