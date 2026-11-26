'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  completePrintJob,
  getPrintJobPayload,
  queueBillReprint,
  queueTestPrint,
  retryPrintJob,
} from '@/lib/services/printing';

export async function retryPrintJobAction(
  jobId: string,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(z.string().uuid(), jobId);
    const result = await retryPrintJob(data, staff.id);
    revalidateOps();
    return result;
  });
}

export async function queueTestPrintAction(): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const result = await queueTestPrint(staff.id);
    revalidateOps();
    return result;
  });
}

export async function getPrintJobPayloadAction(
  jobId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof getPrintJobPayload>>>> {
  return runAction(async () => {
    await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), jobId);
    return getPrintJobPayload(data);
  });
}

export async function completePrintJobAction(
  jobId: string,
  ok: boolean,
  error?: string | null,
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        jobId: z.string().uuid(),
        ok: z.boolean(),
        error: z.string().max(500).optional().nullable(),
      }),
      { jobId, ok, error },
    );
    const result = await completePrintJob(data.jobId, 'webusb', data.ok, data.error);
    revalidateOps();
    return result;
  });
}

export async function reprintBillAction(
  billId: string,
): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), billId);
    const result = await queueBillReprint(data, staff.id);
    revalidateOps();
    return result;
  });
}
