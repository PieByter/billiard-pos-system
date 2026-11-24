import type { Metadata } from 'next';
import { CashierBoard } from '@/components/cashier/cashier-board';
import { requireStaff } from '@/lib/auth';
import { getCashierData } from '@/lib/queries/cashier';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kasir · Meja',
};

export default async function CashierPage() {
  const staff = await requireStaff(['cashier', 'owner']);
  const data = await getCashierData();
  return <CashierBoard data={data} staff={{ name: staff.name, role: staff.role }} />;
}
