'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/format';
import { Icon } from '@/components/ui/icon';
import type { ProfileRole } from '@/lib/db/schema';

const NAV_ITEMS = [
  {
    href: '/staff/cashier',
    label: 'Kasir',
    short: 'Kasir',
    icon: 'point_of_sale',
    roles: ['owner', 'cashier'] as ProfileRole[],
  },
  {
    href: '/staff/reservations',
    label: 'Reservasi',
    short: 'Booking',
    icon: 'event_available',
    roles: ['owner', 'cashier'] as ProfileRole[],
  },
  {
    href: '/staff/kitchen',
    label: 'Kitchen Display',
    short: 'KDS',
    icon: 'skillet',
    roles: ['owner', 'cashier', 'kitchen'] as ProfileRole[],
  },
  {
    href: '/staff/admin',
    label: 'Admin & Shift',
    short: 'Admin',
    icon: 'admin_panel_settings',
    roles: ['owner'] as ProfileRole[],
  },
];

function useVisibleItems(role: ProfileRole) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function StaffDesktopNav({
  role,
  pendingCount,
  kdsCount,
}: {
  role: ProfileRole;
  pendingCount: number;
  kdsCount: number;
}) {
  const pathname = usePathname();
  const items = useVisibleItems(role);

  return (
    <nav className="hidden items-center gap-1 rounded-xl border border-outline-variant/25 bg-surface-container-lowest/70 p-1 lg:flex">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        const badge =
          item.href === '/staff/kitchen' ? kdsCount : item.href === '/staff/cashier' ? pendingCount : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'group relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-body-sm font-semibold transition-all',
              active
                ? 'bg-surface-container-high text-primary shadow-[0_8px_20px_-12px_rgba(0,0,0,0.9)]'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
            )}
          >
            <Icon
              name={item.icon}
              className={cn('text-[18px]', active ? 'text-primary' : 'text-outline group-hover:text-on-surface-variant')}
            />
            <span>{item.label}</span>
            {badge > 0 ? (
              <span
                className={cn(
                  'numeric ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
                  item.href === '/staff/cashier'
                    ? 'bg-error/20 text-error'
                    : 'bg-secondary/20 text-secondary',
                )}
              >
                {badge}
              </span>
            ) : null}
            {active ? (
              <span className="absolute inset-x-3 -bottom-[7px] h-[2px] rounded-full bg-primary/70" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function StaffMobileNav({
  role,
  pendingCount,
  kdsCount,
}: {
  role: ProfileRole;
  pendingCount: number;
  kdsCount: number;
}) {
  const pathname = usePathname();
  const items = useVisibleItems(role);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant/30 bg-background/90 backdrop-blur-xl lg:hidden">
      <div className="safe-bottom mx-auto flex max-w-lg items-stretch justify-around px-3 pt-1.5">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const badge =
            item.href === '/staff/kitchen'
              ? kdsCount
              : item.href === '/staff/cashier'
                ? pendingCount
                : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex min-w-[76px] flex-col items-center gap-1 rounded-lg px-3 py-1.5 transition-colors',
                active ? 'text-primary' : 'text-on-surface-variant',
              )}
            >
              <span className="relative">
                <Icon name={item.icon} filled={active} className="text-[22px]" />
                {badge > 0 ? (
                  <span className="numeric absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-on-error">
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider">{item.short}</span>
              {active ? (
                <span className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-primary" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
