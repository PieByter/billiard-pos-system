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

> **Status:** kelima langkah di atas sudah diimplementasi di v1. Mulai bagian 11, daftar di bawah adalah backlog resmi pengembangan berikutnya; item **#1 dan #2 sudah selesai di v1.1**.

---

## 11. Roadmap fitur lanjutan

Dokumen ini memakai urutan prioritas operasional: **benarkan uang dan akses dulu, baru optimasi revenue, lalu kedalaman operasional, terakhir skala teknis.** Setiap item wajib mengikuti Definition of Done di §11.7.

**Status implementasi:** item **#1 (refund manual)**, **#2 (staff & venue settings)**, **#3 (jadwal tarif)**, **#4 (reservasi/waitlist)**, **#5 (split bill per item)**, **#6 (QRIS dinamis)**, **#7 (member & loyalty)**, dan **#8 (promo engine)** sudah diimplementasi di v1.1 (beberapa bagian masih parsial sesuai catatan item). Sisa item masih backlog.

### 11.1 Fase 1 — Operasional harian

#### 1. Refund / void setelah pembayaran
**Status:** selesai sebagian (refund manual v1.1; refund gateway menyusul di #6) · **Prioritas:** P0 · **Dependensi:** —

**Masalah:** `voidBill` menolak bill yang sudah memiliki payment dan menyebut “refund flow”, tetapi flow refund belum ada. Kasir tidak punya jalur resmi untuk membatalkan transaksi yang sudah lunas.

**Scope:**
- Refund penuh atau sebagian, terhubung ke `payments` asal.
- Metode refund: cash, QRIS/transfer (via gateway bila ada), atau koreksi manual owner.
- Alasan wajib, approval owner/supervisor, dan opsi mengembalikan stok.
- Dampak ke laporan omzet, shift cash expected, dan struk.
- Refund tidak boleh melebihi nilai payment asal dan harus idempoten.

**Acceptance criteria:**
- Owner bisa refund 1 payment penuh/sebagian; refund tercatat di `refunds` dan audit log.
- Bill tetap `paid` dengan `refundedAmount`; laporan memakai omzet neto.
- Refund cash mengurangi expected cash shift secara proporsional.
- Refund gateway memanggil provider refund API dan menangani webhook gagal/duplikat.
- Tidak bisa refund dua kali untuk payment yang sama melebihi nominal.

**Dampak skema:** tabel `refunds` (`billId`, `paymentId`, `amount`, `category`, `reason`, `restocked`, `approvedBy`, `externalRef`, `createdAt`); kolom agregat `bills.refundedAmount`; status payment/refund.

**Implementasi v1.1:** `/staff/admin/refunds`, `lib/services/refunds.ts`, `refundPaymentAction` (owner-only), laporan neto, expected cash shift, struk bill, audit `bill.refunded`. Refund gateway belum; UI menandai refund manual.

#### 2. Staff management & venue settings
**Status:** selesai sebagian (v1.1; invite email & jam buka/tutup belum) · **Prioritas:** P0 · **Dependensi:** Supabase service role / invite flow

**Masalah:** staff masih di-provision lewat seed/SQL, dan pajak/service charge/jam operasional belum bisa diubah owner dari UI.

**Scope:**
- CRUD staff: nama, email, role (`owner|cashier|kitchen`), aktif/nonaktif, reset akses.
- Undang staff via Supabase Auth invite; mode demo memakai password hash lokal.
- Cegah menonaktifkan owner terakhir atau diri sendiri.
- Halaman settings venue: nama, alamat, timezone, jam buka/tutup, PB1, service charge, footer struk, warning menit.
- Perubahan settings hanya memengaruhi bill baru; bill berjalan tetap memakai snapshot.

**Acceptance criteria:**
- Owner bisa menambah staff dan staff langsung bisa login setelah auth user aktif.
- Staff nonaktif tidak bisa login dan sesi lama ditolak.
- Semua perubahan staff/settings masuk audit log.
- Bill baru memakai tarif pajak/service terbaru; bill lama tidak berubah.

**Dampak skema:** tabel `venue_settings` (singleton per outlet), perluasan `profiles` bila perlu; provisioning auth di server action dengan service role.

**Implementasi v1.1:** `/staff/admin/staff` dan `/staff/admin/settings`, `lib/services/staff.ts`, `lib/services/settings.ts`, `venue_settings` (PB1/service/warning/footer), provisioning Supabase Auth via service role, snapshot pajak/service di `ensureOpenBill`. Invite email dan jam buka/tutup belum.

#### 3. Peak/off-peak rate otomatis
**Status:** selesai sebagian (v1.1; holiday override belum) · **Prioritas:** P1 · **Dependensi:** #2 settings

**Masalah:** `billiard_rates` masih satu tarif per meja. “Happy Hour” hanya nama rate yang di-assign manual, belum otomatis berdasarkan jam/hari.

**Scope:**
- Jadwal tarif per meja: hari dalam minggu, jam mulai/selesai, rate, prioritas, aktif.
- Resolusi tarif saat `startSession` memakai timezone `Asia/Jakarta`; fallback ke `venue_tables.rateId`.
- Preview tarif yang akan dipakai di dialog start.
- Snapshot tarif tetap berlaku selama sesi; perubahan jadwal tidak mengubah sesi berjalan.
- Dukungan override hari libur (opsional fase berikutnya).

**Acceptance criteria:**
- Sesi yang mulai 16:59 dan 17:01 memakai rate yang benar pada batas jadwal.
- Dua jadwal overlap ditolak atau diselesaikan oleh prioritas yang eksplisit.
- Tidak ada perubahan tarif di tengah sesi.
- Unit test resolusi jadwal + integration test start sesi.

**Dampak skema:** tabel `table_rate_schedules` (`tableId`, `rateId`, `daysOfWeek`, `startMinute`, `endMinute`, `priority`, `active`).

**Implementasi v1.1:** `/staff/admin/schedules`, `lib/services/rate-schedules.ts`, `resolveRateForTable` dipakai `startBilliardSession`, preview tarif di dialog start, seed B7 17:00–23:00. Jadwal lintas tengah malam dan override hari libur belum.

#### 4. Reservation & waitlist
**Status:** selesai sebagian (v1.1; deposit belum masuk ledger payment) · **Prioritas:** P1 · **Dependensi:** #2, #3

**Masalah:** meja hanya bisa dipakai walk-in; belum ada booking, deposit, atau antrean.

**Scope:**
- Reservasi: meja, nama/telepon, tanggal & jam mulai, durasi, jumlah pax, deposit, catatan, status.
- Cek bentrok dengan sesi berjalan + buffer cleaning.
- Check-in → mulai sesi/buka bill; no-show → lepas meja.
- Waitlist walk-in: antrean, estimasi tunggu, panggil tamu.
- Deposit masuk payment/bill atau ditahan terpisah; refund mengikuti kebijakan.

**Acceptance criteria:**
- Tidak bisa double-book meja pada rentang waktu yang sama.
- Reservasi bisa dikonversi menjadi sesi tanpa membuat bill ganda.
- No-show dan pembatalan tercatat di audit.
- Waitlist bisa dipanggil dan ditandai datang/batal.

**Dampak skema:** `reservations`, `waitlist_entries`, relasi opsional ke `bills`/`payments`.

**Implementasi v1.1:** `/staff/reservations`, `lib/services/reservations.ts`, cek overlap, deposit status (pending/paid/refunded/forfeited), check-in membuat sesi/bill, waitlist waiting → called → seated. Deposit belum masuk ledger `payments`; integrasi kas/payment menyusul.

#### 5. Split bill per item/seat
**Status:** selesai sebagian (v1.1; refund per split belum) · **Prioritas:** P1 · **Dependensi:** #1

**Masalah:** split bill saat ini hanya per metode pembayaran. Rombongan tidak bisa membagi per item atau per pemain.

**Scope:**
- Alokasi item/sesi ke beberapa split group (seat/pemain).
- Pembayaran parsial per group; bill baru ditutup setelah semua group lunas.
- Tampilkan sisa belum teralokasi dan validasi total alokasi = total bill.
- Struk per split group.
- Refund mengikuti payment/group asal.

**Acceptance criteria:**
- Satu item tidak bisa dialokasikan dua kali.
- Total alokasi + pajak/service = total bill.
- Pembayaran parsial tidak menutup bill sampai lunas.
- Split group dan pembayaran tercatat di audit.

**Dampak skema:** `bill_splits`, `bill_split_items`, `payments.bill_split_id` (payment → group), alokasi item/sesi per group.

**Implementasi v1.1:** `/staff/cashier/split/[billId]`, `bill_splits`, `bill_split_items`, `payments.bill_split_id`, alokasi proporsional PB1/service, pembayaran parsial per group, struk `/print/split/[splitId]`. Refund langsung per split belum; refund bill tetap di Admin → Refund.

### 11.2 Fase 2 — Revenue & guest experience

#### 6. Payment gateway QRIS
**Status:** selesai sebagian (v1.1; refund API gateway belum di UI) · **Prioritas:** P1 · **Dependensi:** #1, kredensial provider

**Scope:**
- Adapter provider (Midtrans/Xendit) dengan interface `createCharge`, `getStatus`, `refund`.
- QR dinamis per bill/split, expiry, polling status, webhook idempotent.
- Simpan `provider`, `providerRef`, `status`, `paidAt`; rekonsiliasi otomatis.
- Refund otomatis lewat provider; fallback manual bila gagal.
- Mode sandbox + panduan production.

**Acceptance criteria:**
- Charge QRIS bisa dibuat dan dibayar di sandbox end-to-end.
- Webhook dobel tidak membuat payment ganda.
- Nominal/expiry/refund tervalidasi.
- Reconciliation report mencocokkan payment gateway vs bill.

**Implementasi v1.1:** `/api/webhooks/payment/gateway`, `payment_intents` + `lib/payments/gateway.ts` (mock/Midtrans/Xendit), dialog QRIS dinamis di kasir, polling status, webhook auto-settlement, env `PAYMENT_GATEWAY`. QRIS dinamis saat ini untuk bill non-split; group split masih manual. Refund gateway adapter sudah ada tetapi belum diaktifkan di UI.

#### 7. Membership & loyalty
**Status:** selesai sebagian (v1.1; redeem/voucher/deposit belum) · **Prioritas:** P2 · **Dependensi:** #2

**Scope:**
- Profil member (nama, telepon/email unik, consent).
- Tier harga, poin earn/redeem, voucher, deposit saldo.
- Link bill ke member; lookup cepat di kasir.
- Ledger poin append-only; poin tidak boleh negatif.
- Riwayat kunjungan dan total belanja.

**Acceptance criteria:**
- Poin bertambah saat bill lunas dan berkurang saat redeem, idempoten.
- Tier pricing diterapkan sebelum pajak/service.
- Member bisa dicari via telepon/email.
- Data pribadi tidak bocor ke endpoint publik.

**Dampak skema:** `members`, `member_tiers`, `loyalty_ledger`, `vouchers`, `member_deposits`.

**Implementasi v1.1:** `/staff/admin/members`, MemberDialog di kasir, tier otomatis dari total spend, diskon tier di bill, poin earn idempoten lewat `loyalty_ledger`. Redeem poin, voucher, dan deposit saldo belum.

#### 8. Promo engine
**Status:** selesai sebagian (v1.1; bundle/happy hour/stacking belum) · **Prioritas:** P2 · **Dependensi:** #7

**Scope:**
- Promo code, bundle, minimum spend, diskon per kategori/menu, happy hour otomatis.
- Aturan stacking, batas pemakaian, kuota per member.
- Preview dampak ke bill dan audit redemption.
- Promo tidak boleh membuat total negatif.

**Acceptance criteria:**
- Promo valid mengurangi total sesuai aturan dan tercatat.
- Promo kedaluwarsa/kuota habis ditolak.
- Tidak bisa double-redeem.
- Laporan memisahkan omzet kotor, diskon, dan omzet neto.

**Dampak skema:** `promotions`, `promotion_rules`, `promotion_redemptions`.

**Implementasi v1.1:** `/staff/admin/promotions`, PromoDialog di kasir, kode persen/nominal, min spend, max diskon, kuota, masa berlaku, cakupan all/billiard/fnb, member-only. Kuota bertambah saat bill lunas. Bundle/stacking/happy hour otomatis belum.

#### 9. E-receipt & notifikasi
**Status:** belum dimulai · **Prioritas:** P2 · **Dependensi:** #6

**Scope:**
- Outbox notifikasi (WhatsApp Cloud API/email) dengan retry.
- Kirim struk digital, link bill, dan notifikasi “order siap”.
- Opt-in/opt-out dan template pesan.
- Status kirim/gagal terlihat di admin.

**Acceptance criteria:**
- Struk terkirim setelah bill lunas tanpa menahan alur kasir.
- Retry tidak mengirim duplikat.
- Opt-out dihormati.
- Tidak ada data sensitif di log.

**Dampak skema:** `notification_outbox`, `member_contacts`/consent.

#### 10. Customer experience lanjutan
**Status:** belum dimulai · **Prioritas:** P2 · **Dependensi:** #9

**Scope:**
- Favorit/reorder, estimasi waktu saji, tracker timeline lebih kaya.
- Web push untuk “order siap” dan “waiter datang”.
- Rating/feedback setelah bayar.
- Riwayat order terakhir via token meja.

**Acceptance criteria:**
- Tamu bisa reorder tanpa login.
- Push hanya dikirim dengan izin.
- Tracking tetap bekerja saat offline read-only.

### 11.3 Fase 3 — Kedalaman operasional

#### 11. Inventory & BOM
**Status:** belum dimulai · **Prioritas:** P2 · **Dependensi:** #2

**Scope:**
- Bahan baku, resep per menu, konversi satuan, supplier, purchase order, stock opname.
- Auto-deduct stok bahan saat order; low-stock alert.
- Stock movement append-only; koreksi manual dengan alasan.
- Kebijakan stok negatif eksplisit (block/warn).

**Acceptance criteria:**
- Order mengurangi bahan sesuai resep secara atomik.
- Oversell bahan dicegah atau diberi warning sesuai kebijakan.
- PO dan opname menyesuaikan stok dengan audit.
- Laporan cost of goods tersedia.

**Dampak skema:** `ingredients`, `recipes`, `stock_movements`, `suppliers`, `purchase_orders`, `stock_counts`.

#### 12. Maintenance cue & alat
**Status:** belum dimulai · **Prioritas:** P3 · **Dependensi:** #11

**Scope:**
- Inventaris cue/meja/peralatan, jadwal re-tipping, servis, dan log kerusakan.
- Reminder jatuh tempo; biaya perawatan; vendor.
- Status meja “maintenance” yang memblokir start sesi.

**Acceptance criteria:**
- Meja maintenance tidak bisa dipakai.
- Riwayat servis per aset tercatat.
- Reminder muncul di admin.

**Dampak skema:** `assets`, `maintenance_schedules`, `maintenance_logs`.

#### 13. Kas & shift lanjutan
**Status:** belum dimulai · **Prioritas:** P2 · **Dependensi:** #1

**Scope:**
- Cash drop, petty cash, transfer kas antar shift, koreksi kas.
- Alasan selisih wajib; approval owner untuk koreksi besar.
- Rumus expected cash mempertimbangkan refund, drop, dan petty cash.
- X/Z report menampilkan movement kas, bukan hanya total.

**Acceptance criteria:**
- Setiap movement kas memiliki bukti/aktor/alasan.
- Expected cash selalu dapat direkonsiliasi.
- Tidak bisa menutup shift dengan movement pending.
- Laporan kas cocok dengan laci fisik.

**Dampak skema:** `cash_movements`, `shift_handovers`.

#### 14. Multi-outlet
**Status:** belum dimulai · **Prioritas:** P3 · **Dependensi:** #2, arsitektur auth

**Scope:**
- Tabel `outlets`; `outletId` di seluruh data operasional.
- Staff bisa di-assign ke satu/beberapa outlet.
- Harga, menu, meja, shift, laporan per outlet.
- RLS dan server action wajib memfilter outlet.
- Switch outlet untuk owner.

**Acceptance criteria:**
- Data antar-outlet tidak bocor.
- Laporan dan shift terisolasi.
- Owner bisa berpindah outlet tanpa logout.
- Migration data lama masuk ke outlet default.

### 11.4 Fase 4 — Teknis & skala

#### 15. Go-live production
**Status:** belum dimulai · **Prioritas:** P0 sebelum operasi nyata · **Dependensi:** kredensial Supabase/Vercel

**Scope:**
- Deploy Vercel + Supabase, env production, migration + seed katalog.
- Provision Supabase Auth, matikan signup publik, rotate password demo.
- Jalankan `supabase/realtime.sql`, set `NEXT_PUBLIC_APP_URL`.
- Backup otomatis, monitoring uptime, alert error, rollback plan.
- Smoke test `/api/health`, login role, QR, print, webhook.

**Acceptance criteria:**
- Semua checklist QA di README lulus di production.
- Health check `{ ok: true }` dan tidak ada error log kritis.
- Backup & restore pernah diuji.
- Domain final dipakai di QR.

#### 16. CI/CD + E2E test
**Status:** belum dimulai · **Prioritas:** P1 · **Dependensi:** #15

**Scope:**
- GitHub Actions: install, typecheck, unit test, build.
- E2E Playwright: login, start/pause/stop/pay, self-order → approve → KDS, split, refund.
- Seed PGlite terisolasi; artifact screenshot/video saat gagal.
- Branch protection + preview deployment.

**Acceptance criteria:**
- PR tidak bisa merge jika typecheck/test/build/E2E gagal.
- E2E berjalan < 10 menit dan stabil.
- Preview deployment teruji sebelum merge.

#### 17. Offline write queue
**Status:** belum dimulai · **Prioritas:** P3 · **Dependensi:** #16

**Scope:**
- IndexedDB queue untuk order/payment saat offline.
- Idempotency key + replay + conflict resolution.
- UI indikator pending/sync/gagal.
- Kebijakan konflik: tolak, gabung, atau minta kasir review.
- Keamanan: data antrean tidak boleh terbaca user lain di perangkat shared.

**Acceptance criteria:**
- Order offline tidak dobel saat koneksi kembali.
- Konflik stok/harga ditangani eksplisit.
- Kasir melihat status sinkronisasi.
- Tidak ada payment yang “hilang” tanpa jejak.

#### 18. ESC/POS langsung
**Status:** belum dimulai · **Prioritas:** P3 · **Dependensi:** print agent lokal

**Scope:**
- Print agent lokal (Node) atau WebUSB/Web Bluetooth.
- Template struk, tiket kitchen, X/Z report; antrean print + retry.
- Printer per station; test print; fallback `window.print()`.
- Encoding karakter Indonesia dan logo.

**Acceptance criteria:**
- Cetak 80mm tanpa dialog browser.
- Print gagal tidak menggandakan tiket.
- Bisa pilih printer per station.
- Fallback tetap tersedia.

#### 19. Hardening
**Status:** belum dimulai · **Prioritas:** P1 · **Dependensi:** #15

**Scope:**
- Turnstile pada self-order publik.
- Rate limit edge per token/IP.
- CSP, security headers, redaksi log, dependency scanning.
- Sentry/error monitoring + alert.
- Audit log filter, export, retensi.
- Backup & disaster recovery terdokumentasi.

**Acceptance criteria:**
- Scan keamanan dasar tidak menemukan secret/PII di log.
- CSP tidak memblokir fungsi inti.
- Rate limit dan Turnstile aktif di production.
- Alert error sampai ke owner/developer.

### 11.5 Fitur lintas fase

#### 20. Denda & penalty engine
**Status:** belum dimulai · **Prioritas:** P1 · **Dependensi:** #1 refund, #3 tarif, #4 reservasi, #12 aset (untuk denda kerusakan)

**Masalah:** belum ada mekanisme denda untuk sesi yang melewati waktu, no-show/pembatalan reservasi, kerusakan meja/cue, atau kehilangan bola/aksesori. Semua masih manual dan tidak tercatat di bill/laporan.

**Jenis denda yang dicakup:**
- **Overtime sesi billiard:** jika sesi punya target selesai dan melewati grace period, denda per interval (mis. per 15 menit) atau tarif overtime khusus.
- **No-show / pembatalan reservasi:** deposit hangus atau persentase dari deposit, sesuai kebijakan venue.
- **Kerusakan:** meja, cue, lampu, atau fasilitas lain; nominal manual + bukti foto, wajib approval owner.
- **Kehilangan:** cue ball, bola, rack, chalk, atau aksesori lain; nominal tetap per item.
- **Denda manual lain:** pelanggaran aturan venue, keterlambatan pengembalian alat, dll; wajib alasan.

**Aturan perhitungan:**
- `penalty_rules` menyimpan jenis, metode (`fixed`, `per_interval`, `percent_deposit`), nominal, interval menit, grace period, batas maksimum, target berlaku, dan status aktif.
- Nominal dan aturan di-snapshot saat denda dibuat; perubahan master rule tidak mengubah denda lama.
- Overtime otomatis harus idempoten: satu denda per sesi/periode, dilindungi unique key (`sessionId`, `type`, `periodStart`).
- Denda masuk bill sebagai line item sebelum pembayaran. Bila bill sudah `paid`, denda menjadi receivable/tagihan berikutnya atau dipotong dari deposit (keputusan produk).
- Default denda **tidak** dikenakan PB1/service charge; simpan flag bila venue ingin memperlakukannya berbeda.

**Approval & pembatalan:**
- Overtime/no-show otomatis boleh berjalan tanpa approval jika rule aktif.
- Denda kerusakan/kehilangan/manual wajib approval owner + bukti.
- Waive denda wajib owner + alasan, tercatat audit; row tidak dihapus, hanya berstatus `waived`/`cancelled`.
- Kasir tidak boleh menaikkan/menurunkan nominal di luar batas rule tanpa approval.

**UI:**
- Kasir: tombol **Tambah denda** di bill, pilih jenis/rule, nominal, alasan, upload bukti.
- Admin: CRUD `penalty_rules` + approval queue + riwayat denda.
- Reservasi: aksi no-show/cancel yang otomatis menerapkan deposit forfeiture.
- Aset/maintenance: tombol catat kerusakan/kehilangan.
- Struk: baris denda terpisah dari billiard/F&B.
- Laporan: pendapatan denda terpisah; shift cash expected memperhitungkan denda cash.

**Acceptance criteria:**
- Denda overtime otomatis muncul tepat satu kali per periode, tidak dobel saat halaman di-refresh atau cron berjalan ulang.
- Denda manual tidak bisa melebihi batas tanpa approval owner.
- Waive/pembatalan denda tercatat audit dan tidak mengubah histori.
- Denda masuk total bill dan struk; laporan memisahkan denda dari omzet billiard/F&B.
- No-show reservation menerapkan deposit forfeiture sesuai policy.
- Denda kerusakan/kehilangan tidak bisa dibuat tanpa bukti dan approval.
- Refund/void interaction: denda ikut dihitung neto dan tidak bisa direfund dua kali.

**Dampak skema:** `penalty_rules`, `penalties` (`billId`, `reservationId`, `assetId`, `sessionId`, `type`, `amount`, `status`, `reason`, `evidenceUrl`, `approvedBy`, `waivedReason`, `periodStart`, `uniqueKey`, `createdAt`); kolom agregat `bills.penaltyAmount`; update `recalcBillTotals`, struk, laporan, dan shift cash.

### 11.6 Urutan sprint yang disarankan
1. **Sprint 1 (selesai v1.1):** #1 Refund manual, #2 Staff & settings.
2. **Sprint 2 (sebagian selesai v1.1):** #3 Tarif otomatis, #4 Reservation & waitlist; #20 Denda overtime/no-show masih pending.
3. **Sprint 3 (sebagian selesai v1.1):** #5 Split per item/seat; #13 Kas & shift lanjutan masih pending.
4. **Sprint 4 (sebagian selesai v1.1):** #6 Payment gateway QRIS (refund gateway belum); #9 E-receipt masih pending.
5. **Sprint 5 (sebagian selesai v1.1):** #7 Membership, #8 Promo engine; redeem/voucher/bundle masih pending.
6. **Sprint 6:** #11 Inventory & BOM, #12 Maintenance, #20 Denda kerusakan/kehilangan.
7. **Sprint 7:** #15 Go-live, #16 CI/CD, #19 Hardening (bisa paralel lebih awal).
8. **Sprint 8:** #14 Multi-outlet, #17 Offline queue, #18 ESC/POS.

### 11.7 Definition of Done (semua item)
- Migration Drizzle + seed/demo data bila relevan.
- Service layer + server action dengan validasi Zod dan role guard.
- UI responsif (mobile kasir + desktop admin), empty/error/loading state.
- Audit log untuk mutasi finansial dan perubahan konfigurasi.
- Idempotency untuk order/payment/refund/webhook.
- Unit test untuk aturan bisnis + integration test untuk alur kritis.
- `npm run typecheck`, `npm test`, `npm run build` lulus.
- README/PRD diperbarui; tidak ada float untuk uang; waktu memakai DB/`Asia/Jakarta`.

### 11.8 Keputusan produk yang harus diambil sebelum mulai
- Refund: siapa yang boleh approve, apakah stok dikembalikan, bagaimana refund QRIS.
- Denda: kena PB1/service atau tidak, tarif overtime memakai rate normal atau multiplier, ke mana denda ditagih jika bill sudah lunas, batas maksimum, dan siapa yang boleh waive.
- Staff: undang via Supabase invite atau buat password sementara?
- Tarif: resolusi overlap jadwal dan override hari libur.
- Reservasi: deposit hangus/no-show, buffer cleaning berapa menit.
- Split: alokasi per item, per seat, atau keduanya.
- Gateway: Midtrans atau Xendit; mata uang/refund policy.
- Membership: poin kedaluwarsa, tier, dan consent data pribadi.
- Inventory: boleh stok negatif atau diblokir.
- Multi-outlet: satu database shared atau database per outlet.
- Offline: konflik order/payment diselesaikan bagaimana.

---
