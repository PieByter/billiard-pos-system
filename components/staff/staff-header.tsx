import Link from 'next/link';
import { logoutAction } from '@/app/actions/auth';
import { Logo } from '@/components/ui/logo';
import { Icon } from '@/components/ui/icon';
import { LiveClock } from '@/components/live/live';
import { initials } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/constants';
import type { ProfileRole } from '@/lib/db/schema';
import { StaffDesktopNav, StaffMobileNav } from './staff-nav';

export function StaffHeader({
  staff,
  shiftOpen,
  shiftStaffName,
  pendingCount,
  kdsCount,
}: {
  staff: { name: string; role: ProfileRole; email: string };
  shiftOpen: boolean;
  shiftStaffName: string | null;
  pendingCount: number;
  kdsCount: number;
}) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-outline-variant/25 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] w-full max-w-[1600px] items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-5">
            <Link href="/staff/cashier" className="shrink-0">
              <Logo size={36} withWordmark />
            </Link>
            <StaffDesktopNav role={staff.role} pendingCount={pendingCount} kdsCount={kdsCount} />
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-outline-variant/35 bg-surface-container-lowest/70 px-3 py-1.5 xl:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-label-badge font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                Live Sync
              </span>
            </div>

            <div className="hidden flex-col items-end leading-none md:flex">
              <LiveClock className="text-body-md font-semibold text-on-surface" />
              <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-on-surface-variant/70">
                Waktu venue
              </span>
            </div>

            <div
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-label-badge font-bold uppercase tracking-wider sm:flex ${
                shiftOpen
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-tertiary/30 bg-tertiary/10 text-tertiary'
              }`}
              title={shiftOpen ? `Shift oleh ${shiftStaffName}` : 'Belum ada shift terbuka'}
            >
              <span className={`h-1.5 w-1.5 rounded-full bg-current ${shiftOpen ? 'animate-pulse' : ''}`} />
              {shiftOpen ? 'Shift open' : 'No shift'}
            </div>

            <div className="hidden h-8 w-px bg-outline-variant/30 md:block" />

            <div className="flex items-center gap-2">
              <div className="hidden text-right md:block">
                <div className="max-w-[140px] truncate text-body-sm font-bold text-on-surface">
                  {staff.name}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-primary/90">
                  {ROLE_LABELS[staff.role]}
                </div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-secondary/25 bg-secondary/15 text-body-sm font-extrabold text-secondary">
                {initials(staff.name)}
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  title="Keluar"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant/35 bg-surface-container-low text-on-surface-variant transition-colors hover:border-error/30 hover:bg-error/10 hover:text-error"
                >
                  <Icon name="logout" className="text-[18px]" />
                </button>
              </form>
            </div>
          </div>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      </header>
      <StaffMobileNav role={staff.role} pendingCount={pendingCount} kdsCount={kdsCount} />
    </>
  );
}
