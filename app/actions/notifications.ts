'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  processNotificationOutbox,
  retryNotification,
} from '@/lib/services/notifications';

export async function processNotificationsAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof processNotificationOutbox>>>
> {
  return runAction(async () => {
    await requireStaffAction(['owner']);
    const result = await processNotificationOutbox(25);
    revalidateOps();
    return result;
  });
}

export async function retryNotificationAction(
  notificationId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof retryNotification>>>> {
  return runAction(async () => {
    await requireStaffAction(['owner']);
    const data = parseOrThrow(z.string().uuid(), notificationId);
    const result = await retryNotification(data);
    revalidateOps();
    return result;
  });
}
