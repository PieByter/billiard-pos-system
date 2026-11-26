'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  processNotificationOutbox,
  retryNotification,
  runNotificationCron,
  saveNotificationTemplate,
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

export async function runNotificationCronAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof runNotificationCron>>>
> {
  return runAction(async () => {
    await requireStaffAction(['owner']);
    const result = await runNotificationCron();
    revalidateOps();
    return result;
  });
}

export async function saveNotificationTemplateAction(input: {
  templateKey: 'receipt' | 'order_ready' | 'reservation' | 'reservation_reminder' | 'test';
  name: string;
  channel?: 'email' | 'whatsapp' | 'log' | null;
  subject?: string | null;
  body: string;
  active?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        templateKey: z.enum([
          'receipt',
          'order_ready',
          'reservation',
          'reservation_reminder',
          'test',
        ]),
        name: z.string().min(2).max(100),
        channel: z.enum(['email', 'whatsapp', 'log']).optional().nullable(),
        subject: z.string().max(200).optional().nullable(),
        body: z.string().min(5).max(4000),
        active: z.boolean().optional(),
      }),
      input,
    );
    const result = await saveNotificationTemplate(staff.id, data);
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
