'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  checkInReservation,
  createReservation,
  createWaitlistEntry,
  setReservationDeposit,
  setReservationStatus,
  setWaitlistStatus,
  type ReservationInput,
  type WaitlistInput,
} from '@/lib/services/reservations';

export async function createReservationAction(
  input: ReservationInput,
): Promise<ActionResult<Awaited<ReturnType<typeof createReservation>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        tableId: z.string().uuid(),
        guestName: z.string().min(2).max(80),
        phone: z.string().max(30).optional().nullable(),
        partySize: z.coerce.number().int().min(1).max(30),
        date: z.string().min(10).max(10),
        startTime: z.string().min(5).max(5),
        durationMinutes: z.coerce.number().int().min(15).max(480),
        depositAmount: z.coerce.number().int().min(0).max(100_000_000).optional(),
        note: z.string().max(500).optional().nullable(),
      }),
      input,
    );
    const result = await createReservation(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function setReservationStatusAction(
  reservationId: string,
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show',
): Promise<ActionResult<Awaited<ReturnType<typeof setReservationStatus>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        reservationId: z.string().uuid(),
        status: z.enum(['confirmed', 'completed', 'cancelled', 'no_show']),
      }),
      { reservationId, status },
    );
    const result = await setReservationStatus(staff.id, data.reservationId, data.status);
    revalidateOps();
    return result;
  });
}

export async function setReservationDepositAction(
  reservationId: string,
  status: 'pending' | 'paid' | 'refunded' | 'forfeited',
): Promise<ActionResult<Awaited<ReturnType<typeof setReservationDeposit>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        reservationId: z.string().uuid(),
        status: z.enum(['pending', 'paid', 'refunded', 'forfeited']),
      }),
      { reservationId, status },
    );
    const result = await setReservationDeposit(staff.id, data.reservationId, data.status);
    revalidateOps();
    return result;
  });
}

export async function checkInReservationAction(
  reservationId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof checkInReservation>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), reservationId);
    const result = await checkInReservation(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function createWaitlistAction(
  input: WaitlistInput,
): Promise<ActionResult<Awaited<ReturnType<typeof createWaitlistEntry>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        guestName: z.string().min(2).max(80),
        phone: z.string().max(30).optional().nullable(),
        partySize: z.coerce.number().int().min(1).max(30),
        preference: z.enum(['billiard', 'cafe']),
        estimatedWaitMinutes: z.coerce.number().int().min(0).max(240).optional(),
        note: z.string().max(500).optional().nullable(),
      }),
      input,
    );
    const result = await createWaitlistEntry(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function setWaitlistStatusAction(
  entryId: string,
  status: 'called' | 'seated' | 'cancelled' | 'no_show',
): Promise<ActionResult<Awaited<ReturnType<typeof setWaitlistStatus>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        entryId: z.string().uuid(),
        status: z.enum(['called', 'seated', 'cancelled', 'no_show']),
      }),
      { entryId, status },
    );
    const result = await setWaitlistStatus(staff.id, data.entryId, data.status);
    revalidateOps();
    return result;
  });
}
