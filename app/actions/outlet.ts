'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action-result';
import { requireStaffAction } from '@/lib/auth';
import { ACTIVE_OUTLET_COOKIE } from '@/lib/constants';
import { getOutletById } from '@/lib/outlet';
import { saveOutlet, type OutletInput } from '@/lib/services/outlets';
import { revalidateOps } from '@/lib/revalidate';
import { parseOrThrow } from '@/lib/validate';

export async function saveOutletAction(
  input: OutletInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const staff = await requireStaffAction(['owner']);
    const data = parseOrThrow(
      z.object({
        id: z.string().uuid().optional(),
        code: z.string().min(2).max(12),
        name: z.string().min(2).max(100),
        address: z.string().max(240).optional().nullable(),
        timezone: z.string().max(60).optional(),
        active: z.boolean().optional(),
      }),
      input,
    );
    const result = await saveOutlet(staff.id, data);
    revalidateOps();
    return result;
  });
}

export async function setActiveOutletAction(
  outletId: string,
): Promise<ActionResult<{ outletId: string }>> {
  return runAction(async () => {
    await requireStaffAction(['owner']);
    const data = parseOrThrow(z.string().uuid(), outletId);
    const outlet = await getOutletById(data);
    if (!outlet || !outlet.active) {
      throw new Error('Outlet tidak ditemukan atau tidak aktif.');
    }
    const store = await cookies();
    store.set(ACTIVE_OUTLET_COOKIE, outlet.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    revalidateOps();
    return { outletId: outlet.id };
  });
}
