import type { Metadata } from 'next';
import { PrintingManager } from '@/components/admin/printing-manager';
import { requireStaff } from '@/lib/auth';
import { getPrintQueueData } from '@/lib/services/printing';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Printer & Antrean',
};

export default async function PrintingPage() {
  await requireStaff(['owner']);
  const data = await getPrintQueueData();
  return <PrintingManager data={data} />;
}
