import { AdminNav } from '@/components/admin/admin-nav';
import { OutletSwitcher } from '@/components/admin/outlet-switcher';
import { requireStaff } from '@/lib/auth';
import { getOutletContext } from '@/lib/outlet';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff(['owner']);
  const { activeOutletId, outlets } = await getOutletContext();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AdminNav role={staff.role} />
        <OutletSwitcher
          activeOutletId={activeOutletId}
          outlets={outlets.map((outlet) => ({
            id: outlet.id,
            code: outlet.code,
            name: outlet.name,
          }))}
        />
      </div>
      {children}
    </div>
  );
}
