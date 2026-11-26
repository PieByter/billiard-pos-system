'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  applyPromotionToBill,
  removePromotionFromBill,
  savePromotion,
  togglePromotion,
  type PromotionInput,
} from '@/lib/services/promotions';

export async function applyPromotionAction(
  billId: string,
  code: string,
): Promise<ActionResult<Awaited<ReturnType<typeof applyPromotionToBill>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(
      z.object({ billId: z.string().uuid(), code: z.string().min(1).max(24) }),
      { billId, code },
    );
    const result = await applyPromotionToBill(staff.id, data.billId, data.code);
    revalidateOps();
    return result;
  });
}

export async function removePromotionAction(
  billId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof removePromotionFromBill>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['cashier', 'owner']);
    const data = parseOrThrow(z.string().uuid(), billId);
    const result = await removePromotionFromBill(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function savePromotionAction(
  input: PromotionInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        code: z.string().min(3).max(24),
        name: z.string().min(2).max(100),
        description: z.string().max(500).optional().nullable(),
        type: z.enum(['percent', 'fixed']),
        value: z.coerce.number().int().min(1).max(100_000_000),
        minSpend: z.coerce.number().int().min(0).max(1_000_000_000),
        maxDiscount: z.coerce.number().int().min(0).max(1_000_000_000).optional().nullable(),
        maxUses: z.coerce.number().int().min(1).max(1_000_000).optional().nullable(),
        validFrom: z.string().optional().nullable(),
        validTo: z.string().optional().nullable(),
        appliesTo: z.enum(['all', 'billiard', 'fnb']),
        memberOnly: z.boolean().optional(),
        active: z.boolean().optional(),
      }),
      input,
    );
    const result = await savePromotion(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function togglePromotionAction(
  promotionId: string,
): Promise<ActionResult<{ active: boolean }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(z.string().uuid(), promotionId);
    const result = await togglePromotion(staff.id, data);
    revalidateOps();
    return result;
  });
}
