import type { Metadata } from 'next';
import { PenaltyManager } from '@/components/admin/penalty-manager';
import { requireStaff } from '@/lib/auth';
import { getPenaltyData } from '@/lib/services/penalties';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Denda & Penalti',
};

export default async function PenaltiesPage() {
  await requireStaff(['owner']);
  const data = await getPenaltyData();
  return <PenaltyManager data={data} />;
}
