'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { loginAction } from '@/app/actions/auth';
import { BilliardHero } from './billiard-hero';
import { Logo } from '@/components/ui/logo';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { FormError, Input } from '@/components/ui/form';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/constants';
import { cn } from '@/lib/format';

type Mode = 'supabase' | 'demo' | 'disabled';

const ROLE_ICON: Record<string, string> = {
  owner: 'workspace_premium',
  cashier: 'point_of_sale',
  kitchen: 'skillet',
};

const ROLE_TONE: Record<string, string> = {
  owner: 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15',
  cashier: 'border-secondary/30 bg-secondary/10 text-secondary hover:bg-secondary/15',
  kitchen: 'border-tertiary/30 bg-tertiary/10 text-tertiary hover:bg-tertiary/15',
};

export function LoginExperience({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState(mode === 'demo' ? 'kasir@cuetap.id' : '');
  const [password, setPassword] = useState(mode === 'demo' ? 'demo1234' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function doLogin(nextEmail: string, nextPassword: string, target: string) {
    setError(null);
    setLoading(target);
    try {
      const result = await loginAction(nextEmail, nextPassword);
      if (!result.ok) {
        setError(result.error);
        setLoading(null);
        return;
      }
      toast.success('Berhasil masuk. Selamat bekerja!');
      router.replace(result.data?.redirectTo ?? '/staff/cashier');
      router.refresh();
    } catch {
      setError('Tidak bisa menghubungi server. Coba lagi.');
      setLoading(null);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void doLogin(email, password, 'form');
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute -left-40 top-0 h-[520px] w-[520px] rounded-full bg-primary/[0.07] blur-[120px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[520px] w-[520px] rounded-full bg-secondary/[0.06] blur-[120px]" />

      <div className="relative mx-auto grid min-h-dvh w-full max-w-[1440px] lg:grid-cols-[1.08fr_0.92fr]">
        {/* Brand / product panel */}
        <section className="relative hidden flex-col justify-between gap-10 px-10 py-10 lg:flex xl:px-14 xl:py-12">
          <div className="flex items-center justify-between">
            <Logo size={44} withWordmark />
            <div className="flex items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container-lowest/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Venue Operating System
            </div>
          </div>

          <div className="max-w-[640px]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.08] px-3 py-1.5 text-label-badge font-bold uppercase tracking-[0.14em] text-primary">
              <Icon name="bolt" className="text-[15px]" />
              Built for cue sports & nightlife
            </div>
            <h1 className="text-[clamp(2.6rem,4.2vw,4rem)] font-extrabold leading-[1.02] tracking-[-0.045em] text-on-surface">
              Satu terminal untuk
              <span className="block bg-gradient-to-r from-primary via-primary-fixed to-secondary bg-clip-text text-transparent">
                meja, dapur, dan laci kas.
              </span>
            </h1>
            <p className="mt-5 max-w-[520px] text-body-lg text-on-surface-variant">
              Billing sesi billiard yang akurat, self-order QR untuk cafe, kitchen display
              realtime, sampai balancing shift — semuanya dalam satu alur yang dirancang untuk
              jam sibuk.
            </p>
          </div>

          <div className="max-w-[680px]">
            <BilliardHero />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              ['timer', 'Billing presisi', 'Snapshot tarif & pause'],
              ['qr_code_2', 'Self-order QR', 'Approval kasir tetap aman'],
              ['policy', 'Audit trail', 'Void & diskon tercatat'],
            ].map(([icon, title, description]) => (
              <div
                key={title}
                className="rounded-xl border border-outline-variant/25 bg-surface-container-lowest/50 p-3.5"
              >
                <Icon name={icon} className="text-[20px] text-primary" />
                <div className="mt-2 text-body-sm font-bold text-on-surface">{title}</div>
                <div className="mt-0.5 text-[11px] leading-4 text-on-surface-variant/80">
                  {description}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Login panel */}
        <section className="relative flex items-center justify-center px-4 py-8 sm:px-8 lg:border-l lg:border-outline-variant/20 lg:px-10">
          <div className="absolute inset-0 bg-gradient-to-b from-surface-container-lowest/30 via-transparent to-surface-container-lowest/30" />
          <div className="relative z-10 w-full max-w-[420px] animate-rise">
            <div className="mb-7 flex items-center justify-between lg:hidden">
              <Logo size={42} withWordmark />
              <span className="rounded-full border border-outline-variant/30 bg-surface-container-lowest/60 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                v1.0
              </span>
            </div>

            <div className="mb-5 flex items-center justify-between">
              <span className="text-label-badge font-bold uppercase tracking-[0.16em] text-outline">
                Staff terminal
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
                  mode === 'demo'
                    ? 'border-tertiary/30 bg-tertiary/10 text-tertiary'
                    : mode === 'supabase'
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-error/30 bg-error/10 text-error',
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {mode === 'demo' ? 'Demo mode' : mode === 'supabase' ? 'Supabase auth' : 'Auth disabled'}
              </span>
            </div>

            <div className="panel relative overflow-hidden rounded-2xl p-5 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] sm:p-6">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
              <div className="mb-6">
                <h2 className="text-headline-md font-extrabold tracking-tight text-on-surface">
                  Masuk ke terminal
                </h2>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  Gunakan akun staff yang sudah terdaftar. Sesi login berlaku 12 jam.
                </p>
              </div>

              {mode === 'disabled' ? (
                <div className="mb-4 rounded-lg border border-tertiary/30 bg-tertiary/10 p-3 text-body-sm text-tertiary">
                  Supabase Auth belum dikonfigurasi. Isi{' '}
                  <code className="rounded bg-background/60 px-1">NEXT_PUBLIC_SUPABASE_URL</code> dan{' '}
                  <code className="rounded bg-background/60 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{' '}
                  pada environment Vercel.
                </div>
              ) : null}

              <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
                <Input
                  id="email"
                  label="Email staff"
                  type="email"
                  autoComplete="email"
                  placeholder="nama@cuetap.id"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  leading={<Icon name="alternate_email" className="text-[18px]" />}
                  required
                />
                <Input
                  id="password"
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  leading={<Icon name="lock" className="text-[18px]" />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="text-on-surface-variant transition-colors hover:text-on-surface"
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    >
                      <Icon name={showPassword ? 'visibility_off' : 'visibility'} className="text-[18px]" />
                    </button>
                  }
                  required
                />

                <FormError message={error} />

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="mt-1 w-full"
                  loading={loading === 'form'}
                  disabled={Boolean(loading)}
                >
                  <Icon name="login" className="text-[18px]" />
                  Masuk ke POS
                </Button>
              </form>

              {mode === 'demo' ? (
                <div className="mt-5">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-label-badge font-bold uppercase tracking-[0.14em] text-outline">
                      Akun demo · 1 tap login
                    </span>
                    <span className="numeric rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] text-on-surface-variant">
                      {DEMO_PASSWORD}
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {DEMO_ACCOUNTS.map((account) => (
                      <button
                        key={account.email}
                        type="button"
                        onClick={() => {
                          setEmail(account.email);
                          setPassword(DEMO_PASSWORD);
                          void doLogin(account.email, DEMO_PASSWORD, account.email);
                        }}
                        disabled={Boolean(loading)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all disabled:opacity-60',
                          ROLE_TONE[account.role],
                        )}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/30">
                          <Icon
                            name={loading === account.email ? 'progress_activity' : ROLE_ICON[account.role]}
                            className={cn('text-[18px]', loading === account.email && 'animate-spin')}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-body-sm font-bold text-on-surface">{account.label}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                              {account.name}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] opacity-80">
                            {account.description}
                          </span>
                        </span>
                        <Icon name="arrow_forward" className="text-[16px] opacity-60" />
                      </button>
                    ))}
                  </div>
                  <p className="mt-2.5 text-center text-[10px] leading-4 text-on-surface-variant/60">
                    Demo memakai database lokal PGlite yang otomatis di-seed. Data tersimpan di
                    folder <code>.data</code>.
                  </p>
                </div>
              ) : null}

              <div className="mt-5 flex items-center gap-2 border-t border-outline-variant/25 pt-4 text-[10px] text-on-surface-variant/60">
                <Icon name="verified_user" className="text-[15px] text-primary/80" />
                <span>HttpOnly session · RLS deny-all · Audit log append-only</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.12em] text-on-surface-variant/50">
              <span>Cue &amp; Tap · {new Date().getFullYear()}</span>
              <span>Guest self-order QR</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
