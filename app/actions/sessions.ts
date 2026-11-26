'use server';

import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import {
  markTableReady,
  moveBill,
  openCafeBill,
  pauseBilliardSession,
  resumeBilliardSession,
  startBilliardSession,
  stopBilliardSession,
} from '@/lib/services/sessions';
import { previewRateForTable } from '@/lib/services/rate-schedules';

export async function getRatePreviewAction(
  tableId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof previewRateForTable>>>> {
  return runAction(async () => {
    await requireStaffAction(['cashier', 'owner']);
    return previewRateForTable(tableId);
  });
}

export async function startSessionAction(
  tableId: string,
  guestName?: string | null,
): Promise<ActionResult<Awaited<ReturnType<typeof startBilliardSession>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const result = await startBilliardSession(tableId, staff.id, guestName);
    revalidateOps();
    return result;
  });
}

export async function pauseSessionAction(
  tableId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof pauseBilliardSession>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const result = await pauseBilliardSession(tableId, staff.id);
    revalidateOps();
    return result;
  });
}

export async function resumeSessionAction(
  tableId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof resumeBilliardSession>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const result = await resumeBilliardSession(tableId, staff.id);
    revalidateOps();
    return result;
  });
}

export async function stopSessionAction(
  tableId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof stopBilliardSession>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const result = await stopBilliardSession(tableId, staff.id);
    revalidateOps();
    return result;
  });
}

export async function moveBillAction(
  fromTableId: string,
  toTableId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof moveBill>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const result = await moveBill(fromTableId, toTableId, staff.id);
    revalidateOps();
    return result;
  });
}

export async function openCafeBillAction(
  tableId: string,
  guestName?: string | null,
): Promise<ActionResult<Awaited<ReturnType<typeof openCafeBill>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const result = await openCafeBill(tableId, staff.id, guestName);
    revalidateOps();
    return result;
  });
}

export async function markTableReadyAction(
  tableId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof markTableReady>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const result = await markTableReady(tableId, staff.id);
    revalidateOps();
    return result;
  });
}
