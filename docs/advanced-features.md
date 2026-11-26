# Fitur lanjutan (roadmap #11–#20)

Dokumen ini mencatat implementasi batch lanjutan, konfigurasi yang dibutuhkan, dan batasan yang masih tersisa.

## 1. Multi-outlet
- Tabel `outlets`; seluruh tabel operasional memiliki `outlet_id` (default outlet `MAIN`).
- Outlet switcher di header Admin untuk owner. Cookie `cuetap_outlet` menyimpan outlet aktif.
- Owner bisa menambah outlet di **Pengaturan → Multi-outlet**. Outlet baru mendapat pengaturan venue, kategori menu, dan tarif default.
- Query kasir, KDS, meja, menu, inventory, maintenance, member, promo, denda, shift, laporan, refund, notifikasi, dan print queue difilter per outlet.
- Laporan dan export CSV mengikuti outlet aktif.
- **RLS:** template ada di `docs/rls-outlets.sql`. Aplikasi saat ini memakai scoping server-side. Jangan aktifkan RLS template sebelum setiap request men-set `app.outlet_id`; jika tidak, semua query akan tertolak.
- Batasan: belum ada laporan agregat lintas outlet; owner harus berpindah outlet.

## 2. Offline write queue
- Order kasir dan self-order tamu disimpan di IndexedDB saat offline atau saat server action gagal karena jaringan.
- Replay otomatis saat `online`, memakai `idempotencyKey` yang sama sehingga tidak menghasilkan order ganda.
- UI kasir menampilkan badge `N offline`.
- Kebijakan konflik: error bisnis (stok habis, meja maintenance, promo terkunci) dicoba ulang maksimal 3 kali; setelah itu dibuang dan kasir mendapat toast error. Tidak ada penggabungan otomatis.
- Pembayaran/refund **tidak** masuk queue offline karena risiko uang.
- Batasan: belum memakai Background Sync API; replay terjadi saat tab aktif/online.

## 3. ESC/POS, print agent, dan WebUSB
- Setiap pembayaran dan order yang diterima membuat baris `print_jobs` (receipt/kitchen/split).
- Halaman **Admin → Printer** menampilkan queue, retry, dan test print.
- Agent lokal mengambil job:
  ```http
  GET /api/print/jobs?agent=printer-1&limit=10
  Authorization: Bearer $PRINT_AGENT_TOKEN

  POST /api/print/jobs
  { "id": "...", "ok": true }
  { "id": "...", "ok": false, "error": "kertas habis" }
  ```
- Payload berisi teks 42 kolom; agent dapat mengirim ke RAW spooler, port 9100, atau WebUSB.
- Halaman cetak bill menyediakan tombol **Cetak USB** (Chrome/Edge, WebUSB). Jika WebUSB gagal, job tetap di queue dan bisa di-retry/agent.
- **Belum diuji pada hardware fisik.** Yang sudah diuji: pembuatan payload, queue, claim, complete, retry, dan WebUSB compile/build.
- Fallback `window.print()` 80mm tetap tersedia.

## 4. Refund gateway & QRIS per split
- Refund pembayaran QRIS gateway otomatis memanggil Midtrans/Xendit (mock di demo). Jika gateway menolak, refund tidak disimpan dan kasir diminta memakai ref manual.
- Split bill punya tombol QRIS per group. Settlement group menutup group tersebut; bill baru lunas setelah semua group dibayar.
- Status QR dicek otomatis tiap 3 detik; mode mock punya tombol simulasi.
- Batasan: rekonsiliasi webhook refund bergantung provider; belum ada partial refund level gateway per item.

## 5. Membership lanjutan
- **Tukar poin:** 1 poin = Rp100. Dibatasi sisa nilai bill dan saldo poin. Poin dikembalikan saat bill di-void/lepas member.
- **Voucher:** single-use, fixed/percent, min spend, expiry, bisa khusus member. Voucher dikunci ke bill saat dipakai dan dilepas saat void.
- **Saldo/deposit:** top up cash/QRIS/transfer/EDC; bayar bill memakai metode `balance`; refund balance dikembalikan ke saldo. Top up cash masuk cash movement shift.
- **Tier benefit:** diskon tier, multiplier poin, dan teks benefit tambahan.
- **Opt-out channel:** email/WhatsApp per member dipakai oleh outbox.
- Batasan: belum ada expiry poin, auto top-up, atau liability report deposit.

## 6. Promo lanjutan
- Beberapa promo bisa **stacking** selama `stackable=true`.
- **Bundle:** promo bertipe `bundle` dengan daftar menu dan harga paket; diskon = total harga menu - harga paket.
- **Happy hour otomatis:** `autoApply` + hari/jam window. Dievaluasi ulang setiap bill berubah. Promo non-stackable manual akan menonaktifkan auto promo.
- **Kuota per member:** `maxUsesPerMember` dihitung dari pemakaian yang sudah lunas.
- UI promo mendukung tipe persentase, nominal, bundle, stacking, auto apply, dan pemilihan menu bundle.
- Batasan: belum ada stacking priority/exclusion matrix yang kompleks.

## 7. Inventory lanjutan
- **Supplier:** CRUD supplier per outlet.
- **Purchase order:** draft → dipesan → diterima. Penerimaan menambah stok, mencatat stock movement, dan memperbarui harga modal.
- **HPP per menu:** biaya resep × harga modal terbaru, margin Rp dan %.
- **Stock opname massal:** input hasil hitung fisik semua bahan, simpan header + item, sesuaikan stok, dan catat movement `opname`.
- Batasan: belum ada partial receipt, retur supplier, atau PO approval berjenjang.

## 8. Denda otomatis
- Sesi billiard bisa diberi **target durasi**. Saat stop, aturan overtime otomatis (jika `autoApply`) menghitung keterlambatan setelah grace period, memakai tarif per jam atau nominal, dengan cap maksimum.
- Denda masuk ke bill dan tidak dikenai PB1/service.
- Reservasi **no-show** dengan deposit `paid` otomatis forfeit deposit dan membuat catatan penalti (tanpa bill).
- Batasan: overtime dihitung saat sesi dihentikan, bukan live warning; deposit no-show belum memotong saldo member.

## 9. Maintenance meja
- Meja bisa ditandai maintenance dari **Admin → Meja & QR** dengan catatan.
- Start sesi, buka bill cafe, self-order, dan order kasir ditolak untuk meja maintenance.
- Selesai maintenance mengembalikan meja ke available; hijau setelah cleaning juga membersihkan flag maintenance.
- Aset cue/meja/peralatan tetap punya log service dan biaya.

## 10. Notifikasi lanjutan
- Template kustom per outlet untuk receipt, order ready, reservasi, reminder, dan test. Placeholder: `{{memberName}}`, `{{billNumber}}`, `{{tableCode}}`, `{{total}}`, `{{orderNumber}}`, `{{guestName}}`, `{{reservationCode}}`, `{{startAt}}`.
- Opt-out email/WhatsApp per member dihormati saat enqueue.
- Cron endpoint: `GET/POST /api/cron/notifications` dengan `Authorization: Bearer $CRON_SECRET` (di development boleh tanpa secret).
- `vercel.json` menjadwalkan cron setiap 10 menit; plan Vercel tertentu mungkin membatasi frekuensi.
- Cron memproses outbox dan membuat reminder reservasi H+1 (sekali per reservasi).
- Batasan: belum ada web push, template per channel terpisah, atau retry backoff eksponensial.

## Environment tambahan
```env
PRINT_AGENT_TOKEN=...
CRON_SECRET=...
```
`PAYMENT_GATEWAY=mock` tetap default di development. Kredensial Midtrans/Xendit/Resend/WhatsApp belum diuji end-to-end di repo ini.
