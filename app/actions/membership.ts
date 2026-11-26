'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  applyVoucherToBill,
  attachMemberToBill,
  cancelPointsRedemption,
  cancelVoucherFromBill,
  detachMemberFromBill,
  getMemberBenefitsForBill,
  issueVoucher,
  redeemMemberPoints,
  saveMember,
  saveMemberTier,
  topUpMemberBalance,
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
  notifyEmail?: boolean;
  notifyWhatsapp?: boolean;
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
        notifyEmail: z.boolean().optional(),
        notifyWhatsapp: z.boolean().optional(),
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
  benefits?: string | null;
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
        benefits: z.string().max(300).optional().nullable(),
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

export async function getMemberBenefitsAction(
  billId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof getMemberBenefitsForBill>>>> {
  return runAction(async () => {
    await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), billId);
    return getMemberBenefitsForBill(data);
  });
}

export async function redeemPointsAction(
  billId: string,
  points: number,
): Promise<ActionResult<Awaited<ReturnType<typeof redeemMemberPoints>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({ billId: z.string().uuid(), points: z.coerce.number().int().min(1).max(1_000_000) }),
      { billId, points },
    );
    const result = await redeemMemberPoints(staff.id, data.billId, data.points);
    revalidateOps();
    return result;
  });
}

export async function cancelPointsAction(
  billId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof cancelPointsRedemption>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), billId);
    const result = await cancelPointsRedemption(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function issueVoucherAction(
  input: {
    memberId?: string | null;
    name: string;
    type: 'percent' | 'fixed';
    value: number;
    minSpend?: number;
    expiresAt?: string | null;
    code?: string | null;
  },
): Promise<ActionResult<{ id: string; code: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner', 'cashier']);
    const data = parseOrThrow(
      z.object({
        memberId: z.string().uuid().optional().nullable(),
        name: z.string().min(2).max(100),
        type: z.enum(['percent', 'fixed']),
        value: z.coerce.number().int().min(1).max(100_000_000),
        minSpend: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
        expiresAt: z.string().optional().nullable(),
        code: z.string().max(24).optional().nullable(),
      }),
      input,
    );
    const result = await issueVoucher(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function applyVoucherAction(
  billId: string,
  code: string,
): Promise<ActionResult<Awaited<ReturnType<typeof applyVoucherToBill>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({ billId: z.string().uuid(), code: z.string().min(1).max(24) }),
      { billId, code },
    );
    const result = await applyVoucherToBill(staff.id, data.billId, data.code);
    revalidateOps();
    return result;
  });
}

export async function cancelVoucherAction(
  billId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof cancelVoucherFromBill>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), billId);
    const result = await cancelVoucherFromBill(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function topUpBalanceAction(input: {
  memberId: string;
  amount: number;
  method: 'cash' | 'qris' | 'transfer' | 'edc';
  note?: string | null;
}): Promise<ActionResult<{ balance: number }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner', 'cashier']);
    const data = parseOrThrow(
      z.object({
        memberId: z.string().uuid(),
        amount: z.coerce.number().int().min(1).max(1_000_000_000),
        method: z.enum(['cash', 'qris', 'transfer', 'edc']),
        note: z.string().max(240).optional().nullable(),
      }),
      input,
    );
    const result = await topUpMemberBalance(staff.id, data);
    revalidateOps();
    return result;
  });
}
