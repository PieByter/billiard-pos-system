# Go-live checklist — Cue & Tap POS

Checklist ini melengkapi README §3. Jalankan berurutan sebelum venue memakai sistem untuk transaksi nyata.

## 1. Supabase
- [ ] Buat project production (region terdekat, mis. Singapore).
- [ ] Salin pooler URL (port 6543) → `DATABASE_URL`.
- [ ] Salin direct URL (port 5432) → `DIRECT_URL`.
- [ ] Isi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Jalankan `npm run db:seed` dari mesin dengan `.env.local` production.
- [ ] Provision auth staff (`npm run auth:provision` atau Dashboard → Users).
- [ ] Matikan “Allow new users to sign up”.
- [ ] Jalankan `supabase/realtime.sql` di SQL Editor.
- [ ] Aktifkan backup harian + point-in-time recovery bila tersedia.

## 2. Vercel
- [ ] Import repo, framework Next.js.
- [ ] Tambahkan semua env (lihat `.env.example`).
- [ ] Set `NEXT_PUBLIC_APP_URL` ke domain final **sebelum** mencetak QR.
- [ ] Deploy production.
- [ ] Cek `/api/health` → `{ ok: true, database: "up" }`.
- [ ] Cek login owner/kasir/kitchen dan role guard.
- [ ] Pastikan `AUTH_SECRET` production bukan default.
- [ ] Rotate semua password demo.

## 3. Payment gateway (jika dipakai)
- [ ] Pilih `PAYMENT_GATEWAY=midtrans` atau `xendit`.
- [ ] Isi server key/callback token.
- [ ] Set URL callback ke `https://<domain>/api/webhooks/payment/gateway`.
- [ ] Test sandbox: create QR → bayar → bill lunas → cleaning.
- [ ] Test webhook duplikat idempoten.
- [ ] Test refund QRIS gateway (sandbox) + fallback ref manual.
- [ ] Test QRIS per split group dan settlement parsial.

## 4. Notifikasi (jika dipakai)
- [ ] Verifikasi domain email / nomor WhatsApp.
- [ ] Isi `RESEND_API_KEY` atau `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`.
- [ ] Test e-receipt dari bill member.
- [ ] Proses antrean dari Admin → Notifikasi.
- [ ] Set `CRON_SECRET`; test `/api/cron/notifications` dengan bearer token.
- [ ] Sesuaikan template & opt-out member.
- [ ] Cek limit cron plan Vercel (default `*/10 * * * *`).

## 5. Operasional
- [ ] Uji shift buka/tutup, cash drop, petty cash, refund, split bill, QRIS split.
- [ ] Uji QR meja, rotasi token, self-order, KDS, print 80mm.
- [ ] Uji tukar poin, voucher, top up saldo, pembayaran saldo.
- [ ] Uji promo bundle/stacking/happy hour.
- [ ] Uji supplier → PO → terima → HPP → stock opname.
- [ ] Uji denda overtime otomatis dan no-show deposit.
- [ ] Uji blokir meja maintenance.
- [ ] Uji PWA install + offline page + offline order queue.
- [ ] Set `PRINT_AGENT_TOKEN`, jalankan agent, test print struk & kitchen.
- [ ] Uji WebUSB di Chrome/Edge dengan printer fisik.
- [ ] Backup rutin diverifikasi dengan restore ke staging.

## 6. Multi-outlet
- [ ] Buat outlet kedua dari Pengaturan → Multi-outlet.
- [ ] Tambah meja/menu/staff untuk outlet baru.
- [ ] Switch outlet dan pastikan kasir/KDS/laporan tidak bercampur.
- [ ] Jika memakai RLS, terapkan `docs/rls-outlets.sql` setelah `app.outlet_id` di-set per request.

## 7. Monitoring
- [ ] Uptime monitor `/api/health`.
- [ ] Alert error server (Sentry/Logflare/Vercel).
- [ ] Review audit log dan selisih shift setiap hari.
- [ ] Monitor print queue `failed` dan notification outbox `failed`.
- [ ] Review stok rendah, PO outstanding, dan HPP negatif.
