'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';
import {
  logMaintenance,
  saveAsset,
  type AssetInput,
} from '@/lib/services/maintenance';

export async function saveAssetAction(input: AssetInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        code: z.string().min(2).max(24),
        name: z.string().min(2).max(100),
        type: z.enum(['cue', 'table', 'equipment']),
        status: z.enum(['active', 'maintenance', 'retired']).optional(),
        tableId: z.string().uuid().optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
      }),
      input,
    );
    const result = await saveAsset(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function logMaintenanceAction(input: {
  assetId: string;
  type: 'service' | 'repair' | 'retipping' | 'inspection';
  cost: number;
  vendor?: string | null;
  notes?: string | null;
  nextDueAt?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        assetId: z.string().uuid(),
        type: z.enum(['service', 'repair', 'retipping', 'inspection']),
        cost: z.coerce.number().int().min(0).max(1_000_000_000),
        vendor: z.string().max(100).optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
        nextDueAt: z.string().optional().nullable(),
      }),
      input,
    );
    const result = await logMaintenance(staff.id, data);
    revalidateOps();
    return result;
  });
}
