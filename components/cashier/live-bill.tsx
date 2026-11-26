'use client';

import { useMemo } from 'react';
import {
  computeBillTotals,
  computeSegmentedSessionBilling,
  formatDuration,
} from '@/lib/billing';
import { formatRp } from '@/lib/format';
import type { BillView, SessionView } from '@/lib/types';
import { useLiveSeconds } from '@/components/live/live';

export function useLiveSessionBilling(session: SessionView | null) {
  const running = session?.status === 'running';
  const seconds = useLiveSeconds(session?.baseElapsedSeconds ?? 0, running);
  const billing = useMemo(() => {
    if (!session) return null;
    const startMs = new Date(session.startedAt).getTime();
    const at =
      session.status === 'finished'
        ? new Date(session.endedAt ?? session.startedAt).toISOString()
        : session.status === 'paused'
          ? new Date(session.pausedAt ?? session.startedAt).toISOString()
          : new Date(
              startMs +
                (session.baseElapsedSeconds + session.pausedSeconds + seconds) * 1000,
            ).toISOString();
    return computeSegmentedSessionBilling({
      startedAt: session.startedAt,
      endedAt: at,
      pauses: session.pauses,
      segments: session.rateSegments,
      ratePerHour: session.ratePerHour,
      minMinutes: session.minMinutes,
      incrementMinutes: session.incrementMinutes,
      rateName: session.rateSegments[0]?.rateName,
    });
  }, [session, seconds]);
  const amount =
    session?.status === 'finished'
      ? (session.amount ?? billing?.amount ?? 0)
      : (billing?.amount ?? 0);
  return { seconds, amount, billing };
}

export function useLiveSessionValue(session: SessionView | null) {
  const { seconds, amount } = useLiveSessionBilling(session);
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
  const { seconds, amount: liveSession } = useLiveSessionBilling(active);
  const finishedSessions = bill.sessions.filter((session) => session.status === 'finished');
  const finishedTotal = finishedSessions.reduce(
    (sum, session) => sum + (session.amount ?? session.estimate),
    0,
  );
  const sessionSubtotal = finishedTotal + liveSession;
  const totals = computeBillTotals({
    subtotal: sessionSubtotal + bill.ordersSubtotal,
    discountAmount:
      bill.discountAmount +
      bill.memberDiscountAmount +
      bill.promoDiscountAmount +
      bill.pointsDiscountAmount +
      bill.voucherDiscountAmount,
    taxRateBps: bill.taxRateBps,
    serviceRateBps: bill.serviceRateBps,
  });
  return {
    sessionSubtotal,
    activeSeconds: seconds,
    ...totals,
    total: totals.total + bill.penaltyAmount,
  };
}

export function LiveTotalValue({ bill, className }: { bill: BillView; className?: string }) {
  const totals = useLiveBillTotals(bill);
  return <span className={className}>{formatRp(totals.total)}</span>;
}

export function LiveSessionSubtotal({ bill, className }: { bill: BillView; className?: string }) {
  const totals = useLiveBillTotals(bill);
  return <span className={className}>{formatRp(totals.sessionSubtotal)}</span>;
}
