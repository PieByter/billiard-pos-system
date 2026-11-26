import { and, eq, ne } from 'drizzle-orm';
import { getDb, dbNow } from '@/lib/db';
import {
  billiardRates,
  billiardSessions,
  bills,
  menuCategories,
  menuItems,
  venueTables,
} from '@/lib/db/schema';
import { AppError, isUniqueViolation } from '@/lib/errors';
import { randomToken } from '@/lib/ids';
import { getActiveOutletId } from '@/lib/outlet';
import { audit } from './audit';

export type RateInput = {
  id?: string;
  name: string;
  description?: string | null;
  pricePerHour: number;
  minMinutes: number;
  incrementMinutes: number;
  active?: boolean;
  sortOrder?: number;
};

export async function saveRate(staffId: string, input: RateInput) {
  const name = input.name.trim();
  if (!name) throw new AppError('INVALID_NAME', 'Nama tarif wajib diisi.');
  if (input.pricePerHour < 0 || input.minMinutes <= 0 || input.incrementMinutes <= 0) {
    throw new AppError('INVALID_RATE', 'Tarif, minimal durasi, dan increment harus valid.');
  }
  const outletId = await getActiveOutletId();

  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    if (input.id) {
      const [updated] = await tx
        .update(billiardRates)
        .set({
          name,
          description: input.description?.trim() || null,
          pricePerHour: input.pricePerHour,
          minMinutes: input.minMinutes,
          incrementMinutes: input.incrementMinutes,
          active: input.active ?? true,
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        })
        .where(and(eq(billiardRates.id, input.id), eq(billiardRates.outletId, outletId)))
        .returning();
      if (!updated) throw new AppError('RATE_NOT_FOUND', 'Tarif tidak ditemukan.');
      await audit(tx, {
        staffId,
        action: 'rate.updated',
        entityType: 'billiard_rate',
        entityId: updated.id,
        detail: { name, pricePerHour: input.pricePerHour },
        at: now,
      });
      return { id: updated.id };
    }

    const [created] = await tx
      .insert(billiardRates)
      .values({
        outletId,
        name,
        description: input.description?.trim() || null,
        pricePerHour: input.pricePerHour,
        minMinutes: input.minMinutes,
        incrementMinutes: input.incrementMinutes,
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? 99,
      })
      .returning();
    await audit(tx, {
      staffId,
      action: 'rate.created',
      entityType: 'billiard_rate',
      entityId: created.id,
      detail: { name, pricePerHour: input.pricePerHour },
      at: now,
    });
    return { id: created.id };
  });
}

export async function toggleRate(staffId: string, rateId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [rate] = await tx
      .select()
      .from(billiardRates)
      .where(eq(billiardRates.id, rateId))
      .limit(1);
    if (!rate) throw new AppError('RATE_NOT_FOUND', 'Tarif tidak ditemukan.');
    const [updated] = await tx
      .update(billiardRates)
      .set({ active: !rate.active })
      .where(eq(billiardRates.id, rateId))
      .returning();
    await audit(tx, {
      staffId,
      action: updated.active ? 'rate.activated' : 'rate.deactivated',
      entityType: 'billiard_rate',
      entityId: rateId,
      detail: { name: rate.name },
      at: now,
    });
    return { active: updated.active };
  });
}

export type MenuItemInput = {
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
};

export async function saveMenuItem(staffId: string, input: MenuItemInput) {
  const name = input.name.trim();
  if (!name) throw new AppError('INVALID_NAME', 'Nama menu wajib diisi.');
  if (input.price < 0) throw new AppError('INVALID_PRICE', 'Harga tidak valid.');
  if (input.stock !== null && input.stock < 0) {
    throw new AppError('INVALID_STOCK', 'Stok tidak boleh negatif.');
  }
  const outletId = await getActiveOutletId();

  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [category] = await tx
      .select({ id: menuCategories.id, outletId: menuCategories.outletId })
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.id, input.categoryId),
          eq(menuCategories.outletId, outletId),
        ),
      )
      .limit(1);
    if (!category) throw new AppError('CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.');

    if (input.id) {
      const [updated] = await tx
        .update(menuItems)
        .set({
          categoryId: input.categoryId,
          name,
          description: input.description?.trim() ?? '',
          price: input.price,
          stock: input.stock,
          station: input.station,
          imageIcon: input.imageIcon?.trim() || 'restaurant_menu',
          isBestSeller: input.bestSeller ?? false,
          isAvailable: input.available ?? true,
          updatedAt: now,
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        })
        .where(and(eq(menuItems.id, input.id), eq(menuItems.outletId, outletId)))
        .returning();
      if (!updated) throw new AppError('ITEM_NOT_FOUND', 'Menu tidak ditemukan.');
      await audit(tx, {
        staffId,
        action: 'menu.updated',
        entityType: 'menu_item',
        entityId: updated.id,
        detail: { name, price: input.price, stock: input.stock },
        at: now,
      });
      return { id: updated.id };
    }

    const [created] = await tx
      .insert(menuItems)
      .values({
        outletId,
        categoryId: input.categoryId,
        name,
        description: input.description?.trim() ?? '',
        price: input.price,
        stock: input.stock,
        station: input.station,
        imageIcon: input.imageIcon?.trim() || 'restaurant_menu',
        isBestSeller: input.bestSeller ?? false,
        isAvailable: input.available ?? true,
        sortOrder: input.sortOrder ?? 99,
        updatedAt: now,
      })
      .returning();
    await audit(tx, {
      staffId,
      action: 'menu.created',
      entityType: 'menu_item',
      entityId: created.id,
      detail: { name, price: input.price },
      at: now,
    });
    return { id: created.id };
  });
}

export async function toggleMenuItem(staffId: string, itemId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [item] = await tx.select().from(menuItems).where(eq(menuItems.id, itemId)).limit(1);
    if (!item) throw new AppError('ITEM_NOT_FOUND', 'Menu tidak ditemukan.');
    const [updated] = await tx
      .update(menuItems)
      .set({ isAvailable: !item.isAvailable, updatedAt: now })
      .where(eq(menuItems.id, itemId))
      .returning();
    await audit(tx, {
      staffId,
      action: updated.isAvailable ? 'menu.available' : 'menu.unavailable',
      entityType: 'menu_item',
      entityId: itemId,
      detail: { name: item.name },
      at: now,
    });
    return { available: updated.isAvailable };
  });
}

export async function updateMenuStock(staffId: string, itemId: string, stock: number | null) {
  if (stock !== null && (!Number.isFinite(stock) || stock < 0)) {
    throw new AppError('INVALID_STOCK', 'Stok tidak boleh negatif.');
  }
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [updated] = await tx
      .update(menuItems)
      .set({ stock, updatedAt: now })
      .where(eq(menuItems.id, itemId))
      .returning();
    if (!updated) throw new AppError('ITEM_NOT_FOUND', 'Menu tidak ditemukan.');
    await audit(tx, {
      staffId,
      action: 'menu.stock_updated',
      entityType: 'menu_item',
      entityId: itemId,
      detail: { name: updated.name, stock },
      at: now,
    });
    return { stock: updated.stock };
  });
}

export type TableInput = {
  id?: string;
  code: string;
  kind: 'billiard' | 'cafe';
  zone: string;
  capacity: number;
  allowSelfOrder: boolean;
  rateId: string | null;
  sortOrder?: number;
};

export async function saveTable(staffId: string, input: TableInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,12}$/.test(code)) {
    throw new AppError('INVALID_CODE', 'Kode meja hanya huruf/angka, maksimal 12 karakter.');
  }
  if (input.capacity < 1 || input.capacity > 30) {
    throw new AppError('INVALID_CAPACITY', 'Kapasitas meja tidak valid.');
  }
  if (input.kind === 'billiard' && !input.rateId) {
    throw new AppError('RATE_REQUIRED', 'Meja billiard wajib punya tarif.');
  }
  const outletId = await getActiveOutletId();

  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const now = await dbNow(tx);
      if (input.rateId) {
        const [rate] = await tx
          .select({ id: billiardRates.id })
          .from(billiardRates)
          .where(
            and(eq(billiardRates.id, input.rateId), eq(billiardRates.outletId, outletId)),
          )
          .limit(1);
        if (!rate) throw new AppError('RATE_NOT_FOUND', 'Tarif tidak ditemukan di outlet ini.');
      }
      if (input.id) {
        const [updated] = await tx
          .update(venueTables)
          .set({
            code,
            kind: input.kind,
            zone: input.zone.trim(),
            capacity: input.capacity,
            allowSelfOrder: input.allowSelfOrder,
            rateId: input.kind === 'billiard' ? input.rateId : null,
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          })
          .where(and(eq(venueTables.id, input.id), eq(venueTables.outletId, outletId)))
          .returning();
        if (!updated) throw new AppError('TABLE_NOT_FOUND', 'Meja tidak ditemukan.');
        await audit(tx, {
          staffId,
          action: 'table.updated',
          entityType: 'venue_table',
          entityId: updated.id,
          detail: { code, kind: input.kind, zone: input.zone, allowSelfOrder: input.allowSelfOrder },
          at: now,
        });
        return { id: updated.id, qrToken: updated.qrToken };
      }

      const [created] = await tx
        .insert(venueTables)
        .values({
          outletId,
          code,
          kind: input.kind,
          zone: input.zone.trim(),
          capacity: input.capacity,
          allowSelfOrder: input.allowSelfOrder,
          rateId: input.kind === 'billiard' ? input.rateId : null,
          qrToken: `${code.toLowerCase()}-${randomToken(16)}`,
          sortOrder: input.sortOrder ?? 99,
        })
        .returning();
      await audit(tx, {
        staffId,
        action: 'table.created',
        entityType: 'venue_table',
        entityId: created.id,
        detail: { code, kind: input.kind },
        at: now,
      });
      return { id: created.id, qrToken: created.qrToken };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('TABLE_CODE_TAKEN', `Kode meja ${code} sudah dipakai.`);
    }
    throw error;
  }
}

export async function rotateTableQr(staffId: string, tableId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [table] = await tx
      .select()
      .from(venueTables)
      .where(eq(venueTables.id, tableId))
      .limit(1);
    if (!table) throw new AppError('TABLE_NOT_FOUND', 'Meja tidak ditemukan.');
    const token = `${table.code.toLowerCase()}-${randomToken(16)}`;
    const [updated] = await tx
      .update(venueTables)
      .set({ qrToken: token })
      .where(eq(venueTables.id, tableId))
      .returning();
    await audit(tx, {
      staffId,
      action: 'table.qr_rotated',
      entityType: 'venue_table',
      entityId: tableId,
      detail: { code: table.code },
      at: now,
    });
    return { qrToken: updated.qrToken };
  });
}

export async function setTableMaintenance(
  staffId: string,
  tableId: string,
  active: boolean,
  note?: string | null,
) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [table] = await tx
      .select()
      .from(venueTables)
      .where(eq(venueTables.id, tableId))
      .limit(1);
    if (!table) throw new AppError('TABLE_NOT_FOUND', 'Meja tidak ditemukan.');
    if (active) {
      const [openBill] = await tx
        .select({ id: bills.id })
        .from(bills)
        .where(and(eq(bills.tableId, tableId), eq(bills.status, 'open')))
        .limit(1);
      if (openBill) {
        throw new AppError('TABLE_OCCUPIED', 'Tutup bill meja sebelum set maintenance.');
      }
      const [session] = await tx
        .select({ id: billiardSessions.id })
        .from(billiardSessions)
        .where(
          and(eq(billiardSessions.tableId, tableId), ne(billiardSessions.status, 'finished')),
        )
        .limit(1);
      if (session) throw new AppError('TABLE_OCCUPIED', 'Sesi billiard masih aktif.');
    }
    await tx
      .update(venueTables)
      .set({
        maintenanceAt: active ? now : null,
        maintenanceNote: active ? note?.trim().slice(0, 200) || 'Perawatan meja' : null,
      })
      .where(eq(venueTables.id, tableId));
    await audit(tx, {
      staffId,
      action: active ? 'table.maintenance_started' : 'table.maintenance_finished',
      entityType: 'venue_table',
      entityId: tableId,
      detail: { code: table.code, note: note?.trim() || null },
      at: now,
    });
    return { active };
  });
}

export async function setTableSelfOrder(staffId: string, tableId: string, allow: boolean) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [table] = await tx
      .select()
      .from(venueTables)
      .where(eq(venueTables.id, tableId))
      .limit(1);
    if (!table) throw new AppError('TABLE_NOT_FOUND', 'Meja tidak ditemukan.');
    await tx
      .update(venueTables)
      .set({ allowSelfOrder: allow })
      .where(eq(venueTables.id, tableId));
    await audit(tx, {
      staffId,
      action: allow ? 'table.self_order_enabled' : 'table.self_order_disabled',
      entityType: 'venue_table',
      entityId: tableId,
      detail: { code: table.code },
      at: now,
    });
    return { allowSelfOrder: allow };
  });
}
