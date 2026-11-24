'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import { closeShift, openShift } from '@/lib/services/shifts';

export async function openShiftAction(
  openingCash: number,
): Promise<ActionResult<Awaited<ReturnType<typeof openShift>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({ openingCash: z.coerce.number().int().min(0).max(1_000_000_000) }),
      { openingCash },
    );
    const result = await openShift(staff.id, data.openingCash);
    revalidateOps();
    return result;
  });
}

export async function closeShiftAction(
  actualCash: number,
  notes?: string | null,
): Promise<ActionResult<Awaited<ReturnType<typeof closeShift>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        actualCash: z.coerce.number().int().min(0).max(1_000_000_000),
        notes: z.string().max(800).optional().nullable(),
      }),
      { actualCash, notes },
    );
    const result = await closeShift(staff.id, data.actualCash, data.notes);
    revalidateOps();
    return result;
  });
}
