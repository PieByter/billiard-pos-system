import type { Metadata } from 'next';
import { RefundManager } from '@/components/admin/refund-manager';
import { requireStaff } from '@/lib/auth';
import { getRefundData } from '@/lib/queries/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Refund & Koreksi',
};

export default async function RefundsPage() {
  await requireStaff(['owner']);
  const data = await getRefundData();
  return <RefundManager data={data} />;
}
