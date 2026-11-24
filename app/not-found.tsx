import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { Icon } from '@/components/ui/icon';

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/[0.08] blur-[100px]" />
      <div className="panel relative w-full max-w-md overflow-hidden rounded-2xl p-6 text-center shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-container-high text-tertiary">
          <Icon name="qr_code_scanner" className="text-[30px]" />
        </div>
        <div className="mt-4 flex justify-center">
          <Logo size={38} withWordmark />
        </div>
        <h1 className="mt-5 text-headline-lg font-extrabold tracking-tight text-on-surface">
          QR meja tidak valid
        </h1>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Token QR mungkin sudah dirotasi atau halaman yang kamu buka tidak lengkap. Scan ulang QR
          yang tertera di meja, atau panggil waiter untuk bantuan.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            href="/login"
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-body-md font-bold text-on-primary transition-colors hover:bg-primary-fixed"
          >
            <Icon name="login" className="text-[18px]" />
            Masuk terminal staf
          </Link>
          <Link
            href="/"
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-container-high text-body-sm font-semibold text-on-surface transition-colors hover:bg-surface-bright"
          >
            <Icon name="refresh" className="text-[17px]" />
            Kembali ke awal
          </Link>
        </div>
        <p className="mt-4 text-[9px] uppercase tracking-[0.16em] text-on-surface-variant/50">
          Cue &amp; Tap · Billiard Hall &amp; Lounge
        </p>
      </div>
    </div>
  );
}
