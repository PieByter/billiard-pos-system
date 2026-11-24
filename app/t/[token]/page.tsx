import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CustomerApp } from '@/components/customer/customer-app';
import { getCustomerData } from '@/lib/queries/customer';
import { VENUE_NAME } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Menu Meja · ${VENUE_NAME}`,
  description: 'Pesan makanan & minuman langsung dari meja via QR Cue & Tap.',
};

export default async function CustomerTablePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 6 || token.length > 120) notFound();
  const data = await getCustomerData(token);
  if (!data) notFound();
  return <CustomerApp data={data} />;
}
