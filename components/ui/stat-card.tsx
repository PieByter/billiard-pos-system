import { cn } from '@/lib/format';
import { Icon } from './icon';

const toneClasses = {
  primary: {
    icon: 'bg-primary/10 text-primary border-primary/20',
    value: 'text-on-surface',
    accent: 'from-primary/45',
  },
  cyan: {
    icon: 'bg-secondary/10 text-secondary border-secondary/20',
    value: 'text-secondary',
    accent: 'from-secondary/40',
  },
  tertiary: {
    icon: 'bg-tertiary/10 text-tertiary border-tertiary/20',
    value: 'text-tertiary',
    accent: 'from-tertiary/40',
  },
  error: {
    icon: 'bg-error/10 text-error border-error/20',
    value: 'text-error',
    accent: 'from-error/40',
  },
  neutral: {
    icon: 'bg-surface-container-high text-on-surface-variant border-outline-variant/20',
    value: 'text-on-surface',
    accent: 'from-outline/30',
  },
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'primary',
  footer,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: string;
  tone?: keyof typeof toneClasses;
  footer?: React.ReactNode;
  className?: string;
}) {
  const classes = toneClasses[tone];
  return (
    <div
      className={cn(
        'panel relative overflow-hidden rounded-xl p-4 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9)]',
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent',
          classes.accent,
        )}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-label-badge font-bold uppercase tracking-[0.09em] text-on-surface-variant">
          {label}
        </span>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg border',
            classes.icon,
          )}
        >
          <Icon name={icon} className="text-[18px]" />
        </span>
      </div>
      <div className={cn('mt-2 numeric text-numeric-lg font-bold tracking-tight', classes.value)}>
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-body-sm text-on-surface-variant">{hint}</div>
      ) : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-lowest/40 text-center',
        compact ? 'gap-1 px-4 py-6' : 'gap-2 px-6 py-12',
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-outline">
        <Icon name={icon} className="text-[20px]" />
      </span>
      <p className="mt-1 text-body-md font-bold text-on-surface">{title}</p>
      {description ? (
        <p className="max-w-sm text-body-sm text-on-surface-variant">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 flex items-center gap-2 text-label-badge font-bold uppercase tracking-[0.14em] text-primary">
            <span className="h-1 w-4 rounded-full bg-primary/70" />
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-headline-lg font-extrabold tracking-tight text-on-surface">{title}</h1>
        {description ? (
          <p className="mt-1 text-body-md text-on-surface-variant">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function InfoRow({
  label,
  value,
  strong = false,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 text-body-sm',
        strong && 'font-semibold',
        className,
      )}
    >
      <span className="text-on-surface-variant">{label}</span>
      <span className={cn('numeric text-on-surface', strong && 'font-bold')}>{value}</span>
    </div>
  );
}
