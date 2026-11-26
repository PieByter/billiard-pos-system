# Item yang sengaja ditunda

Dokumen ini mencatat item PRD yang **belum bisa diselesaikan penuh** di lingkungan pengembangan ini, alasan teknisnya, dan langkah lanjutannya.

## #14 Multi-outlet
**Status:** ditunda.

Alasan: menambahkan `outletId` ke hampir seluruh tabel operasional (meja, bill, order, payment, shift, member, promo, inventory, audit), lalu memfilter setiap query/server action dan RLS per outlet. Salah satu query yang terlewat bisa membocorkan data antar-cabang.

Langkah lanjut:
1. Tabel `outlets` + `profiles_outlets`.
2. Migration kolom `outlet_id` + backfill ke outlet default.
3. Helper `requireOutlet()` dan `withOutletScope()`.
4. RLS per outlet di Supabase.
5. UI switch outlet untuk owner.

## #17 Offline write queue
**Status:** ditunda.

Alasan: order/payment offline membutuhkan idempotency, replay queue, konflik stok/harga, dan rekonsiliasi pembayaran. PRD v1 memang menetapkan PWA read-only + SOP manual.

Langkah lanjut:
1. IndexedDB queue + service worker background sync.
2. Idempotency key per operasi.
3. Kebijakan konflik eksplisit (tolak/review/gabung).
4. UI status pending/sync/gagal.
5. Uji dua kasir offline pada meja yang sama.

## #18 ESC/POS langsung
**Status:** ditunda.

Alasan: Vercel tidak dapat menjangkau printer LAN. Butuh print agent lokal/WebUSB/Web Bluetooth dan pengujian perangkat keras.

Langkah lanjut:
1. Pilih transport: local agent (Node) atau WebUSB.
2. Antrean print + retry + idempotency.
3. Template 58/80mm dan encoding karakter Indonesia.
4. Test print per station.
5. Fallback `window.print()` tetap dipertahankan.

## Sisa parsial lain
- #6: refund gateway otomatis dan QRIS per split group.
- #7: redeem poin, voucher, deposit saldo.
- #8: bundle, stacking, happy hour otomatis.
- #9: cron pengiriman otomatis, template kustom, opt-out per channel.
- #10: web push dan rating/feedback.
- #11: supplier, purchase order, dan laporan HPP.
- #12: blokir start sesi untuk meja berstatus maintenance.
- #13: transfer kas antar shift dan approval berjenjang.
- #19: Turnstile, Sentry, dan audit log filtering lanjutan.
- #20: denda overtime otomatis dan integrasi deposit no-show.
