import { count, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orders, profiles, shifts, serviceRequests } from '@/lib/db/schema';
import { requireStaff } from '@/lib/auth';
import { StaffHeader } from '@/components/staff/staff-header';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const db = await getDb();

  const [shiftRow, pendingRow, kdsRow, serviceRow] = await Promise.all([
    db
      .select({ staffName: profiles.name })
      .from(shifts)
      .leftJoin(profiles, eq(shifts.staffId, profiles.id))
      .where(eq(shifts.status, 'open'))
      .limit(1),
    db
      .select({ total: count() })
      .from(orders)
      .where(eq(orders.status, 'pending')),
    db
      .select({ total: count() })
      .from(orders)
      .where(eq(orders.status, 'accepted')),
    db
      .select({ total: count() })
      .from(serviceRequests)
      .where(eq(serviceRequests.status, 'open')),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <StaffHeader
        staff={{ name: staff.name, role: staff.role, email: staff.email }}
        shiftOpen={Boolean(shiftRow[0])}
        shiftStaffName={shiftRow[0]?.staffName ?? null}
        pendingCount={pendingRow[0]?.total ?? 0}
        kdsCount={(kdsRow[0]?.total ?? 0) + (serviceRow[0]?.total ?? 0)}
      />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 pb-28 pt-4 sm:px-4 md:px-6 md:pt-6 lg:pb-10">
        {children}
      </main>
      <footer className="hidden items-center justify-between border-t border-outline-variant/20 px-6 py-3 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/50 lg:flex">
        <span>Cue &amp; Tap · Billiard Hall &amp; Lounge</span>
        <span className="numeric">POS v1.0 · PWA · Supabase</span>
      </footer>
    </div>
  );
}
