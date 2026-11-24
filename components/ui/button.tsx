import { cn } from '@/lib/format';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'cyan';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary shadow-[0_10px_30px_-12px_rgba(78,222,163,0.65)] hover:bg-primary-fixed active:bg-primary-fixed-dim',
  secondary:
    'bg-surface-container-high text-on-surface border border-outline-variant/60 hover:bg-surface-bright hover:border-outline',
  ghost:
    'text-on-surface-variant hover:bg-surface-container hover:text-on-surface border border-transparent',
  danger:
    'bg-error/10 text-error border border-error/35 hover:bg-error/20 hover:border-error/60',
  outline:
    'bg-transparent text-primary border border-primary/35 hover:bg-primary/10 hover:border-primary/60',
  cyan:
    'bg-secondary-container text-on-secondary-container shadow-[0_10px_30px_-12px_rgba(76,215,246,0.5)] hover:brightness-110',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-body-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-body-md gap-2 rounded-lg',
  lg: 'h-11 px-5 text-body-md font-bold gap-2 rounded-xl',
  icon: 'h-10 w-10 p-0 rounded-lg',
  'icon-sm': 'h-8 w-8 p-0 rounded-lg',
};

export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cn(
    'inline-flex select-none items-center justify-center font-semibold transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[18px]">
          progress_activity
        </span>
      ) : null}
      {children}
    </button>
  );
}
