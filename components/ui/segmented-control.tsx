'use client';

import { cn } from '@/lib/format';
import { Icon } from './icon';

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: string;
  count?: number;
  tone?: 'primary' | 'secondary' | 'tertiary' | 'error';
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 overflow-x-auto rounded-xl bg-surface-container-lowest p-1 no-scrollbar',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg font-semibold transition-all',
              size === 'sm' ? 'px-2.5 py-1.5 text-body-sm' : 'px-3.5 py-2 text-body-md',
              active
                ? 'bg-surface-container-high text-primary shadow-[0_6px_16px_-8px_rgba(0,0,0,0.8)]'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
            )}
          >
            {option.icon ? (
              <Icon
                name={option.icon}
                className={cn(
                  'text-[17px]',
                  option.tone === 'secondary' && !active && 'text-secondary/80',
                  option.tone === 'tertiary' && !active && 'text-tertiary/80',
                  option.tone === 'error' && !active && 'text-error/80',
                )}
              />
            ) : null}
            <span>{option.label}</span>
            {typeof option.count === 'number' ? (
              <span
                className={cn(
                  'numeric ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'bg-surface-container text-on-surface-variant',
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
