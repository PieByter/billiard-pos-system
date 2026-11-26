'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import { addCashMovement } from '@/lib/services/cash';

export async function addCashMovementAction(input: {
  shiftId?: string;
  type: 'drop' | 'petty_cash' | 'adjustment' | 'transfer_in' | 'transfer_out';
  amount: number;
  reason: string;
}): Promise<ActionResult<Awaited<ReturnType<typeof addCashMovement>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        shiftId: z.string().uuid().optional(),
        type: z.enum(['drop', 'petty_cash', 'adjustment', 'transfer_in', 'transfer_out']),
        amount: z.coerce.number().int().min(1).max(1_000_000_000),
        reason: z.string().min(3).max(240),
      }),
      input,
    );
    const result = await addCashMovement(staff.id, data);
    revalidateOps();
    return result;
  });
}
