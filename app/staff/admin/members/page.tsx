import type { Metadata } from 'next';
import { MemberManager } from '@/components/admin/member-manager';
import { requireStaff } from '@/lib/auth';
import { getMemberAdminData } from '@/lib/queries/membership';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Member & Loyalty',
};

export default async function MembersPage() {
  await requireStaff(['owner']);
  const data = await getMemberAdminData();
  return <MemberManager data={data} />;
}
