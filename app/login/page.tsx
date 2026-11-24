import { redirect } from 'next/navigation';
import { authMode, getCurrentStaff, homeForRole } from '@/lib/auth';
import { LoginExperience } from '@/components/auth/login-experience';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const staff = await getCurrentStaff();
  if (staff) redirect(homeForRole(staff.role));
  return <LoginExperience mode={authMode()} />;
}
