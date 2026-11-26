import type { Metadata } from 'next';
import { NotificationManager } from '@/components/admin/notification-manager';
import { requireStaff } from '@/lib/auth';
import { getNotificationsData } from '@/lib/services/notifications';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'E-receipt & Notifikasi',
};

export default async function NotificationsPage() {
  await requireStaff(['owner']);
  const data = await getNotificationsData();
  return <NotificationManager data={data} />;
}
