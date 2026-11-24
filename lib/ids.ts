import { ID_ALPHABET } from './constants';

export function randomToken(bytes = 18): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomCode(length = 6): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

export function randomDigits(length = 4): string {
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (value) => String(value % 10)).join('');
}

export function yymmdd(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

export function billNumber(date = new Date()): string {
  return `BLL-${yymmdd(date)}-${randomDigits(4)}`;
}

export function orderNumber(): string {
  return `ORD-${randomDigits(8)}`;
}

export function serviceRequestNumber(): string {
  return `REQ-${randomDigits(5)}`;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
