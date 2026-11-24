import type { Metadata } from 'next';
import { ReportView } from '@/components/admin/report-view';
import { requireStaff } from '@/lib/auth';
import { getReportData } from '@/lib/queries/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Laporan',
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireStaff(['owner']);
  const params = await searchParams;
  const parsed = Number(params.range);
  const range = [7, 14, 30].includes(parsed) ? parsed : 7;
  const data = await getReportData(range);
  return <ReportView data={data} range={range} />;
}
