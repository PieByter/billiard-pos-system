import { cn } from '@/lib/format';

export type BadgeTone =
  | 'primary'
  | 'paused'
  | 'error'
  | 'cyan'
  | 'tertiary'
  | 'neutral'
  | 'outline'
  | 'dark';

const tones: Record<BadgeTone, string> = {
  primary: 'bg-primary/15 text-primary border-primary/30',
  paused: 'bg-tertiary/15 text-tertiary border-tertiary/30',
  error: 'bg-error/12 text-error border-error/30',
  cyan: 'bg-secondary/15 text-secondary border-secondary/30',
  tertiary: 'bg-tertiary/15 text-tertiary border-tertiary/30',
  neutral:
    'bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/15',
  outline: 'bg-surface-container-high/60 text-outline border-outline-variant/50',
  dark: 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/40',
};

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
};

export function Badge({
  tone = 'neutral',
  dot = false,
  pulse = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-[3px] text-label-badge font-bold uppercase tracking-[0.08em]',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full bg-current',
            pulse && 'animate-pulse',
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
