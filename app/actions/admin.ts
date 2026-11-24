'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  rotateTableQr,
  saveMenuItem,
  saveRate,
  saveTable,
  setTableSelfOrder,
  toggleMenuItem,
  toggleRate,
  updateMenuStock,
} from '@/lib/services/admin';

export async function saveRateAction(input: {
  id?: string;
  name: string;
  description?: string | null;
  pricePerHour: number;
  minMinutes: number;
  incrementMinutes: number;
  active?: boolean;
  sortOrder?: number;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(80),
        description: z.string().max(240).optional().nullable(),
        pricePerHour: z.coerce.number().int().min(0).max(100_000_000),
        minMinutes: z.coerce.number().int().min(1).max(600),
        incrementMinutes: z.coerce.number().int().min(1).max(600),
        active: z.boolean().optional(),
        sortOrder: z.coerce.number().int().min(0).max(999).optional(),
      }),
      input,
    );
    const result = await saveRate(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function toggleRateAction(rateId: string): Promise<ActionResult<{ active: boolean }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const result = await toggleRate(staff.id, rateId);
    revalidateOps();
    return result;
  });
}

export async function saveMenuItemAction(input: {
  id?: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  stock: number | null;
  station: 'kitchen' | 'bar';
  imageIcon?: string;
  bestSeller?: boolean;
  available?: boolean;
  sortOrder?: number;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        categoryId: z.string().uuid(),
        name: z.string().min(2).max(100),
        description: z.string().max(500).optional(),
        price: z.coerce.number().int().min(0).max(100_000_000),
        stock: z.union([
          z.null(),
          z.coerce.number().int().min(0).max(1_000_000),
        ]),
        station: z.enum(['kitchen', 'bar']),
        imageIcon: z.string().max(60).optional(),
        bestSeller: z.boolean().optional(),
        available: z.boolean().optional(),
        sortOrder: z.coerce.number().int().min(0).max(999).optional(),
      }),
      input,
    );
    const result = await saveMenuItem(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function toggleMenuItemAction(
  itemId: string,
): Promise<ActionResult<{ available: boolean }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const result = await toggleMenuItem(staff.id, itemId);
    revalidateOps();
    return result;
  });
}

export async function updateMenuStockAction(
  itemId: string,
  stock: number | null,
): Promise<ActionResult<{ stock: number | null }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        itemId: z.string().uuid(),
        stock: z.union([
          z.null(),
          z.coerce.number().int().min(0).max(1_000_000),
        ]),
      }),
      { itemId, stock },
    );
    const result = await updateMenuStock(staff.id, data.itemId, data.stock);
    revalidateOps();
    return result;
  });
}

export async function saveTableAction(input: {
  id?: string;
  code: string;
  kind: 'billiard' | 'cafe';
  zone: string;
  capacity: number;
  allowSelfOrder: boolean;
  rateId: string | null;
  sortOrder?: number;
}): Promise<ActionResult<{ id: string; qrToken: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        code: z.string().min(1).max(12),
        kind: z.enum(['billiard', 'cafe']),
        zone: z.string().max(80),
        capacity: z.coerce.number().int().min(1).max(30),
        allowSelfOrder: z.boolean(),
        rateId: z.string().uuid().nullable(),
        sortOrder: z.coerce.number().int().min(0).max(999).optional(),
      }),
      input,
    );
    const result = await saveTable(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function rotateTableQrAction(
  tableId: string,
): Promise<ActionResult<{ qrToken: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const result = await rotateTableQr(staff.id, tableId);
    revalidateOps();
    return result;
  });
}

export async function setTableSelfOrderAction(
  tableId: string,
  allow: boolean,
): Promise<ActionResult<{ allowSelfOrder: boolean }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const result = await setTableSelfOrder(staff.id, tableId, Boolean(allow));
    revalidateOps();
    return result;
  });
}
