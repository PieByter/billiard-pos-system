'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/format';

export function MoneyInput({
  value,
  onChange,
  placeholder = '0',
  className,
  id,
  leading = true,
  allowEmpty = true,
}: {
  value: number | null;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  leading?: boolean;
  allowEmpty?: boolean;
}) {
  const format = (input: number | null) =>
    input && input > 0 ? new Intl.NumberFormat('id-ID').format(input) : '';
  const [text, setText] = useState(format(value));

  useEffect(() => {
    setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={cn('relative', className)}>
      {leading ? (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body-sm font-semibold text-on-surface-variant">
          Rp
        </span>
      ) : null}
      <input
        id={id}
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, '');
          if (!digits) {
            setText(allowEmpty ? '' : '0');
            onChange(0);
            return;
          }
          const numeric = Math.min(Number(digits), 1_000_000_000);
          setText(new Intl.NumberFormat('id-ID').format(numeric));
          onChange(numeric);
        }}
        className={cn(
          'numeric h-12 w-full rounded-lg border border-outline-variant/55 bg-surface-container-lowest px-3 text-right text-numeric-md font-bold text-on-surface placeholder:text-outline/60 focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/35',
          leading && 'pl-9',
        )}
      />
    </div>
  );
}
