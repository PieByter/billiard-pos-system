'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  adjustStock,
  deleteRecipe,
  saveIngredient,
  saveRecipe,
  type IngredientInput,
} from '@/lib/services/inventory';

export async function saveIngredientAction(
  input: IngredientInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(100),
        unit: z.string().min(1).max(20),
        stockQty: z.coerce.number().int().min(0).max(1_000_000_000),
        minStock: z.coerce.number().int().min(0).max(1_000_000_000),
        costPerUnit: z.coerce.number().int().min(0).max(1_000_000_000),
        active: z.boolean().optional(),
      }),
      input,
    );
    const result = await saveIngredient(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function adjustStockAction(input: {
  ingredientId: string;
  type: 'in' | 'adjust' | 'waste' | 'opname';
  qty: number;
  note?: string | null;
}): Promise<ActionResult<Awaited<ReturnType<typeof adjustStock>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        ingredientId: z.string().uuid(),
        type: z.enum(['in', 'adjust', 'waste', 'opname']),
        qty: z.coerce.number().int().min(1).max(1_000_000_000),
        note: z.string().max(240).optional().nullable(),
      }),
      input,
    );
    const result = await adjustStock(staff.id, data.ingredientId, data.type, data.qty, data.note);
    revalidateOps();
    return result;
  });
}

export async function saveRecipeAction(input: {
  menuItemId: string;
  ingredientId: string;
  qty: number;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        menuItemId: z.string().uuid(),
        ingredientId: z.string().uuid(),
        qty: z.coerce.number().int().min(1).max(1_000_000),
      }),
      input,
    );
    const result = await saveRecipe(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function deleteRecipeAction(recipeId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(z.string().uuid(), recipeId);
    const result = await deleteRecipe(staff.id, data);
    revalidateOps();
    return result;
  });
}
