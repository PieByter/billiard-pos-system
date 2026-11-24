import { cn } from '@/lib/format';

type LogoProps = {
  size?: number;
  className?: string;
  withWordmark?: boolean;
  subtitle?: string;
};

export function Logo({ size = 40, className, withWordmark = false, subtitle }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden
        className="shrink-0 drop-shadow-[0_0_18px_rgba(78,222,163,0.25)]"
      >
        <defs>
          <linearGradient id="cuetap-mark" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6ffbbe" />
            <stop offset="0.55" stopColor="#10b981" />
            <stop offset="1" stopColor="#047857" />
          </linearGradient>
          <linearGradient id="cuetap-cue" x1="8" y1="40" x2="42" y2="6" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffddb8" />
            <stop offset="0.7" stopColor="#e29100" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="13" fill="#060e20" />
        <rect x="0.5" y="0.5" width="47" height="47" rx="12.5" stroke="url(#cuetap-mark)" strokeOpacity="0.7" />
        <path d="M6 35L36 5" stroke="url(#cuetap-cue)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M33.5 7.5L37.5 3.5" stroke="#86948a" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="30" cy="30" r="12" fill="url(#cuetap-mark)" />
        <circle cx="30" cy="30" r="7.6" fill="#060e20" />
        <circle cx="30" cy="30" r="4.5" fill="#f8fafc" />
        <text
          x="30"
          y="32.4"
          textAnchor="middle"
          fontFamily="Plus Jakarta Sans Variable, sans-serif"
          fontSize="6.2"
          fontWeight="800"
          fill="#0b1326"
        >
          8
        </text>
        <circle cx="12" cy="12" r="2.2" fill="#4cd7f6" fillOpacity="0.75" />
      </svg>
      {withWordmark ? (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-extrabold tracking-tight text-on-surface">
            CUE <span className="text-primary">&amp;</span> TAP
          </span>
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-on-surface-variant/80">
            {subtitle ?? 'Billiard · Lounge · POS'}
          </span>
        </span>
      ) : null}
    </span>
  );
}
