'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  createBillQrisIntent,
  createBillSplitQrisIntent,
  getQrisIntentStatus,
  simulateMockIntentPaid,
} from '@/lib/services/payment-intents';

export async function createQrisIntentAction(
  billId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof createBillQrisIntent>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), billId);
    const result = await createBillQrisIntent(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function createSplitQrisIntentAction(
  splitId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof createBillSplitQrisIntent>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), splitId);
    const result = await createBillSplitQrisIntent(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function getQrisIntentStatusAction(
  intentId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof getQrisIntentStatus>>>> {
  return runAction(async () => {
    await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), intentId);
    return getQrisIntentStatus(data);
  });
}

export async function simulateMockIntentPaidAction(
  intentId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof simulateMockIntentPaid>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), intentId);
    const result = await simulateMockIntentPaid(staff.id, data);
    revalidateOps();
    return result;
  });
}
