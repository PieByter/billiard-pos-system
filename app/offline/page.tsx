import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { Icon } from '@/components/ui/icon';

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="panel w-full max-w-md rounded-2xl p-6 text-center">
        <div className="flex justify-center">
          <Logo size={44} withWordmark />
        </div>
        <div className="mx-auto mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-tertiary/10 text-tertiary">
          <Icon name="wifi_off" className="text-[30px]" />
        </div>
        <h1 className="mt-4 text-headline-lg font-extrabold tracking-tight text-on-surface">
          Koneksi terputus
        </h1>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Halaman ini tersimpan di cache PWA. Menu terakhir yang pernah dibuka masih bisa dilihat,
          tetapi order dan pembayaran membutuhkan koneksi internet.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            href="/"
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-body-md font-bold text-on-primary transition-colors hover:bg-primary-fixed"
          >
            <Icon name="refresh" className="text-[18px]" />
            Coba lagi
          </Link>
          <p className="text-[10px] text-on-surface-variant/60">
            SOP offline: catat order manual, sinkronkan ke kasir saat koneksi kembali.
          </p>
        </div>
      </div>
    </div>
  );
}
