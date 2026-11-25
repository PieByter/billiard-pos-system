export const VENUE_NAME = 'Cue & Tap';
export const VENUE_TAGLINE = 'Billiard Hall & Lounge';
export const DEPOSIT_LABEL =
  'Order digabung ke bill meja. Pembayaran dilakukan di kasir setelah sesi/order selesai.';
export const VENUE_TIMEZONE = 'Asia/Jakarta';
export const TAX_RATE_BPS = 1000;
export const SERVICE_RATE_BPS = 500;
export const CURRENCY = 'IDR';

export const DEMO_PASSWORD = 'demo1234';

export const DEMO_ACCOUNTS = [
  {
    email: 'owner@cuetap.id',
    name: 'Hendra Wijaya',
    role: 'owner' as const,
    label: 'Owner',
    description: 'Akses penuh, laporan, diskon, void',
  },
  {
    email: 'kasir@cuetap.id',
    name: 'Budi Santoso',
    role: 'cashier' as const,
    label: 'Kasir',
    description: 'Meja, order, pembayaran, shift',
  },
  {
    email: 'dapur@cuetap.id',
    name: 'Reno Pratama',
    role: 'kitchen' as const,
    label: 'Kitchen',
    description: 'Kitchen Display System',
  },
];

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  cashier: 'Kasir',
  kitchen: 'Kitchen',
};

export const TABLE_KIND_LABELS: Record<string, string> = {
  billiard: 'Billiard',
  cafe: 'Cafe & Lounge',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Menunggu Approval',
  accepted: 'Baru Masuk',
  preparing: 'Sedang Dimasak',
  ready: 'Siap Antar',
  served: 'Disajikan',
  cancelled: 'Dibatalkan',
};

export const PAY_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  qris: 'QRIS',
  transfer: 'Transfer',
  edc: 'Kartu / EDC',
};

export const STATION_LABELS: Record<string, string> = {
  kitchen: 'Kitchen',
  bar: 'Bar',
};

export const SESSION_STATUS_LABELS: Record<string, string> = {
  running: 'Running',
  paused: 'Paused',
  finished: 'Finished',
};

export const WAITER_TYPE_LABELS: Record<string, string> = {
  waiter: 'Panggil waiter',
  bill: 'Minta bill',
  assistance: 'Butuh bantuan',
};

/** Prefix untuk reference number yang human-readable. */
export const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
