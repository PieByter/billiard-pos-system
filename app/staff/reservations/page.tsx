import type { Metadata } from 'next';
import { ReservationManager } from '@/components/staff/reservation-manager';
import { requireStaff } from '@/lib/auth';
import { getReservationsData } from '@/lib/queries/reservations';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reservasi & Waitlist',
};

export default async function ReservationsPage() {
  await requireStaff(['cashier', 'owner']);
  const data = await getReservationsData();
  return <ReservationManager data={data} />;
}
