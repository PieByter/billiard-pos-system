import type { Metadata } from 'next';
import { MenuManager } from '@/components/admin/menu-manager';
import { requireStaff } from '@/lib/auth';
import { getMenuAdminData } from '@/lib/queries/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Menu & Stok',
};

export default async function MenuAdminPage() {
  await requireStaff(['owner']);
  const data = await getMenuAdminData();
  return <MenuManager data={data} />;
}
