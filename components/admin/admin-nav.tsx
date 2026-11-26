'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/format';
import { Icon } from '@/components/ui/icon';
import type { ProfileRole } from '@/lib/db/schema';

const ADMIN_TABS = [
  {
    href: '/staff/admin',
    label: 'Ringkasan & Shift',
    short: 'Shift',
    icon: 'account_balance_wallet',
    roles: ['owner'] as ProfileRole[],
  },
  {
    href: '/staff/admin/menu',
    label: 'Menu & Stok',
    short: 'Menu',
    icon: 'restaurant_menu',
    roles: ['owner'] as ProfileRole[],
  },
  {
    href: '/staff/admin/tables',
    label: 'Meja & QR',
    short: 'Meja',
    icon: 'table_restaurant',
    roles: ['owner'] as ProfileRole[],
  },
  {
    href: '/staff/admin/reports',
    label: 'Laporan',
    short: 'Laporan',
    icon: 'monitoring',
    roles: ['owner'] as ProfileRole[],
  },
  {
    href: '/staff/admin/schedules',
    label: 'Jadwal Tarif',
    short: 'Jadwal',
    icon: 'schedule',
    roles: ['owner'] as ProfileRole[],
  },
  {
    href: '/staff/admin/members',
    label: 'Member',
    short: 'Member',
    icon: 'loyalty',
    roles: ['owner'] as ProfileRole[],
  },
  {
    href: '/staff/admin/promotions',
    label: 'Promo',
    short: 'Promo',
    icon: 'sell',
    roles: ['owner'] as ProfileRole[],
  },
  {
    href: '/staff/admin/refunds',
    label: 'Refund',
    short: 'Refund',
    icon: 'undo',
    roles: ['owner'] as ProfileRole[],
  },
  {
    href: '/staff/admin/notifications',
    label: 'Notifikasi',
    short: 'Notif',
    icon: 'notifications',
    roles: ['owner'] as ProfileRole[],
  },
  {
    href: '/staff/admin/staff',
    label: 'Staff',
    short: 'Staff',
    icon: 'badge',
    roles: ['owner'] as ProfileRole[],
  },
  {
    href: '/staff/admin/settings',
    label: 'Pengaturan',
    short: 'Setelan',
    icon: 'settings',
    roles: ['owner'] as ProfileRole[],
  },
];

export function AdminNav({ role }: { role: ProfileRole }) {
  const pathname = usePathname();
  const items = ADMIN_TABS.filter((item) => item.roles.includes(role));

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-outline-variant/20 bg-surface-container-lowest/60 p-1 no-scrollbar">
      {items.map((item) => {
        const active =
          item.href === '/staff/admin'
            ? pathname === '/staff/admin'
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-body-sm font-semibold transition-all',
              active
                ? 'bg-surface-container-high text-primary'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
            )}
          >
            <Icon name={item.icon} className="text-[18px]" />
            <span className="hidden sm:inline">{item.label}</span>
            <span className="sm:hidden">{item.short}</span>
          </Link>
        );
      })}
    </div>
  );
}
