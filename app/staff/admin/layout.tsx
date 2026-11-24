import { AdminNav } from '@/components/admin/admin-nav';
import { requireStaff } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff(['owner']);
  return (
    <div className="flex flex-col gap-4">
      <AdminNav role={staff.role} />
      {children}
    </div>
  );
}
