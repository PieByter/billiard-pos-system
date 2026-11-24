import { VENUE_TIMEZONE } from './constants';

export { formatCompactRp, formatDuration, formatRp } from './billing';

export function formatClock(date: Date | string, withWib = true): string {
  const value = new Date(date);
  const text = new Intl.DateTimeFormat('id-ID', {
    timeZone: VENUE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
  return withWib ? `${text} WIB` : text;
}

export function formatTimeWithSeconds(date: Date | string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: VENUE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

export function formatDate(date: Date | string, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: VENUE_TIMEZONE,
    day: '2-digit',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)} • ${formatClock(date)}`;
}

export function formatRelative(date: Date | string, now = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(date).getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec} dtk lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} mnt lalu`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} jam lalu`;
  const day = Math.floor(hour / 24);
  return `${day} hari lalu`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}
