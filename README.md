# Cue & Tap — POS Billiard + Cafe

Sistem operasi venue untuk **billiard hall + cafe**: kasir, billing sesi billiard berbasis durasi,
self-order QR untuk tamu, Kitchen Display System, shift balancing, laporan, audit log, dan PWA.

Dibangun dari PRD/arsitektur di `billiard-cafe-pos-architecture.md` dan design system Stitch
**“Obsidian Cue & Tap”** (dark obsidian, emerald live state, cyan F&B stream, amber hold, JetBrains
Mono untuk angka).

**Stack:** Next.js 15 (App Router, Server Actions) · TypeScript · Tailwind CSS v4 · PostgreSQL
(Supabase) · Drizzle ORM · Supabase Auth + Realtime (opsional) · Vercel · PWA (manifest + service
worker).

---

## 1. Yang sudah diimplementasi

### Layar staf
| Route | Fungsi |
|---|---|
| `/login` | Login staff, quick-login demo, branding venue |
| `/staff/cashier` | Matrix 8 meja billiard + 12 meja cafe, timer live, pause/resume, stop & pay, pindah meja, order F&B, split payment, QR per meja, approval self-order, panggilan waiter |
| `/staff/reservations` | Reservasi meja, cek konflik, deposit, check-in ke sesi/bill, waitlist walk-in (panggil/duduk/no-show) |
| `/staff/cashier/split/[billId]` | Split bill per item/sesi, alokasi group, pembayaran parsial per group, struk split |
| `/staff/kitchen` | KDS 3 lane (Baru / Dimasak / Siap Antar), filter station, checklist item, overdue >12m, buzzer, fullscreen, print tiket |
| `/staff/admin` | KPI shift, balancing kas + hitung per pecahan, komposisi pembayaran, master tarif, audit log, riwayat shift, X/Z report |
| `/staff/admin/menu` | CRUD menu, harga, stok, station, best seller, availability |
| `/staff/admin/tables` | CRUD meja, tarif, flag self-order, QR generation & rotasi token |
| `/staff/admin/schedules` | Jadwal tarif peak/off-peak per meja: hari, jam, prioritas, preview tarif |
| `/staff/admin/members` | Member & tier: profil, poin, total spend, diskon tier otomatis |
| `/staff/admin/promotions` | Promo code: persentase/nominal, min spend, kuota, masa berlaku, member-only |
| `/staff/admin/notifications` | Outbox e-receipt/order-ready, status kirim, retry, provider email/WhatsApp/log |
| `/staff/admin/reports` | Omzet 7/14/30 hari, billiard vs F&B, metode bayar, top menu & meja, refund, export CSV |
| `/staff/admin/refunds` | Refund pembayaran bill lunas (partial/full), kategori refund, restock stok, riwayat refund |
| `/staff/admin/staff` | CRUD staff, role, aktif/nonaktif, reset akses, provisioning Supabase Auth |
| `/staff/admin/settings` | Pengaturan venue, PB1, service charge, footer struk, warning menit |
| `/print/*` | Struk bill 80mm, tiket kitchen 80mm, X/Z report shift, kartu QR A4, struk split group |

### Layar tamu
| Route | Fungsi |
|---|---|
| `/t/[token]` | Menu QR per meja, keranjang, catatan per item, self-order (jika flag aktif), live status tracker, panggil waiter, ringkasan bill |

### Fondasi
- **Satu bill per meja** (bukan per order/sesi). Billiard + F&B bergabung di satu bill.
- **Partial unique index** mencegah dua sesi aktif / dua open bill per meja — race condition ditolak
  oleh Postgres, bukan kode aplikasi.
- **Billing integer rupiah**, snapshot tarif saat start, min duration + increment + pembulatan Rp500.
- **Waktu dari Postgres** (`now()`), bukan jam client.
- **Idempotency** pada order (unique key) dan payment webhook (`external_ref`).
- **Stok atomik** (`stock >= qty` di dalam `UPDATE`) sehingga tidak oversell.
- **Refund append-only** per payment; laporan dan expected cash shift memakai nilai neto setelah refund.
- **Snapshot venue settings**: perubahan PB1/service hanya berlaku untuk bill baru.
- **Tarif otomatis per jadwal**: `table_rate_schedules` memilih rate berdasarkan hari/jam Asia/Jakarta dan prioritas; tarif di-snapshot saat start.
- **Reservasi & waitlist**: cek overlap, deposit tercatat, check-in membuat bill/sesi; waitlist walk-in terpisah.
- **Split bill per item/sesi**: group pembayaran parsial; bill baru ditutup setelah semua group lunas.
- **QRIS dinamis**: create-charge via gateway (mock/Midtrans/Xendit), QR display, polling status, webhook auto-settlement.
- **Member & loyalty**: tier otomatis berdasarkan total spend, diskon tier di bill, poin earn saat bill lunas, ledger append-only.
- **Promo engine**: kode promo persentase/nominal, min spend, kuota, masa berlaku, cakupan billiard/F&B, member-only.
- **E-receipt/outbox**: struk digital ke member (email/WhatsApp/log), retry antrean, tanpa memblokir kasir.
- **Customer experience**: favorit menu, reorder, ETA status, tracker lebih kaya.
- **Audit log append-only** untuk start/stop sesi, pause, order, void, diskon, refund, staff, settings, shift, rotasi QR, dll.
- **Role guard server-side**: owner / cashier / kitchen. Admin hanya owner; staff nonaktif langsung ditolak.
- **PWA**: installable, cache menu yang pernah dibuka, halaman `/offline`, print browser 80mm.
- **Realtime**: Supabase Postgres Changes → `router.refresh()` bila dikonfigurasi, dengan polling
  fallback (5s KDS, 10s kasir, 8s customer) yang selalu aktif.

---

## 2. Menjalankan lokal (zero-config)

Tidak perlu Supabase atau Postgres untuk mencoba. Saat `DATABASE_URL` kosong, aplikasi otomatis
memakai **PGlite** (Postgres WASM) di `.data/pglite`, menjalankan migration Drizzle, dan meng-seed
data demo kaya (open bill, sesi berjalan, pending QR, riwayat 7 hari, shift aktif).

```bash
npm install
npm run dev
# buka http://localhost:3000
```

### Akun demo

| Role | Email | Password |
|---|---|---|
| Owner | `owner@cuetap.id` | `demo1234` |
| Kasir | `kasir@cuetap.id` | `demo1234` |
| Kitchen | `dapur@cuetap.id` | `demo1234` |

Login page juga punya tombol **1-tap demo**. Data demo mencakup:

- B1 running 102 menit + pending QR order, B2 running, B3 paused, B5 cleaning.
- C1 cooking, C2 served, C3 & C5 pending QR, C4 preparing.
- 34 bill historis (7 hari) + payment mix cash/QRIS/EDC/transfer.
- Shift kasir aktif + audit log + panggilan waiter.

**Reset database demo:** hentikan dev server, hapus folder `.data`, lalu `npm run dev` lagi.
(Reset akan meng-seed ulang otomatis.)

### Mencoba halaman tamu
1. Login sebagai owner → **Admin → Meja & QR**.
2. Pilih meja cafe (mis. C3) → **Copy link** atau **QR besar**.
3. Buka link `/t/<token>` di tab incognito/HP.
   - Cafe: self-order aktif.
   - Billiard: menu view-only, tombol panggil waiter (sesuai aturan “billiard hanya lewat kasir”).

### Script lokal

```bash
npm run dev            # Next dev + PGlite + auto seed
npm run typecheck      # TypeScript strict
npm test               # unit test billing engine (vitest)
npm run test:integration # end-to-end service test (PGlite terpisah)
npm run build          # production build
npm run db:smoke       # cek koneksi + jumlah data demo
npm run icons          # regenerate PNG PWA dari public/icons/icon.svg
```

---

## 3. Deploy production: Supabase + Vercel

### 3.1 Buat project Supabase
1. Buat project di Supabase (region terdekat, mis. Singapore).
2. **Project Settings → Database → Connection string**:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`
   - **Direct connection** (port `5432`) → `DIRECT_URL` (untuk migration/seed)
3. **Project Settings → API**: salin URL + `anon` key.
4. **Authentication → Providers → Email**: aktifkan. **Matikan “Allow new users to sign up”**
   karena staff harus di-provision.
5. (Opsional, sangat disarankan) aktifkan Realtime + jalankan `supabase/realtime.sql`.

### 3.2 Environment
Salin `.env.example` → `.env.local` (lokal) atau isi di Vercel:

```bash
DATABASE_URL=postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_APP_URL=https://<app>.vercel.app
AUTH_SECRET=<random 64 hex>
PAYMENT_WEBHOOK_SECRET=<random secret, opsional>
```

> `DATABASE_URL` pooler + `prepare:false` + `max:1` sudah di-set di `lib/db/index.ts` agar aman
> untuk serverless. `DIRECT_URL` hanya dipakai tooling migration.

### 3.3 Migration + seed
```bash
# dari mesin lokal dengan .env.local terisi:
npm run db:seed
# default: katalog dasar (staff, tarif, meja, menu) — tanpa transaksi demo

# jika ingin data demo lengkap di staging:
SEED_DEMO_DATA=true npm run db:seed
```
`db:seed` menjalankan migration Drizzle lalu seed. Untuk production berulang, aman:
seed otomatis berhenti jika tabel `profiles` sudah berisi data.

### 3.4 Provision Supabase Auth
Seed membuat row `profiles` dengan email demo. Buat auth user dengan email yang sama, lalu login
pertama akan me-link `profiles.id` ke auth UID (FK `ON UPDATE CASCADE`).

**Cara otomatis** (butuh service role key, jangan commit):
```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
DATABASE_URL=... \
SEED_STAFF_PASSWORD='password-kuat' \
npm run auth:provision
```
Atau buat manual di Dashboard → Authentication → Users (email + password). Ganti password demo
sebelum go-live.

Setelah `SUPABASE_SERVICE_ROLE_KEY` diisi, owner juga bisa mengelola staff dari
**Admin → Staff**: tambah staff, ubah role, reset password, dan nonaktifkan akses. UI akan membuat
Supabase Auth user + row `profiles` sekaligus. Tanpa service role key, tombol tambah staff dinonaktifkan.

**Menambah staff dengan email sendiri (fallback SQL):**
```sql
insert into public.profiles (id, email, name, role)
values (gen_random_uuid(), 'nama@venue.com', 'Nama Staff', 'cashier');
-- role: owner | cashier | kitchen
```
Lalu buat auth user dengan email yang sama. Login pertama akan link otomatis.

### 3.5 Vercel
1. Import repo → framework Next.js (auto).
2. Tambahkan semua env di atas.
3. Deploy. Build command standar `npm run build` (tidak butuh koneksi DB saat build).
4. Set `NEXT_PUBLIC_APP_URL` ke domain final agar QR meja mengarah ke domain yang benar.
5. Buka `/api/health` → harus `{ ok: true, database: "up" }`.

### 3.6 Realtime + RLS
Jalankan `supabase/realtime.sql` di SQL Editor. File ini:
- membuat helper `cuetap_is_staff()` / `cuetap_is_owner()`,
- policy **SELECT** untuk `authenticated` pada tabel operasional,
- menambahkan tabel ke publication Realtime.
- tidak memberikan policy untuk `anon`; customer tetap memakai polling API token (sesuai PRD).

Semua tabel sudah `.enableRLS()` **tanpa policy write** → PostgREST/anon deny-all. Drizzle memakai
role `postgres` (bypass RLS), jadi otorisasi tetap di server actions (`requireStaffAction`).

### 3.7 Payment webhook (opsional)
`POST /api/webhooks/payment`

```json
{
  "billId": "uuid",
  "method": "qris",
  "amount": 281750,
  "externalRef": "qris-trx-123"
}
```
Header:
```
x-cuetap-signature: HMAC_SHA256_HEX(`${billId}.${amount}.${externalRef}`, PAYMENT_WEBHOOK_SECRET)
```
Sifat:
- signature wajib + constant-time compare,
- idempoten via `payments.external_ref` unique,
- menolak bill dengan sesi aktif / pending order / nominal tidak sama dengan sisa tagihan,
- menutup bill + set meja cleaning jika lunas,
- audit `bill.paid_webhook`.

### 3.8 QRIS dinamis (opsional)
Endpoint webhook gateway: `POST /api/webhooks/payment/gateway`

Env:
```bash
PAYMENT_GATEWAY=mock|midtrans|xendit
MIDTRANS_SERVER_KEY=...
MIDTRANS_IS_PRODUCTION=false
XENDIT_SECRET_KEY=...
XENDIT_CALLBACK_TOKEN=...
```
- **mock**: hanya untuk dev/demo; QR palsu + tombol “Simulasikan pembayaran”.
- **midtrans**: `POST /v2/charge` (`payment_type=qris`), signature notification SHA512.
- **xendit**: `POST /qr_codes`, callback token header.
- Bill yang sudah punya payment intent pending akan membuat intent lama `cancelled` saat QR baru dibuat.
- Settlement webhook menutup bill otomatis + meja cleaning.
- Refund gateway belum otomatis; refund manual tetap lewat Admin → Refund.

Contoh generate signature:
```js
const { createHmac } = require('node:crypto');
const payload = `${billId}.${amount}.${externalRef}`;
const signature = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET)
  .update(payload).digest('hex');
```

### 3.9 E-receipt & notifikasi (opsional)
- Outbox `notification_outbox` diisi otomatis saat bill member lunas (e-receipt) dan saat order siap (jika bill punya member dengan kontak).
- Provider dipilih otomatis:
  - `RESEND_API_KEY` → email
  - `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` → WhatsApp Cloud API
  - tanpa key → **log lokal** (dev/demo)
- Pengiriman tidak memblokir kasir. Owner memproses antrean di **Admin → Notifikasi**; item gagal bisa di-retry.
- Untuk produksi, daftarkan nomor WhatsApp/template dan verifikasi domain email sebelum go-live.

---

## 4. Aturan bisnis penting

### Bill & billing
- Satu **bill** per meja; sesi billiard dan order F&B menjadi line item di bill yang sama.
- Tarif di-snapshot saat start (`rate_per_hour`, `min_minutes`, `increment_minutes`). Perubahan master
  tarif tidak mengubah sesi berjalan.
- Pause mengurangi waktu tagih. Saat stop, pause berjalan ikut dihitung.
- Rumus: `elapsed → ceil menit → max(min, ceil(increment)) → amount = billable/60 × rate → round Rp500`.
- Diskon (owner) mengurangi dasar PB1 & service. PB1 default 10%, service 5% (bisa diubah di row
  `bills`/seed).
- Split bill = beberapa row `payments` dengan metode berbeda, total harus sama dengan total bill.
- Split per item/sesi: semua item/sesi harus dialokasikan tepat sekali; bill tetap open sampai semua group lunas.
- Bill hanya bisa dibayar jika tidak ada sesi aktif dan tidak ada self-order pending.

### Self-order
- Flag `venue_tables.allow_self_order` — bukan hardcode `kind = 'billiard'`.
- Order customer berstatus `pending` sampai kasir approve. Approve → KDS. Reject → stok dikembalikan.
- Harga & stok selalu dari DB; payload client tidak dipercaya.
- Idempotency key unik + rate limit 5 order/menit per meja.
- Billiard default `allow_self_order = false` (order lewat kasir), cafe `true`.
- Customer tracker memakai API `GET /api/customer/orders?token=...` (polling 8s), bukan anon
  Postgres Changes.

### Shift & audit
- Hanya satu shift open pada satu waktu (partial unique index).
- Tutup shift membutuhkan **semua bill open sudah ditutup**, kas fisik dihitung manual, selisih
  dicatat.
- Void/diskon hanya owner; keduanya masuk audit log append-only.
- Webhook payment tercatat dengan `staff_id = null` dan sumber `bill.paid_webhook`.

### Member & promo
- Tier member ditentukan dari total spend; diskon tier dihitung ulang saat bill berubah.
- Poin earn = `floor(net subtotal / Rp1.000 × multiplier tier)` dan dicatat append-only di `loyalty_ledger`.
- Kode promo divalidasi terhadap aktif, masa berlaku, min spend, kuota, cakupan, dan member-only.
- Kuota promo baru bertambah saat bill lunas; promo yang dilepas tidak menambah kuota.
- Setelah promo diterapkan, order baru diblokir sampai promo dilepas (agar basis diskon tidak berubah).
- Refund saat ini tidak membalik poin/promo; koreksi manual di masa depan.

### Pindah meja
- Bill, order, dan sesi aktif ikut pindah; timer tetap berjalan.
- Meja tujuan harus kosong (tidak ada open bill/sesi aktif); partial unique index menjadi pengaman
  terakhir.

---

## 5. Struktur repo

```
app/
  (root) page.tsx, layout.tsx, globals.css, icon.svg, not-found.tsx, offline/
  login/
  t/[token]/                    # customer self-order
  staff/
    cashier/ kitchen/ admin/    # admin + menu + tables + reports
    print/                      # bill, kitchen, shift, qr
  api/
    health/ customer/orders/ qr/ webhooks/payment/
  actions/                      # server actions (auth, sessions, orders, payments, shifts, admin)
components/
  ui/                           # Button, Badge, Modal, Form, StatCard, dll
  auth/ cashier/ kds/ admin/ customer/ staff/ print/ realtime/ pwa/
lib/
  db/                           # schema.ts, index.ts (Supabase/PGlite), seed.ts
  queries/                      # cashier, kds, admin, customer, print
  services/                     # bill, orders, sessions, payments, shifts, admin, audit
  billing.ts constants.ts auth.ts types.ts format.ts ids.ts validate.ts
drizzle/                        # migration SQL + journal (drizzle-kit)
supabase/realtime.sql           # RLS SELECT + Realtime publication untuk staff
scripts/                        # seed, provision auth, icons, smoke test
public/                         # manifest, sw.js, icons
```

### Keputusan teknis
| Area | Keputusan |
|---|---|
| Auth | Supabase Auth (production). Mode demo lokal pakai cookie HMAC + bcrypt hash di `profiles`. |
| DB lokal | PGlite otomatis saat `DATABASE_URL` kosong; production wajib Supabase. |
| Realtime | Postgres Changes + polling fallback. Tidak ada policy `anon`. |
| Cetak | `window.print()` 80mm (Chrome/Edge). Tidak ada ESC/POS langsung karena Vercel tidak bisa menjangkau printer LAN. |
| QRIS | Manual-confirm di kasir + webhook gateway opsional. Tidak memaksa bayar di muka. |
| Tarif peak/off-peak | Model tarif per meja. Slot jam dapat dibuat sebagai rate terpisah dan di-assign ke meja; belum ada auto-switch tarif di tengah sesi (snapshot rate). |
| Split bill | Per metode bayar dan per item/sesi (group pembayaran parsial). |
| Stock | Opsional per menu (`stock = null` = tak dilacak). |

### Belum termasuk v1 (roadmap)
Backlog lengkap + acceptance criteria ada di **`billiard-cafe-pos-architecture.md` §11** (20 item; refund manual, staff/settings, jadwal tarif, reservasi, split bill, QRIS dinamis, member, promo, notifikasi, dan customer experience sudah ada). Ringkasannya:

Hal-hal berikut sengaja belum dibangun karena butuh keputusan produk/integrasi eksternal, bukan karena terlewat:

- **QRIS refund otomatis.** Create-charge + auto-settlement sudah ada; refund manual tersedia di Admin → Refund. Pemanggilan refund API gateway belum diaktifkan di UI.
- **Denda & penalty engine.** Overtime sesi, no-show reservasi, kerusakan/kehilangan alat, dan denda manual belum ada aturan, approval, atau pencatatan di bill.
- **Offline write queue.** PWA menyimpan menu read-only; order/pembayaran tetap butuh jaringan (sesuai PRD v1).
- **ESC/POS langsung / print agent.** Cetak memakai `window.print()` 80mm; printer LAN perlu driver di komputer kasir.
- **Cloudflare Turnstile.** Self-order sudah dilindungi status pending + rate limit 5 order/menit per meja; Turnstile bisa ditambah jika spam QR terbukti jadi masalah.

---

## 6. Cetak thermal

1. Buka bill → tombol **Slip 80mm** / **Print** → tab baru.
2. Chrome/Edge → Print → pilih printer thermal → paper **80mm** → margin **None** →
   matikan “Headers and footers”.
3. Ukuran kertas otomatis dari `@page { size: 80mm auto; }`.
4. Untuk printer LAN: install driver printer di komputer kasir; Vercel hanya mengirim HTML.
5. QR meja: Admin → Meja & QR → **Cetak QR** (A4, 2 kartu/halaman).

---

## 7. PWA & offline

- `public/manifest.webmanifest` + `public/sw.js`.
- Install dari browser (desktop/Android/iOS “Add to Home Screen”). Ikon digenerate via
  `npm run icons`.
- Service worker hanya aktif di production (`npm run build && npm start`), bukan `next dev`.
- Cache: app shell, halaman yang pernah dibuka, aset statis. Menu customer yang pernah dibuka bisa
  dibaca offline; order/pembayaran tetap butuh jaringan.
- Untuk update versi cache, ubah konstanta `VERSION` di `public/sw.js`.
- Offline SOP: catat order manual, input saat koneksi kembali. Tidak ada offline write queue di v1
  (sesuai PRD).

---

## 8. QA checklist sebelum go-live

- [ ] `npm run typecheck && npm test && npm run build`.
- [ ] Login owner/kasir/kitchen; role guard: kitchen tidak bisa buka admin, cashier tidak bisa buka
      admin.
- [ ] Start sesi billiard → pause → resume → stop → bayar cash/QRIS/EDC/split.
- [ ] Coba start sesi ganda pada meja yang sama (harus ditolak).
- [ ] Order cashier → tampil di KDS → checklist item → ready → served.
- [ ] Customer QR: order → pending di kasir → approve → KDS → selesai; coba reject → stok kembali.
- [ ] Tambah item stok 0 → tombol sold out; oversell ditolak.
- [ ] Pindah meja saat timer berjalan; timer tetap.
- [ ] Diskon owner → total & audit berubah; void → stok kembali, audit tercatat.
- [ ] Refund partial → sisa payment berkurang, laporan neto, expected cash shift ikut turun.
- [ ] Refund full → bill full refund, stok kembali sekali, struk menampilkan refund, tidak bisa refund ulang.
- [ ] Refund melebihi sisa payment ditolak; refund pada bill open/void ditolak.
- [ ] Staff: tambah staff → login; nonaktifkan → login ditolak; owner terakhir tidak bisa dinonaktifkan.
- [ ] Settings: ubah PB1/service → hanya bill baru berubah; bill berjalan tetap snapshot lama.
- [ ] Jadwal tarif: buat jadwal aktif sekarang → dialog start menampilkan tarif jadwal; start sesi memakai tarif itu.
- [ ] Jadwal overlap → prioritas tertinggi menang; nonaktifkan jadwal → fallback ke tarif default.
- [ ] Reservasi: buat booking → konflik jadwal ditolak; check-in membuat bill/sesi; no-show/cancel tercatat.
- [ ] Waitlist: tambah → panggil → duduk; status dan waktu tercatat.
- [ ] Split: alokasikan sesi/item ke 2+ group → bayar group 1 → bill tetap open → bayar group terakhir → bill lunas.
- [ ] Split: item tidak bisa dialokasikan dua kali; total group = total bill; struk per group.
- [ ] QRIS dinamis (mock): buat QR → simulasi bayar → bill lunas + meja cleaning.
- [ ] QRIS gateway Midtrans/Xendit: webhook signature/callback token valid; nominal salah ditolak; duplikat idempoten.
- [ ] Member: attach ke bill → diskon tier muncul; bayar → poin & total spend bertambah.
- [ ] Promo: kode valid diterapkan; min spend/kuota/expired ditolak; bill lunas → kuota promo bertambah.
- [ ] Promo member-only ditolak untuk bill tanpa member.
- [ ] E-receipt: bill member lunas → masuk outbox; proses antrean → status sent (log/email/WA).
- [ ] Notifikasi order ready masuk outbox saat order ready dan bill punya member berkontak.
- [ ] Customer: tandai favorit, filter favorit, reorder dari tracker, ETA status tampil.
- [ ] Tutup shift dengan bill open (harus ditolak); setelah semua bill lunas → Z-report.
- [ ] Webhook payment: signature salah 401, dobel 200 idempoten, nominal salah 400.
- [ ] QR: copy link, buka incognito, rotate token → link lama 404.
- [ ] PWA install; mode offline menampilkan `/offline`; menu yang pernah dibuka masih tampil.
- [ ] Print 80mm struk, tiket kitchen, Z-report, kartu QR.
- [ ] `/api/health` ok; Vercel logs bersih.
- [ ] Ganti semua password demo, matikan Supabase signup publik, simpan `AUTH_SECRET` aman.

---

## 9. Troubleshooting

| Masalah | Penyebab / solusi |
|---|---|
| `DATABASE_URL wajib diisi di Vercel` | Mode PGlite tidak diizinkan di Vercel. Isi Supabase env. |
| `prepared statement already exists` / pooler error | Pastikan `prepare:false` dan port 6543. Jangan pakai direct URL untuk runtime. |
| Login Supabase: “akun belum terdaftar sebagai staff” | Buat row `profiles` dengan email sama (atau jalankan seed), lalu login ulang. |
| Realtime tidak jalan | Jalankan `supabase/realtime.sql`, pastikan user Supabase Auth aktif. Polling tetap bekerja. |
| QR mengarah ke localhost | Set `NEXT_PUBLIC_APP_URL` ke domain Vercel, restart/redeploy, lalu cetak ulang QR. |
| Ikon PWA 404 | Jalankan `npm run icons`; pastikan folder `public/icons` ikut commit. |
| SW cache basi setelah deploy | Naikkan `VERSION` di `public/sw.js` dan redeploy. |
| Print terpotong | Pilih 80mm, margin None, scale 100%, header/footer off. |
| Data demo ingin bersih | Hapus `.data/pglite` (lokal) atau reset project staging. |

---

## 10. Lisensi

Private project untuk venue Cue & Tap. Semua aset visual dibuat khusus untuk project ini.
