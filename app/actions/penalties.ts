'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  applyPenalty,
  savePenaltyRule,
  togglePenaltyRule,
  waivePenalty,
  type PenaltyRuleInput,
} from '@/lib/services/penalties';

export async function savePenaltyRuleAction(
  input: PenaltyRuleInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(80),
        type: z.enum(['overtime', 'no_show', 'cancellation', 'damage', 'loss', 'other']),
        defaultAmount: z.coerce.number().int().min(0).max(1_000_000_000),
        maxAmount: z.coerce.number().int().min(0).max(1_000_000_000).optional().nullable(),
        graceMinutes: z.coerce.number().int().min(0).max(240).optional(),
        ratePerHour: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
        autoApply: z.boolean().optional(),
        active: z.boolean().optional(),
      }),
      input,
    );
    const result = await savePenaltyRule(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function togglePenaltyRuleAction(
  ruleId: string,
): Promise<ActionResult<{ active: boolean }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(z.string().uuid(), ruleId);
    const result = await togglePenaltyRule(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function applyPenaltyAction(
  billId: string,
  input: {
    ruleId?: string | null;
    type: 'overtime' | 'no_show' | 'cancellation' | 'damage' | 'loss' | 'other';
    amount: number;
    reason: string;
  },
): Promise<ActionResult<Awaited<ReturnType<typeof applyPenalty>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        billId: z.string().uuid(),
        ruleId: z.string().uuid().optional().nullable(),
        type: z.enum(['overtime', 'no_show', 'cancellation', 'damage', 'loss', 'other']),
        amount: z.coerce.number().int().min(1).max(1_000_000_000),
        reason: z.string().min(3).max(240),
      }),
      { billId, ...input },
    );
    const result = await applyPenalty(staff.id, data.billId, data);
    revalidateOps();
    return result;
  });
}

export async function waivePenaltyAction(
  penaltyId: string,
  reason: string,
): Promise<ActionResult<Awaited<ReturnType<typeof waivePenalty>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({ penaltyId: z.string().uuid(), reason: z.string().min(3).max(240) }),
      { penaltyId, reason },
    );
    const result = await waivePenalty(staff.id, data.penaltyId, data.reason);
    revalidateOps();
    return result;
  });
}
