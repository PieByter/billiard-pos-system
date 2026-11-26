'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  createBillSplits,
  payBillSplit,
  resetBillSplits,
  type SplitGroupInput,
} from '@/lib/services/splits';

const groupSchema = z.object({
  label: z.string().min(1).max(40),
  itemIds: z.array(z.string().uuid()).max(100),
  sessionIds: z.array(z.string().uuid()).max(10),
});

const splitPaymentSchema = z.object({
  method: z.enum(['cash', 'qris', 'transfer', 'edc']),
  amount: z.coerce.number().int().min(1).max(1_000_000_000),
  tendered: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
});

export async function createBillSplitsAction(
  billId: string,
  groups: SplitGroupInput[],
): Promise<ActionResult<Awaited<ReturnType<typeof createBillSplits>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        billId: z.string().uuid(),
        groups: z.array(groupSchema).min(2).max(10),
      }),
      { billId, groups },
    );
    const result = await createBillSplits(staff.id, data.billId, data.groups);
    revalidateOps();
    return result;
  });
}

export async function resetBillSplitsAction(
  billId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof resetBillSplits>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), billId);
    const result = await resetBillSplits(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function payBillSplitAction(
  splitId: string,
  payments: Array<{ method: 'cash' | 'qris' | 'transfer' | 'edc'; amount: number; tendered?: number }>,
): Promise<ActionResult<Awaited<ReturnType<typeof payBillSplit>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        splitId: z.string().uuid(),
        payments: z.array(splitPaymentSchema).min(1).max(6),
      }),
      { splitId, payments },
    );
    const result = await payBillSplit(staff.id, data.splitId, data.payments);
    revalidateOps();
    return result;
  });
}
