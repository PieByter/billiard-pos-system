import type { Metadata } from 'next';
import { KdsBoard } from '@/components/kds/kds-board';
import { requireStaff } from '@/lib/auth';
import { getKdsData } from '@/lib/queries/kds';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kitchen Display',
};

export default async function KitchenPage() {
  await requireStaff();
  const data = await getKdsData();
  return <KdsBoard data={data} />;
}
