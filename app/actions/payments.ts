'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  applyBillDiscount,
  payBill,
  voidBill,
} from '@/lib/services/payments';
import type { PaymentInput } from '@/lib/types';

const paymentSchema = z.object({
  method: z.enum(['cash', 'qris', 'transfer', 'edc']),
  amount: z.coerce.number().int().min(1).max(1_000_000_000),
  tendered: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
});

export async function payBillAction(
  billId: string,
  payments: PaymentInput[],
): Promise<ActionResult<Awaited<ReturnType<typeof payBill>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        billId: z.string().uuid(),
        payments: z.array(paymentSchema).min(1).max(6),
      }),
      { billId, payments },
    );
    const result = await payBill(data.billId, staff.id, data.payments);
    revalidateOps();
    return result;
  });
}

export async function applyDiscountAction(
  billId: string,
  amount: number,
  reason: string,
): Promise<ActionResult<Awaited<ReturnType<typeof applyBillDiscount>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        billId: z.string().uuid(),
        amount: z.coerce.number().int().min(0).max(100_000_000),
        reason: z.string().max(240),
      }),
      { billId, amount, reason },
    );
    const result = await applyBillDiscount(data.billId, staff.id, data.amount, data.reason);
    revalidateOps();
    return result;
  });
}

export async function voidBillAction(
  billId: string,
  reason: string,
): Promise<ActionResult<Awaited<ReturnType<typeof voidBill>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({ billId: z.string().uuid(), reason: z.string().min(3).max(240) }),
      { billId, reason },
    );
    const result = await voidBill(data.billId, staff.id, data.reason);
    revalidateOps();
    return result;
  });
}
