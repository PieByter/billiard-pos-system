# Item yang masih parsial / butuh lingkungan eksternal

Batch roadmap #11–#20 sudah diimplementasi. Dokumen ini hanya mencatat sisa pekerjaan yang **belum bisa diverifikasi penuh** di repo/demo, bukan fitur yang belum dibuat.

## Hardware & kredensial
- **#18 ESC/POS:** queue, print agent API, template teks, retry, dan tombol WebUSB sudah ada. Cetak fisik belum diuji karena tidak ada printer thermal di lingkungan ini. Lihat `docs/advanced-features.md` §3.
- **#15 production:** Supabase/Vercel/domain/backup belum bisa diuji tanpa kredensial. Checklist ada di `docs/go-live.md`.
- **Gateway asli:** Midtrans/Xendit refund, callback signature, dan WhatsApp/Resend butuh kredensial production/sandbox. Mock sudah diuji.
- **#19 Turnstile/Sentry:** security headers dan rate limit ada; Turnstile, Sentry, dan audit log filtering lanjutan belum.

## Sisa fungsional
- **#6:** refund gateway sudah otomatis, tetapi rekonsiliasi refund webhook provider belum diuji.
- **#10:** web push dan rating/feedback pasca-order belum.
- **#13:** transfer kas antar shift dengan approval berjenjang belum; cash drop/petty/transfer/adjustment sudah.
- **#16:** E2E Playwright belum; CI unit + integration + build sudah.
- **#11:** partial receipt PO, retur supplier, dan PO approval berjenjang belum.
- **#20:** overtime dihitung saat stop sesi (bukan live), dan forfeit deposit no-show belum memotong saldo member.

## Multi-outlet & offline
- **#14:** scoping query dan outlet switcher sudah; RLS template tersedia di `docs/rls-outlets.sql` tetapi belum diaktifkan karena membutuhkan `app.outlet_id` per request.
- **#17:** order kasir & customer sudah queued; pembayaran/refund sengaja tidak di-queue. Belum memakai Background Sync API dan belum ada resolusi konflik otomatis selain retry 3x.
