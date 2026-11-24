export function BilliardHero() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/70 p-3 shadow-[0_30px_100px_-40px_rgba(0,0,0,0.9)]">
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-secondary/10 blur-3xl" />
      <svg
        viewBox="0 0 700 440"
        className="relative z-10 w-full"
        role="img"
        aria-label="Ilustrasi meja billiard Cue & Tap"
      >
        <defs>
          <linearGradient id="felt" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0c5a42" />
            <stop offset="0.55" stopColor="#084432" />
            <stop offset="1" stopColor="#05291f" />
          </linearGradient>
          <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b2b1c" />
            <stop offset="1" stopColor="#1b140d" />
          </linearGradient>
          <linearGradient id="cue" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f8fafc" />
            <stop offset="0.45" stopColor="#d6b98c" />
            <stop offset="0.75" stopColor="#a86a3a" />
            <stop offset="1" stopColor="#f8fafc" />
          </linearGradient>
          <radialGradient id="ball8" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#4a5568" />
            <stop offset="0.45" stopColor="#151b26" />
            <stop offset="1" stopColor="#05070b" />
          </radialGradient>
          <radialGradient id="ballYellow" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#ffe7a8" />
            <stop offset="0.55" stopColor="#f5b93f" />
            <stop offset="1" stopColor="#9a6206" />
          </radialGradient>
          <radialGradient id="ballCyan" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#d7fbff" />
            <stop offset="0.55" stopColor="#4cd7f6" />
            <stop offset="1" stopColor="#03677a" />
          </radialGradient>
          <radialGradient id="ballRed" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#ffd9d5" />
            <stop offset="0.55" stopColor="#e85b50" />
            <stop offset="1" stopColor="#731b16" />
          </radialGradient>
          <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="14" stdDeviation="18" floodColor="#000000" floodOpacity="0.55" />
          </filter>
          <filter id="ballGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ambient grid */}
        <g stroke="#4edea3" strokeOpacity="0.06">
          {Array.from({ length: 14 }).map((_, index) => (
            <line key={`v${index}`} x1={index * 52} y1="0" x2={index * 52} y2="440" />
          ))}
          {Array.from({ length: 9 }).map((_, index) => (
            <line key={`h${index}`} x1="0" y1={index * 52} x2="700" y2={index * 52} />
          ))}
        </g>

        {/* table shadow */}
        <rect x="58" y="82" width="584" height="300" rx="28" fill="#020407" opacity="0.55" filter="url(#softShadow)" />

        {/* wooden rail */}
        <rect x="48" y="66" width="604" height="316" rx="30" fill="url(#rail)" stroke="#5a422a" strokeWidth="1.5" />
        <rect x="58" y="76" width="584" height="296" rx="24" fill="#0a0f18" stroke="#1e293b" strokeWidth="1" />

        {/* felt */}
        <rect x="76" y="94" width="548" height="260" rx="18" fill="url(#felt)" stroke="#0f7a58" strokeOpacity="0.55" />
        <rect x="86" y="104" width="528" height="240" rx="12" fill="none" stroke="#4edea3" strokeOpacity="0.12" />

        {/* head string + spots */}
        <line x1="212" y1="112" x2="212" y2="336" stroke="#dae2fd" strokeOpacity="0.12" strokeDasharray="4 8" />
        <circle cx="212" cy="224" r="2.5" fill="#dae2fd" fillOpacity="0.35" />
        <circle cx="488" cy="224" r="2.5" fill="#dae2fd" fillOpacity="0.35" />

        {/* pockets */}
        {[
          [76, 94],
          [350, 88],
          [624, 94],
          [76, 354],
          [350, 360],
          [624, 354],
        ].map(([cx, cy], index) => (
          <g key={index}>
            <circle cx={cx} cy={cy} r="17" fill="#03060b" stroke="#3b2b1c" strokeWidth="4" />
            <circle cx={cx} cy={cy} r="11" fill="#010204" />
          </g>
        ))}

        {/* cue stick */}
        <g transform="rotate(-28 180 330)">
          <rect x="40" y="332" width="330" height="7" rx="3.5" fill="url(#cue)" opacity="0.95" />
          <rect x="40" y="332" width="58" height="7" rx="3.5" fill="#1b140d" />
          <rect x="352" y="332" width="20" height="7" rx="3.5" fill="#e8eeff" />
          <rect x="372" y="332" width="8" height="7" rx="3.5" fill="#4cd7f6" />
        </g>

        {/* balls */}
        <g filter="url(#ballGlow)">
          <circle cx="476" cy="208" r="20" fill="url(#ball8)" stroke="#4a5568" strokeWidth="1" />
          <circle cx="476" cy="208" r="10.5" fill="#f8fafc" />
          <text x="476" y="212.5" textAnchor="middle" fontFamily="Plus Jakarta Sans Variable, sans-serif" fontSize="12" fontWeight="800" fill="#0b1326">8</text>

          <circle cx="522" cy="246" r="18" fill="url(#ballYellow)" />
          <circle cx="542" cy="212" r="18" fill="url(#ballCyan)" />
          <circle cx="438" cy="252" r="18" fill="url(#ballRed)" />
          <circle cx="404" cy="196" r="17" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
          <circle cx="570" cy="160" r="14" fill="url(#ballCyan)" opacity="0.85" />
          <circle cx="350" cy="258" r="13" fill="url(#ballYellow)" opacity="0.8" />
        </g>

        {/* chalk + cue tip */}
        <g transform="translate(618 328)">
          <rect x="0" y="0" width="26" height="18" rx="4" fill="#1e293b" stroke="#4cd7f6" strokeOpacity="0.4" />
          <rect x="4" y="3" width="18" height="12" rx="2" fill="#4edea3" fillOpacity="0.55" />
        </g>

        {/* telemetry chips */}
        <g transform="translate(104 120)">
          <rect width="154" height="40" rx="10" fill="#060e20" fillOpacity="0.86" stroke="#4edea3" strokeOpacity="0.25" />
          <circle cx="18" cy="20" r="4" fill="#4edea3">
            <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
          </circle>
          <text x="32" y="17" fontFamily="Plus Jakarta Sans Variable, sans-serif" fontSize="8" fontWeight="700" fill="#86948a" letterSpacing="1.4">TABLE B1</text>
          <text x="32" y="30" fontFamily="JetBrains Mono Variable, monospace" fontSize="12" fontWeight="700" fill="#4edea3">01:47:23</text>
        </g>
        <g transform="translate(472 120)">
          <rect width="154" height="40" rx="10" fill="#060e20" fillOpacity="0.86" stroke="#4cd7f6" strokeOpacity="0.25" />
          <circle cx="18" cy="20" r="4" fill="#4cd7f6">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <text x="32" y="17" fontFamily="Plus Jakarta Sans Variable, sans-serif" fontSize="8" fontWeight="700" fill="#86948a" letterSpacing="1.4">KDS · KITCHEN</text>
          <text x="32" y="30" fontFamily="JetBrains Mono Variable, monospace" fontSize="12" fontWeight="700" fill="#4cd7f6">4 TICKETS</text>
        </g>
      </svg>
    </div>
  );
}
