'use client';

import { useMemo } from 'react';
import {
  computeBillTotals,
  computeSessionAmountFromSeconds,
  formatDuration,
} from '@/lib/billing';
import { formatRp } from '@/lib/format';
import type { BillView, SessionView } from '@/lib/types';
import { useLiveSeconds } from '@/components/live/live';

export function useLiveSessionValue(session: SessionView | null) {
  const running = session?.status === 'running';
  const seconds = useLiveSeconds(session?.baseElapsedSeconds ?? 0, running);
  const amount = useMemo(() => {
    if (!session) return 0;
    if (session.status === 'finished') return session.amount ?? session.estimate;
    return computeSessionAmountFromSeconds(seconds, {
      ratePerHour: session.ratePerHour,
      minMinutes: session.minMinutes,
      incrementMinutes: session.incrementMinutes,
    }).amount;
  }, [session, seconds]);
  return { seconds, amount };
}

export function LiveSessionValue({
  session,
  className,
  showDuration = false,
}: {
  session: SessionView | null;
  className?: string;
  showDuration?: boolean;
}) {
  const { seconds, amount } = useLiveSessionValue(session);
  return (
    <span className={className}>
      {showDuration ? (
        <span className="mr-2 text-on-surface-variant">{formatDuration(seconds)}</span>
      ) : null}
      {formatRp(amount)}
    </span>
  );
}

export function useLiveBillTotals(bill: BillView) {
  const active = bill.activeSession;
  const running = active?.status === 'running';
  const seconds = useLiveSeconds(active?.baseElapsedSeconds ?? 0, running);
  const finishedSessions = bill.sessions.filter((session) => session.status === 'finished');
  const finishedTotal = finishedSessions.reduce(
    (sum, session) => sum + (session.amount ?? session.estimate),
    0,
  );
  const liveSession = active
    ? computeSessionAmountFromSeconds(seconds, {
        ratePerHour: active.ratePerHour,
        minMinutes: active.minMinutes,
        incrementMinutes: active.incrementMinutes,
      }).amount
    : 0;
  const sessionSubtotal = finishedTotal + liveSession;
  const totals = computeBillTotals({
    subtotal: sessionSubtotal + bill.ordersSubtotal,
    discountAmount:
      bill.discountAmount + bill.memberDiscountAmount + bill.promoDiscountAmount,
    taxRateBps: bill.taxRateBps,
    serviceRateBps: bill.serviceRateBps,
  });
  return { sessionSubtotal, activeSeconds: seconds, ...totals };
}

export function LiveTotalValue({ bill, className }: { bill: BillView; className?: string }) {
  const totals = useLiveBillTotals(bill);
  return <span className={className}>{formatRp(totals.total)}</span>;
}

export function LiveSessionSubtotal({ bill, className }: { bill: BillView; className?: string }) {
  const totals = useLiveBillTotals(bill);
  return <span className={className}>{formatRp(totals.sessionSubtotal)}</span>;
}
