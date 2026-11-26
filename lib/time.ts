export function minutesToTime(minutes: number): string {
  const safe = Math.max(0, Math.min(1440, Math.round(minutes)));
  const hh = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  const mm = (safe % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Parse HH:MM menjadi menit sejak 00:00, atau null jika tidak valid. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}
