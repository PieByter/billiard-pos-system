'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  attachMemberToBill,
  detachMemberFromBill,
  saveMember,
  saveMemberTier,
} from '@/lib/services/membership';
import { searchMembers } from '@/lib/queries/membership';
import type { MemberView } from '@/lib/types';

export async function searchMembersAction(term: string): Promise<ActionResult<MemberView[]>> {
  return runAction(async () => {
    await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().max(80), term);
    return searchMembers(data);
  });
}

export async function saveMemberAction(input: {
  id?: string;
  name: string;
  phone: string;
  email?: string | null;
  note?: string | null;
  consent?: boolean;
  active?: boolean;
}): Promise<ActionResult<{ id: string; code: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(80),
        phone: z.string().min(6).max(30),
        email: z.string().email().max(160).optional().nullable(),
        note: z.string().max(500).optional().nullable(),
        consent: z.boolean().optional(),
        active: z.boolean().optional(),
      }),
      input,
    );
    const result = await saveMember(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function saveMemberTierAction(input: {
  id?: string;
  name: string;
  minSpend: number;
  discountBps: number;
  pointsMultiplierBps: number;
  active?: boolean;
  sortOrder?: number;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(60),
        minSpend: z.coerce.number().int().min(0).max(1_000_000_000),
        discountBps: z.coerce.number().int().min(0).max(10_000),
        pointsMultiplierBps: z.coerce.number().int().min(1).max(100_000),
        active: z.boolean().optional(),
        sortOrder: z.coerce.number().int().min(0).max(999).optional(),
      }),
      input,
    );
    const result = await saveMemberTier(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function attachMemberAction(
  billId: string,
  memberId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof attachMemberToBill>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({ billId: z.string().uuid(), memberId: z.string().uuid() }),
      { billId, memberId },
    );
    const result = await attachMemberToBill(staff.id, data.billId, data.memberId);
    revalidateOps();
    return result;
  });
}

export async function detachMemberAction(
  billId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof detachMemberFromBill>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), billId);
    const result = await detachMemberFromBill(staff.id, data);
    revalidateOps();
    return result;
  });
}
