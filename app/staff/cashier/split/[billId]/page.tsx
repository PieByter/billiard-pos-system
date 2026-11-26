import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SplitBillManager } from '@/components/cashier/split-bill-manager';
import { requireStaff } from '@/lib/auth';
import { getSplitBillData } from '@/lib/queries/splits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Split Bill',
};

export default async function SplitBillPage({
  params,
}: {
  params: Promise<{ billId: string }>;
}) {
  await requireStaff(['cashier', 'owner']);
  const { billId } = await params;
  const data = await getSplitBillData(billId);
  if (!data) notFound();
  return <SplitBillManager data={data} />;
}
