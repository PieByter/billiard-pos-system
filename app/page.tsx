import { redirect } from 'next/navigation';
import { getCurrentStaff, homeForRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/login');
  redirect(homeForRole(staff.role));
}
