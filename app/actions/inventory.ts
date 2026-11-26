'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  adjustStock,
  deleteRecipe,
  postStockOpname,
  saveIngredient,
  savePurchaseOrder,
  saveRecipe,
  saveSupplier,
  setPurchaseOrderStatus,
  type IngredientInput,
  type PurchaseOrderInput,
  type SupplierInput,
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
        qty: z.coerce.number().int().min(0).max(1_000_000_000),
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

export async function saveSupplierAction(
  input: SupplierInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(100),
        contactName: z.string().max(80).optional().nullable(),
        phone: z.string().max(30).optional().nullable(),
        email: z.string().email().max(160).optional().nullable(),
        address: z.string().max(240).optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
        active: z.boolean().optional(),
      }),
      input,
    );
    const result = await saveSupplier(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function savePurchaseOrderAction(
  input: PurchaseOrderInput,
): Promise<ActionResult<{ id: string; poNumber: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        supplierId: z.string().uuid(),
        notes: z.string().max(500).optional().nullable(),
        items: z
          .array(
            z.object({
              ingredientId: z.string().uuid(),
              qty: z.coerce.number().int().min(1).max(1_000_000),
              unitCost: z.coerce.number().int().min(0).max(1_000_000_000),
            }),
          )
          .min(1)
          .max(100),
      }),
      input,
    );
    const result = await savePurchaseOrder(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function setPurchaseOrderStatusAction(
  poId: string,
  status: 'ordered' | 'received' | 'cancelled',
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        poId: z.string().uuid(),
        status: z.enum(['ordered', 'received', 'cancelled']),
      }),
      { poId, status },
    );
    const result = await setPurchaseOrderStatus(staff.id, data.poId, data.status);
    revalidateOps();
    return result;
  });
}

export async function postStockOpnameAction(
  counts: Array<{ ingredientId: string; countedQty: number }>,
  notes?: string | null,
): Promise<ActionResult<{ id: string; differenceUnits: number }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        counts: z
          .array(
            z.object({
              ingredientId: z.string().uuid(),
              countedQty: z.coerce.number().int().min(0).max(1_000_000_000),
            }),
          )
          .min(1)
          .max(500),
        notes: z.string().max(500).optional().nullable(),
      }),
      { counts, notes },
    );
    const result = await postStockOpname(staff.id, data.counts, data.notes);
    revalidateOps();
    return result;
  });
}
