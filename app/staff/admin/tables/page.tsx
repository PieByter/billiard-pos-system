import type { Metadata } from 'next';
import { TableManager } from '@/components/admin/table-manager';
import { requireStaff } from '@/lib/auth';
import { getTablesAdminData } from '@/lib/queries/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Meja & QR',
};

export default async function TablesAdminPage() {
  await requireStaff(['owner']);
  const data = await getTablesAdminData();
  return <TableManager data={data} />;
}
