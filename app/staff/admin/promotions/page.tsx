import type { Metadata } from 'next';
import { PromotionManager } from '@/components/admin/promotion-manager';
import { requireStaff } from '@/lib/auth';
import { getPromotionsAdminData } from '@/lib/queries/membership';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Promo & Voucher',
};

export default async function PromotionsPage() {
  await requireStaff(['owner']);
  const data = await getPromotionsAdminData();
  return <PromotionManager data={data} />;
}
