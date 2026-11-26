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
  setTableMaintenance,
  setTableSelfOrder,
  toggleMenuItem,
  toggleRate,
  updateMenuStock,
} from '@/lib/services/admin';
import { saveStaff, setStaffActive } from '@/lib/services/staff';
import { saveVenueSettings } from '@/lib/services/settings';
import { saveRateSchedule, toggleRateSchedule } from '@/lib/services/rate-schedules';

export async function saveStaffAction(input: {
  id?: string;
  email: string;
  name: string;
  role: 'owner' | 'cashier' | 'kitchen';
  active?: boolean;
  password?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        email: z.string().email('Email tidak valid.').max(160),
        name: z.string().min(2).max(80),
        role: z.enum(['owner', 'cashier', 'kitchen']),
        active: z.boolean().optional(),
        password: z.string().min(8).max(120).optional().nullable(),
      }),
      input,
    );
    const result = await saveStaff(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function setStaffActiveAction(
  staffId: string,
  active: boolean,
): Promise<ActionResult<{ active: boolean }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({ staffId: z.string().uuid(), active: z.boolean() }),
      { staffId, active },
    );
    const result = await setStaffActive(staff.id, data.staffId, data.active);
    revalidateOps();
    return result;
  });
}

export async function saveVenueSettingsAction(input: {
  venueName: string;
  address?: string | null;
  timezone?: string;
  taxRateBps: number;
  serviceRateBps: number;
  warningMinutes: number;
  receiptFooter?: string | null;
}): Promise<ActionResult<Awaited<ReturnType<typeof saveVenueSettings>>>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        venueName: z.string().min(2).max(100),
        address: z.string().max(240).optional().nullable(),
        timezone: z.string().max(60).optional(),
        taxRateBps: z.coerce.number().int().min(0).max(10_000),
        serviceRateBps: z.coerce.number().int().min(0).max(10_000),
        warningMinutes: z.coerce.number().int().min(0).max(120),
        receiptFooter: z.string().max(240).optional().nullable(),
      }),
      input,
    );
    const result = await saveVenueSettings(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function saveRateScheduleAction(input: {
  id?: string;
  tableId: string;
  rateId: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  priority?: number;
  active?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        tableId: z.string().uuid(),
        rateId: z.string().uuid(),
        daysOfWeek: z.array(z.coerce.number().int().min(1).max(7)).min(1).max(7),
        startMinute: z.coerce.number().int().min(0).max(1439),
        endMinute: z.coerce.number().int().min(1).max(1440),
        priority: z.coerce.number().int().min(0).max(100).optional(),
        active: z.boolean().optional(),
      }),
      input,
    );
    const result = await saveRateSchedule(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function toggleRateScheduleAction(
  scheduleId: string,
): Promise<ActionResult<{ active: boolean }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(z.string().uuid(), scheduleId);
    const result = await toggleRateSchedule(staff.id, data);
    revalidateOps();
    return result;
  });
}

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

export async function setTableMaintenanceAction(
  tableId: string,
  active: boolean,
  note?: string | null,
): Promise<ActionResult<{ active: boolean }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        tableId: z.string().uuid(),
        active: z.boolean(),
        note: z.string().max(200).optional().nullable(),
      }),
      { tableId, active, note },
    );
    const result = await setTableMaintenance(staff.id, data.tableId, data.active, data.note);
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
