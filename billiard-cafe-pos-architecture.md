# Arsitektur: POS Billiard + Cafe (Next.js + Supabase + Drizzle di Vercel)

Dokumen ini berisi rancangan dan kode inti untuk sistem kasir dan pemesanan makanan untuk venue billiard + cafe.

**Kebutuhan utama**
- Kasir untuk billiard (sesi berbasis durasi) dan cafe (order makanan/minuman)
- Pemesanan makanan oleh customer sendiri (QR) atau dipesankan kasir
- Meja billiard: pemesanan hanya lewat kasir
- Stack: Next.js, Supabase (Postgres + Auth + Realtime), Drizzle ORM, deploy di Vercel

---

## 1. Model domain

Unit pembayaran adalah **bill**, bukan order atau sesi billiard. Sesi billiard menghasilkan satu line item (durasi × tarif), sedangkan order makanan menghasilkan line item lain, dan keduanya masuk ke satu bill. Ini memudahkan split bill, pindah meja, dan laporan.

```
venue_tables ─┬─ bills (1 open per table) ─┬─ billiard_sessions (0..n)
              │                            ├─ orders ── order_items
              │                            └─ payments
menu_categories ── menu_items
profiles (staff, role) · audit_log
```

**Aturan bisnis ("billiard hanya lewat kasir") dienforce di server, bukan di UI.** Gunakan flag `allow_self_order` per meja, bukan hardcode `kind = 'billiard'`. Jika besok ada meja VIP billiard yang boleh self-order, cukup ubah satu baris data.

---

## 2. Skema Drizzle

Pakai `casing: 'snake_case'` di `drizzle.config.ts` dan di `drizzle()`.

```ts
// db/schema.ts
import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, text, integer, boolean, timestamp, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['owner', 'cashier', 'kitchen']);
export const tableKind = pgEnum('table_kind', ['billiard', 'cafe']);
export const sessionStatus = pgEnum('session_status', ['running', 'paused', 'finished']);
export const billStatus = pgEnum('bill_status', ['open', 'paid', 'void']);
export const orderSource = pgEnum('order_source', ['customer_qr', 'cashier']);
export const orderStatus = pgEnum('order_status', ['pending', 'accepted', 'preparing', 'ready', 'served', 'cancelled']);
export const payMethod = pgEnum('pay_method', ['cash', 'qris', 'transfer']);

export const profiles = pgTable('profiles', {
  id: uuid().primaryKey(), // = auth.users.id
  name: text().notNull(),
  role: roleEnum().notNull(),
}).enableRLS();

export const billiardRates = pgTable('billiard_rates', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  pricePerHour: integer().notNull(),        // rupiah, integer. Jangan float.
  minMinutes: integer().notNull().default(30),
  incrementMinutes: integer().notNull().default(15),
}).enableRLS();

export const venueTables = pgTable('venue_tables', {
  id: uuid().primaryKey().defaultRandom(),
  code: text().notNull().unique(),          // "B1", "C7"
  kind: tableKind().notNull(),
  allowSelfOrder: boolean().notNull().default(false),
  qrToken: text().notNull().unique(),       // random 128-bit, bukan id
  rateId: uuid().references(() => billiardRates.id),
}).enableRLS();

export const bills = pgTable('bills', {
  id: uuid().primaryKey().defaultRandom(),
  tableId: uuid().notNull().references(() => venueTables.id),
  status: billStatus().notNull().default('open'),
  subtotal: integer(), taxAmount: integer(), total: integer(), // diisi saat close
  taxRateBps: integer(),                    // snapshot, mis. 1000 = PB1 10%
  openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp({ withTimezone: true }),
}, (t) => [
  uniqueIndex('one_open_bill_per_table').on(t.tableId).where(sql`${t.status} = 'open'`),
]).enableRLS();

export const billiardSessions = pgTable('billiard_sessions', {
  id: uuid().primaryKey().defaultRandom(),
  billId: uuid().notNull().references(() => bills.id),
  tableId: uuid().notNull().references(() => venueTables.id),
  status: sessionStatus().notNull().default('running'),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  pausedAt: timestamp({ withTimezone: true }),
  pausedSeconds: integer().notNull().default(0),
  endedAt: timestamp({ withTimezone: true }),
  // snapshot tarif: ubah master rate tidak boleh mengubah sesi berjalan
  ratePerHour: integer().notNull(),
  minMinutes: integer().notNull(),
  incrementMinutes: integer().notNull(),
  amount: integer(),                        // final saat finish
}, (t) => [
  uniqueIndex('one_active_session_per_table').on(t.tableId).where(sql`${t.status} <> 'finished'`),
]).enableRLS();

export const menuItems = pgTable('menu_items', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  price: integer().notNull(),
  isAvailable: boolean().notNull().default(true),
  stock: integer(),                         // null = tidak dilacak
  station: text().notNull().default('kitchen'), // kitchen | bar
}).enableRLS();

export const orders = pgTable('orders', {
  id: uuid().primaryKey().defaultRandom(),
  billId: uuid().notNull().references(() => bills.id),
  source: orderSource().notNull(),
  status: orderStatus().notNull().default('pending'),
  idempotencyKey: text().notNull().unique(),
  placedBy: uuid().references(() => profiles.id), // null jika customer
  note: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('orders_status_idx').on(t.status, t.createdAt)]).enableRLS();

export const orderItems = pgTable('order_items', {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid().notNull().references(() => orders.id, { onDelete: 'cascade' }),
  menuItemId: uuid().notNull().references(() => menuItems.id),
  nameSnapshot: text().notNull(),
  priceSnapshot: integer().notNull(),
  qty: integer().notNull(),
  note: text(),
}).enableRLS();

export const payments = pgTable('payments', {
  id: uuid().primaryKey().defaultRandom(),
  billId: uuid().notNull().references(() => bills.id),
  method: payMethod().notNull(),
  amount: integer().notNull(),
  externalRef: text().unique(),             // idempotensi webhook QRIS
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
```

Dua partial unique index (`one_open_bill_per_table` dan `one_active_session_per_table`) adalah pengaman utama. Dua kasir yang menekan "Start" bersamaan, atau dua HP yang scan QR yang sama, tidak bisa membuat sesi atau bill ganda. Race condition ditolak oleh Postgres, bukan oleh kode aplikasi.

---

## 3. Koneksi DB di Vercel

```ts
// db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// DATABASE_URL = Supabase pooler, transaction mode (port 6543)
const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
export const db = drizzle(client, { schema, casing: 'snake_case' });
```

- `prepare: false` wajib untuk transaction pooler, karena prepared statement tidak survive antar koneksi.
- `max: 1` per instance serverless, supaya koneksi tidak habis saat traffic naik.
- `drizzle-kit migrate` pakai `DIRECT_URL` (port 5432), bukan pooler.

---

## 4. Jebakan keamanan: Drizzle bypass RLS

Drizzle konek sebagai role `postgres`, jadi **RLS tidak berlaku untuk query Drizzle**. Konsekuensinya:

1. Semua otorisasi harus ada di layer aplikasi (fungsi `requireStaff()` dan `resolveTableToken()`). Tidak ada fallback dari RLS.
2. Tetap `.enableRLS()` di semua tabel **tanpa policy**. Ini deny-all untuk PostgREST/anon key, yang tetap terekspos publik di Supabase. Tanpa ini, siapa pun dengan anon key bisa `GET /rest/v1/payments`.
3. Untuk Realtime di layar kasir dan dapur, tambahkan policy `SELECT` khusus role `authenticated` yang join ke `profiles`. Jangan beri policy untuk `anon`.

---

## 5. Billing sesi billiard

Hindari tiga hal:

- **Timer server-side.** Vercel tidak punya proses long-running. Simpan `started_at`, hitung saat dibutuhkan.
- **Timestamp dari client.** Pakai `now()` dari DB, bukan `new Date()` di function, supaya clock skew tidak berpengaruh.
- **Float untuk uang.**

```ts
// lib/billing.ts
type Rate = { ratePerHour: number; minMinutes: number; incrementMinutes: number };

export function computeSessionAmount(
  startedAt: Date, endedAt: Date, pausedSeconds: number, r: Rate,
) {
  const elapsedSec = Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 1000 - pausedSeconds);
  const mins = Math.ceil(elapsedSec / 60);
  const billable = Math.max(r.minMinutes, Math.ceil(mins / r.incrementMinutes) * r.incrementMinutes);
  const raw = (billable * r.ratePerHour) / 60;
  return { billableMinutes: billable, amount: Math.round(raw / 500) * 500 }; // bulatkan ke Rp500
}
```

```ts
// actions/billiard.ts
'use server';
export async function startSession(tableId: string) {
  const staff = await requireStaff(['cashier', 'owner']);
  return db.transaction(async (tx) => {
    const [table] = await tx.select().from(venueTables)
      .leftJoin(billiardRates, eq(venueTables.rateId, billiardRates.id))
      .where(and(eq(venueTables.id, tableId), eq(venueTables.kind, 'billiard')));
    if (!table?.billiard_rates) throw new AppError('NO_RATE');

    await tx.insert(bills).values({ tableId }).onConflictDoNothing();
    const [bill] = await tx.select().from(bills)
      .where(and(eq(bills.tableId, tableId), eq(bills.status, 'open')));

    try {
      const [s] = await tx.insert(billiardSessions).values({
        billId: bill.id, tableId,
        ratePerHour: table.billiard_rates.pricePerHour,
        minMinutes: table.billiard_rates.minMinutes,
        incrementMinutes: table.billiard_rates.incrementMinutes,
      }).returning();
      await audit(tx, staff.id, 'session.start', s.id);
      return s;
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError('TABLE_ALREADY_RUNNING');
      throw e;
    }
  });
}
```

Di UI, timer jalan di client dari `startedAt` dikurangi offset server (kirim `serverNow` di tiap response, hitung selisihnya sekali), supaya tampilan tidak melenceng kalau jam HP kasir salah.

---

## 6. Pemesanan makanan: satu use case, dua aktor

Customer (QR) dan kasir memakai fungsi yang sama. Beda aktor hanya mengubah policy dan status awal.

```ts
// lib/orders.ts
type Actor = { type: 'customer' } | { type: 'staff'; id: string };

export async function placeOrder(p: {
  actor: Actor; tableId: string; idemKey: string;
  items: { menuItemId: string; qty: number; note?: string }[];
}) {
  return db.transaction(async (tx) => {
    const dup = await tx.query.orders.findFirst({ where: eq(orders.idempotencyKey, p.idemKey) });
    if (dup) return dup; // double-tap / retry aman

    const [table] = await tx.select().from(venueTables).where(eq(venueTables.id, p.tableId));
    if (!table) throw new AppError('NOT_FOUND');
    if (p.actor.type === 'customer' && !table.allowSelfOrder) throw new AppError('FORBIDDEN');

    // harga SELALU dari DB, jangan percaya payload client
    const ids = [...new Set(p.items.map((i) => i.menuItemId))];
    const menu = await tx.select().from(menuItems)
      .where(and(inArray(menuItems.id, ids), eq(menuItems.isAvailable, true)));
    if (menu.length !== ids.length) throw new AppError('ITEM_UNAVAILABLE');
    const byId = new Map(menu.map((m) => [m.id, m]));

    // stok atomik: tidak bisa oversell walau 2 order bersamaan
    for (const it of p.items) {
      if (byId.get(it.menuItemId)!.stock === null) continue;
      const res = await tx.update(menuItems)
        .set({ stock: sql`${menuItems.stock} - ${it.qty}` })
        .where(and(eq(menuItems.id, it.menuItemId), gte(menuItems.stock, it.qty)))
        .returning({ id: menuItems.id });
      if (!res.length) throw new AppError('OUT_OF_STOCK', it.menuItemId);
    }

    await tx.insert(bills).values({ tableId: table.id }).onConflictDoNothing();
    const [bill] = await tx.select().from(bills)
      .where(and(eq(bills.tableId, table.id), eq(bills.status, 'open')));

    const [order] = await tx.insert(orders).values({
      billId: bill.id,
      idempotencyKey: p.idemKey,
      source: p.actor.type === 'customer' ? 'customer_qr' : 'cashier',
      placedBy: p.actor.type === 'staff' ? p.actor.id : null,
      status: p.actor.type === 'customer' ? 'pending' : 'accepted', // customer perlu di-accept kasir
    }).returning();

    await tx.insert(orderItems).values(p.items.map((i) => ({
      orderId: order.id, menuItemId: i.menuItemId, qty: i.qty, note: i.note,
      nameSnapshot: byId.get(i.menuItemId)!.name,
      priceSnapshot: byId.get(i.menuItemId)!.price,
    })));
    return order;
  });
}
```

Dua entry point tipis:

```ts
// customer: /t/[token] → server action
export async function customerOrder(token: string, input: OrderInput) {
  await rateLimit(`order:${token}`, { max: 5, windowSec: 60 }); // Upstash/Vercel KV
  const table = await resolveTableToken(token);
  return placeOrder({ actor: { type: 'customer' }, tableId: table.id, ...parse(input) });
}

// kasir
export async function cashierOrder(tableId: string, input: OrderInput) {
  const staff = await requireStaff(['cashier', 'owner']);
  return placeOrder({ actor: { type: 'staff', id: staff.id }, tableId, ...parse(input) });
}
```

---

## 7. Failure mode yang perlu diputuskan sejak awal

| Risiko | Mitigasi |
|---|---|
| **QR statis di-scan dari luar venue / diiseng** (order palsu dari rumah) | Status `pending` sampai kasir accept, rate limit per token, Cloudflare Turnstile. Opsi lebih ketat: self-order wajib bayar QRIS dulu (Midtrans/Xendit). |
| **Webhook QRIS dobel atau terlambat** | Verifikasi signature, `payments.external_ref` unique, handler idempoten. |
| **Internet cafe mati** | Kasir tidak bisa transaksi. Minimal: PWA + cache menu read-only, dan SOP manual tertulis. Offline-first penuh (queue + rekonsiliasi) mahal, jangan dibangun di v1. |
| **Printer thermal** | Vercel tidak bisa menjangkau printer di LAN. Opsi: `window.print()` dengan CSS 58/80mm, Web Bluetooth/WebUSB ESC/POS dari browser kasir, atau print agent lokal. Pilih salah satu sejak awal. |
| **Void/diskon tanpa jejak** (sumber kebocoran kasir) | `audit_log` append-only, void dan diskon butuh role `owner` atau PIN supervisor. |
| **Tarif berubah di tengah sesi** | Sudah ditangani lewat snapshot tarif di sesi. Tarif per jam (peak/off-peak) butuh tabel segmen. Itu keputusan produk, bukan teknis. |
| **Realtime customer** | Jangan beri policy `anon` ke Postgres Changes. Untuk status order customer, polling 5 detik atau Broadcast dari server sudah cukup. Realtime Postgres Changes hanya untuk layar staff. |

---

## 8. Struktur app

```
app/
  (staff)/            # middleware: Supabase Auth + role guard
    cashier/          # grid meja, timer, start/pause/move/stop, POS order, bayar
    kitchen/          # antrian per station (Realtime)
    admin/            # menu, tarif, meja, laporan, shift
  t/[token]/          # menu publik + keranjang + status order (tanpa login)
  api/webhooks/payment/route.ts
db/ (schema, migrations)
lib/ (billing, orders, auth, ratelimit)
```

Tambahan yang disarankan:

- **Shift kasir**: tabel `shifts` dengan kas awal, kas akhir, dan selisih.
- **Pindah meja**: pindahkan `bills.table_id` dan tutup sesi lama dengan membuat sesi baru, bukan edit mundur.

---

## 9. Keputusan terbuka yang menentukan skema

**Self-order di cafe: bayar di kasir atau wajib bayar QRIS di muka?**

- *Bayar di kasir*: lebih sederhana, tapi rawan order iseng, jadi butuh langkah accept.
- *QRIS di muka*: hampir menghilangkan order palsu, tapi menambah integrasi payment gateway, webhook, dan alur refund jika stok habis.

## 10. Langkah berikutnya

Setelah keputusan di atas dipilih, scaffold repo lengkap meliputi:

1. Migrations Drizzle
2. Middleware auth + role guard
3. UI kasir (grid meja + timer)
4. Halaman customer `/t/[token]`
5. Layar dapur (Realtime)
