'use client';

import { cn } from '@/lib/format';

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer select-none items-center justify-between gap-3',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {label || description ? (
        <span className="flex min-w-0 flex-col">
          {label ? <span className="text-body-md font-semibold text-on-surface">{label}</span> : null}
          {description ? (
            <span className="text-body-sm text-on-surface-variant">{description}</span>
          ) : null}
        </span>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200',
          checked
            ? 'border-primary/50 bg-primary/25'
            : 'border-outline-variant/60 bg-surface-container-high',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4.5 w-4.5 rounded-full shadow-sm transition-all duration-200',
            checked ? 'left-[22px] bg-primary' : 'left-0.5 bg-on-surface-variant',
          )}
          style={{ height: 18, width: 18 }}
        />
      </button>
    </label>
  );
}
