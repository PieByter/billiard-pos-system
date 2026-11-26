import { asc, desc, eq } from 'drizzle-orm';
import { dbNow, getDb } from '@/lib/db';
import { assets, maintenanceLogs, venueTables } from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { audit } from './audit';

export type AssetInput = {
  id?: string;
  code: string;
  name: string;
  type: 'cue' | 'table' | 'equipment';
  status?: 'active' | 'maintenance' | 'retired';
  tableId?: string | null;
  notes?: string | null;
};

export async function saveAsset(staffId: string, input: AssetInput) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z0-9-]{2,24}$/.test(code)) {
    throw new AppError('INVALID_CODE', 'Kode aset 2–24 karakter huruf/angka/dash.');
  }
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama aset wajib diisi.');
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
    const now = await dbNow(tx);
    if (input.id) {
      const [updated] = await tx
        .update(assets)
        .set({
          code,
          name,
          type: input.type,
          status: input.status ?? 'active',
          tableId: input.tableId || null,
          notes: input.notes?.trim() || null,
          updatedAt: now,
        })
        .where(eq(assets.id, input.id))
        .returning();
      if (!updated) throw new AppError('ASSET_NOT_FOUND', 'Aset tidak ditemukan.');
      await audit(tx, {
        staffId,
        action: 'asset.updated',
        entityType: 'asset',
        entityId: updated.id,
        detail: { code, name, status: updated.status },
        at: now,
      });
      return { id: updated.id };
    }
    const [created] = await tx
      .insert(assets)
      .values({
        code,
        name,
        type: input.type,
        status: input.status ?? 'active',
        tableId: input.tableId || null,
        notes: input.notes?.trim() || null,
        updatedAt: now,
      })
      .returning();
    await audit(tx, {
      staffId,
      action: 'asset.created',
      entityType: 'asset',
      entityId: created.id,
      detail: { code, name, type: input.type },
      at: now,
    });
    return { id: created.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('ASSET_CODE_TAKEN', `Kode aset ${code} sudah dipakai.`);
    }
    throw error;
  }
}

export async function logMaintenance(
  staffId: string,
  input: {
    assetId: string;
    type: 'service' | 'repair' | 'retipping' | 'inspection';
    cost: number;
    vendor?: string | null;
    notes?: string | null;
    nextDueAt?: string | null;
  },
) {
  const cost = Math.max(0, Math.round(input.cost));
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [asset] = await tx.select().from(assets).where(eq(assets.id, input.assetId)).limit(1);
    if (!asset) throw new AppError('ASSET_NOT_FOUND', 'Aset tidak ditemukan.');
    const [log] = await tx
      .insert(maintenanceLogs)
      .values({
        assetId: input.assetId,
        type: input.type,
        performedAt: now,
        cost,
        vendor: input.vendor?.trim() || null,
        notes: input.notes?.trim() || null,
        nextDueAt: input.nextDueAt ? new Date(input.nextDueAt) : null,
        createdBy: staffId,
        createdAt: now,
      })
      .returning();
    await audit(tx, {
      staffId,
      action: 'maintenance.logged',
      entityType: 'asset',
      entityId: asset.id,
      detail: { code: asset.code, type: input.type, cost },
      at: now,
    });
    return { id: log.id };
  });
}

export async function getMaintenanceData() {
  const db = await getDb();
  const serverNow = await dbNow(db);
  const [assetRows, logRows, tableRows] = await Promise.all([
    db
      .select({ asset: assets, tableCode: venueTables.code })
      .from(assets)
      .leftJoin(venueTables, eq(assets.tableId, venueTables.id))
      .orderBy(asc(assets.code)),
    db
      .select({ log: maintenanceLogs, asset: assets })
      .from(maintenanceLogs)
      .innerJoin(assets, eq(maintenanceLogs.assetId, assets.id))
      .orderBy(desc(maintenanceLogs.performedAt))
      .limit(50),
    db.select().from(venueTables).orderBy(asc(venueTables.code)),
  ]);
  return {
    serverNow: serverNow.toISOString(),
    tables: tableRows.map((table) => ({ id: table.id, code: table.code })),
    assets: assetRows.map((row) => ({
      id: row.asset.id,
      code: row.asset.code,
      name: row.asset.name,
      type: row.asset.type,
      status: row.asset.status,
      tableId: row.asset.tableId,
      tableCode: row.tableCode,
      notes: row.asset.notes,
    })),
    logs: logRows.map((row) => ({
      id: row.log.id,
      assetId: row.log.assetId,
      assetName: row.asset.name,
      type: row.log.type,
      cost: row.log.cost,
      vendor: row.log.vendor,
      notes: row.log.notes,
      performedAt: row.log.performedAt.toISOString(),
      nextDueAt: row.log.nextDueAt?.toISOString() ?? null,
    })),
  };
}
