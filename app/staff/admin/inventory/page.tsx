import type { Metadata } from 'next';
import { InventoryManager } from '@/components/admin/inventory-manager';
import { requireStaff } from '@/lib/auth';
import { getInventoryData } from '@/lib/services/inventory';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bahan & Stok',
};

export default async function InventoryPage() {
  await requireStaff(['owner']);
  const data = await getInventoryData();
  return <InventoryManager data={data} />;
}
