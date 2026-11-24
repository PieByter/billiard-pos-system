'use client';

import { useEffect, useMemo, useState } from 'react';
import { computeSessionAmountFromSeconds, formatDuration } from '@/lib/billing';
import { cn } from '@/lib/format';

/** Menambah detik lokal sejak render terakhir; reset saat data server berubah. */
export function useLiveSeconds(baseSeconds: number, running: boolean): number {
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    setExtra(0);
    if (!running) return;
    const timer = window.setInterval(() => setExtra((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [baseSeconds, running]);

  return baseSeconds + extra;
}

export function LiveDuration({
  baseSeconds,
  running,
  className,
}: {
  baseSeconds: number;
  running: boolean;
  className?: string;
}) {
  const seconds = useLiveSeconds(baseSeconds, running);
  return <span className={cn('numeric tabular', className)}>{formatDuration(seconds)}</span>;
}

export function LiveWait({
  seconds: initialSeconds,
  className,
}: {
  seconds: number;
  className?: string;
}) {
  const seconds = useLiveSeconds(initialSeconds, true);
  return <span className={cn('numeric tabular', className)}>{formatDuration(seconds)}</span>;
}

export function LiveSessionAmount({
  baseSeconds,
  running,
  rate,
  className,
}: {
  baseSeconds: number;
  running: boolean;
  rate: { ratePerHour: number; minMinutes: number; incrementMinutes: number };
  className?: string;
}) {
  const seconds = useLiveSeconds(baseSeconds, running);
  const amount = useMemo(
    () => computeSessionAmountFromSeconds(seconds, rate).amount,
    [seconds, rate],
  );
  return (
    <span className={cn('numeric tabular', className)}>
      Rp {new Intl.NumberFormat('id-ID').format(amount)}
    </span>
  );
}

export function LiveClock({ className }: { className?: string }) {
  const [text, setText] = useState('--:--:--');

  useEffect(() => {
    const update = () => {
      setText(
        new Intl.DateTimeFormat('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date()),
      );
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <span className={cn('numeric tabular', className)}>{text}</span>;
}

export function LiveDate({ className }: { className?: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    setText(
      new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        day: '2-digit',
        month: 'short',
      }).format(new Date()),
    );
  }, []);
  return <span className={className}>{text || '—'}</span>;
}
