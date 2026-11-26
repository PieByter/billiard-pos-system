import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import {
  ingredients,
  menuItems,
  orderItems,
  purchaseOrderItems,
  purchaseOrders,
  recipes,
  stockMovements,
  stockOpnameItems,
  stockOpnames,
  suppliers,
} from '@/lib/db/schema';
import { AppError } from '@/lib/errors';
import { getActiveOutletId } from '@/lib/outlet';
import { audit } from './audit';

export type IngredientInput = {
  id?: string;
  name: string;
  unit: string;
  stockQty: number;
  minStock: number;
  costPerUnit: number;
  active?: boolean;
};

export async function saveIngredient(staffId: string, input: IngredientInput) {
  const name = input.name.trim();
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama bahan wajib diisi.');
  if (input.stockQty < 0 || input.minStock < 0 || input.costPerUnit < 0) {
    throw new AppError('INVALID_STOCK', 'Nilai stok/harga tidak valid.');
  }
  const outletId = await getActiveOutletId();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    if (input.id) {
      const [before] = await tx
        .select()
        .from(ingredients)
        .where(eq(ingredients.id, input.id))
        .limit(1);
      if (!before) throw new AppError('INGREDIENT_NOT_FOUND', 'Bahan tidak ditemukan.');
      const [updated] = await tx
        .update(ingredients)
        .set({
          name,
          unit: input.unit.trim() || 'pcs',
          stockQty: Math.round(input.stockQty),
          minStock: Math.round(input.minStock),
          costPerUnit: Math.round(input.costPerUnit),
          active: input.active ?? true,
          updatedAt: now,
        })
        .where(eq(ingredients.id, input.id))
        .returning();
      if (!updated) throw new AppError('INGREDIENT_NOT_FOUND', 'Bahan tidak ditemukan.');
      if (updated.stockQty !== before.stockQty) {
        await tx.insert(stockMovements).values({
          outletId: updated.outletId,
          ingredientId: updated.id,
          type: 'adjust',
          qty: updated.stockQty - before.stockQty,
          referenceType: 'manual_edit',
          note: 'Edit master bahan',
          createdBy: staffId,
          createdAt: now,
        });
      }
      await audit(tx, {
        staffId,
        action: 'ingredient.updated',
        entityType: 'ingredient',
        entityId: updated.id,
        detail: { name, stockQty: updated.stockQty, unit: updated.unit },
        at: now,
      });
      return { id: updated.id };
    }
    const [created] = await tx
      .insert(ingredients)
      .values({
        outletId,
        name,
        unit: input.unit.trim() || 'pcs',
        stockQty: Math.round(input.stockQty),
        minStock: Math.round(input.minStock),
        costPerUnit: Math.round(input.costPerUnit),
        active: input.active ?? true,
        updatedAt: now,
      })
      .returning();
    await audit(tx, {
      staffId,
      action: 'ingredient.created',
      entityType: 'ingredient',
      entityId: created.id,
      detail: { name, stockQty: created.stockQty, unit: created.unit },
      at: now,
    });
    return { id: created.id };
  });
}

export type StockAdjustmentType = 'in' | 'adjust' | 'waste' | 'opname';

export async function adjustStock(
  staffId: string,
  ingredientId: string,
  type: StockAdjustmentType,
  qty: number,
  note?: string | null,
) {
  const amount = Math.round(Number(qty));
  if (!Number.isFinite(amount) || (type === 'opname' ? amount < 0 : amount <= 0)) {
    throw new AppError('INVALID_QTY', 'Jumlah stok tidak valid.');
  }
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [ingredient] = await tx
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, ingredientId))
      .limit(1);
    if (!ingredient) throw new AppError('INGREDIENT_NOT_FOUND', 'Bahan tidak ditemukan.');
    const delta =
      type === 'in' || type === 'adjust' ? amount : type === 'waste' ? -amount : amount;
    const nextQty = type === 'opname' ? amount : ingredient.stockQty + delta;
    if (nextQty < 0) throw new AppError('NEGATIVE_STOCK', 'Stok tidak boleh negatif.');
    const [updated] = await tx
      .update(ingredients)
      .set({ stockQty: nextQty, updatedAt: now })
      .where(eq(ingredients.id, ingredient.id))
      .returning();
    await tx.insert(stockMovements).values({
      outletId: ingredient.outletId,
      ingredientId,
      type: type === 'adjust' ? 'adjust' : type,
      qty: type === 'opname' ? nextQty - ingredient.stockQty : delta,
      referenceType: 'manual',
      note: note?.trim() || null,
      createdBy: staffId,
      createdAt: now,
    });
    await audit(tx, {
      staffId,
      action: 'ingredient.stock_adjusted',
      entityType: 'ingredient',
      entityId: ingredientId,
      detail: { name: ingredient.name, type, qty: amount, nextQty },
      at: now,
    });
    return { stockQty: updated.stockQty };
  });
}

export async function saveRecipe(
  staffId: string,
  input: { menuItemId: string; ingredientId: string; qty: number },
) {
  const qty = Math.round(Number(input.qty));
  if (qty <= 0) throw new AppError('INVALID_QTY', 'Jumlah resep harus lebih dari 0.');
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [menu] = await tx
      .select({ id: menuItems.id, name: menuItems.name, outletId: menuItems.outletId })
      .from(menuItems)
      .where(eq(menuItems.id, input.menuItemId))
      .limit(1);
    const [ingredient] = await tx
      .select()
      .from(ingredients)
      .where(eq(ingredients.id, input.ingredientId))
      .limit(1);
    if (!menu || !ingredient) throw new AppError('NOT_FOUND', 'Menu/bahan tidak ditemukan.');
    const [created] = await tx
      .insert(recipes)
      .values({
        outletId: menu.outletId,
        menuItemId: input.menuItemId,
        ingredientId: input.ingredientId,
        qty,
      })
      .onConflictDoUpdate({
        target: [recipes.menuItemId, recipes.ingredientId],
        set: { qty },
      })
      .returning();
    await audit(tx, {
      staffId,
      action: 'recipe.saved',
      entityType: 'menu_item',
      entityId: menu.id,
      detail: { menu: menu.name, ingredient: ingredient.name, qty, unit: ingredient.unit },
      at: now,
    });
    return { id: created.id };
  });
}

export async function deleteRecipe(staffId: string, recipeId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(recipes).where(eq(recipes.id, recipeId)).limit(1);
    if (!row) throw new AppError('RECIPE_NOT_FOUND', 'Resep tidak ditemukan.');
    await tx.delete(recipes).where(eq(recipes.id, recipeId));
    await audit(tx, {
      staffId,
      action: 'recipe.deleted',
      entityType: 'recipe',
      entityId: recipeId,
      detail: { menuItemId: row.menuItemId, ingredientId: row.ingredientId },
      at: await dbNow(tx),
    });
    return { id: recipeId };
  });
}

export async function consumeIngredientsForOrder(tx: DbTransaction, orderId: string) {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  if (items.length === 0) return;
  const recipeRows = await tx
    .select({ recipe: recipes, ingredient: ingredients })
    .from(recipes)
    .innerJoin(ingredients, eq(recipes.ingredientId, ingredients.id))
    .where(
      inArray(
        recipes.menuItemId,
        items.map((item) => item.menuItemId),
      ),
    );
  const recipeByMenu = new Map<string, typeof recipeRows>();
  for (const row of recipeRows) {
    const list = recipeByMenu.get(row.recipe.menuItemId) ?? [];
    list.push(row);
    recipeByMenu.set(row.recipe.menuItemId, list);
  }
  const now = await dbNow(tx);
  for (const item of items) {
    const rows = recipeByMenu.get(item.menuItemId) ?? [];
    for (const row of rows) {
      const need = row.recipe.qty * item.qty;
      const [updated] = await tx
        .update(ingredients)
        .set({ stockQty: sql`${ingredients.stockQty} - ${need}`, updatedAt: now })
        .where(
          and(
            eq(ingredients.id, row.ingredient.id),
            eq(ingredients.active, true),
            sql`${ingredients.stockQty} >= ${need}`,
          ),
        )
        .returning({ id: ingredients.id });
      if (!updated) {
        throw new AppError(
          'INGREDIENT_OUT_OF_STOCK',
          `Stok bahan ${row.ingredient.name} tidak mencukupi untuk ${item.nameSnapshot}.`,
        );
      }
      await tx.insert(stockMovements).values({
        outletId: row.ingredient.outletId,
        ingredientId: row.ingredient.id,
        type: 'out',
        qty: -need,
        referenceType: 'order',
        referenceId: orderId,
        note: `${item.qty}× ${item.nameSnapshot}`,
        createdAt: now,
      });
    }
  }
}

export async function restoreIngredientsForOrder(tx: DbTransaction, orderId: string) {
  const [alreadyRestored] = await tx
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.referenceType, 'order_restore'),
        eq(stockMovements.referenceId, orderId),
      ),
    )
    .limit(1);
  if (alreadyRestored) return;

  // Restore hanya bahan yang benar-benar dipotong saat order dibuat.
  const consumed = await tx
    .select({
      ingredientId: stockMovements.ingredientId,
      qty: sql<number>`sum(-${stockMovements.qty})::int`,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.referenceType, 'order'),
        eq(stockMovements.referenceId, orderId),
        eq(stockMovements.type, 'out'),
      ),
    )
    .groupBy(stockMovements.ingredientId);
  if (consumed.length === 0) return;

  const now = await dbNow(tx);
  for (const row of consumed) {
    const [ingredientRow] = await tx
      .select({ outletId: ingredients.outletId })
      .from(ingredients)
      .where(eq(ingredients.id, row.ingredientId))
      .limit(1);
    if (!ingredientRow) continue;
    await tx
      .update(ingredients)
      .set({ stockQty: sql`${ingredients.stockQty} + ${row.qty}`, updatedAt: now })
      .where(eq(ingredients.id, row.ingredientId));
    await tx.insert(stockMovements).values({
      outletId: ingredientRow.outletId,
      ingredientId: row.ingredientId,
      type: 'in',
      qty: row.qty,
      referenceType: 'order_restore',
      referenceId: orderId,
      note: 'Restore dari pembatalan order',
      createdAt: now,
    });
  }
}

export type SupplierInput = {
  id?: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  active?: boolean;
};

export async function saveSupplier(staffId: string, input: SupplierInput) {
  const name = input.name.trim();
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Nama supplier wajib diisi.');
  const outletId = await getActiveOutletId();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const values = {
      name,
      contactName: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      active: input.active ?? true,
      updatedAt: now,
    };
    if (input.id) {
      const [updated] = await tx
        .update(suppliers)
        .set(values)
        .where(and(eq(suppliers.id, input.id), eq(suppliers.outletId, outletId)))
        .returning();
      if (!updated) throw new AppError('SUPPLIER_NOT_FOUND', 'Supplier tidak ditemukan.');
      await audit(tx, {
        staffId,
        action: 'supplier.updated',
        entityType: 'supplier',
        entityId: updated.id,
        detail: { name },
        at: now,
      });
      return { id: updated.id };
    }
    const [created] = await tx
      .insert(suppliers)
      .values({ outletId, ...values, createdAt: now })
      .returning();
    await audit(tx, {
      staffId,
      action: 'supplier.created',
      entityType: 'supplier',
      entityId: created.id,
      detail: { name },
      at: now,
    });
    return { id: created.id };
  });
}

export type PurchaseOrderInput = {
  id?: string;
  supplierId: string;
  notes?: string | null;
  items: Array<{ ingredientId: string; qty: number; unitCost: number }>;
};

export async function savePurchaseOrder(staffId: string, input: PurchaseOrderInput) {
  if (input.items.length === 0) {
    throw new AppError('EMPTY_PO', 'Purchase order harus punya minimal satu bahan.');
  }
  const items = input.items.map((item) => ({
    ingredientId: item.ingredientId,
    qty: Math.round(Number(item.qty)),
    unitCost: Math.round(Number(item.unitCost)),
  }));
  if (items.some((item) => item.qty <= 0 || item.unitCost < 0)) {
    throw new AppError('INVALID_PO_ITEM', 'Qty/harga purchase order tidak valid.');
  }
  const total = items.reduce((sum, item) => sum + item.qty * item.unitCost, 0);
  const outletId = await getActiveOutletId();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.outletId, outletId)))
      .limit(1);
    if (!supplier) throw new AppError('SUPPLIER_NOT_FOUND', 'Supplier tidak ditemukan.');
    const ingredientRows = await tx
      .select()
      .from(ingredients)
      .where(
        and(
          eq(ingredients.outletId, outletId),
          inArray(
            ingredients.id,
            items.map((item) => item.ingredientId),
          ),
        ),
      );
    if (ingredientRows.length !== new Set(items.map((item) => item.ingredientId)).size) {
      throw new AppError('INGREDIENT_NOT_FOUND', 'Ada bahan yang tidak ditemukan di outlet ini.');
    }

    if (input.id) {
      const [existing] = await tx
        .select()
        .from(purchaseOrders)
        .where(
          and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.outletId, outletId)),
        )
        .limit(1);
      if (!existing) throw new AppError('PO_NOT_FOUND', 'Purchase order tidak ditemukan.');
      if (existing.status !== 'draft') {
        throw new AppError('PO_LOCKED', 'PO yang sudah dipesan tidak bisa diubah.');
      }
      await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, existing.id));
      await tx
        .insert(purchaseOrderItems)
        .values(
          items.map((item) => ({
            outletId,
            purchaseOrderId: existing.id,
            ingredientId: item.ingredientId,
            qty: item.qty,
            unitCost: item.unitCost,
          })),
        );
      const [updated] = await tx
        .update(purchaseOrders)
        .set({
          supplierId: supplier.id,
          notes: input.notes?.trim() || null,
          total,
          updatedAt: now,
        })
        .where(eq(purchaseOrders.id, existing.id))
        .returning();
      await audit(tx, {
        staffId,
        action: 'purchase_order.updated',
        entityType: 'purchase_order',
        entityId: updated.id,
        detail: { poNumber: updated.poNumber, total, items: items.length },
        at: now,
      });
      return { id: updated.id, poNumber: updated.poNumber };
    }

    let created: typeof purchaseOrders.$inferSelect | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const [row] = await tx
        .insert(purchaseOrders)
        .values({
          outletId,
          poNumber: `PO-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 90 + 10)}`,
          supplierId: supplier.id,
          status: 'draft',
          total,
          notes: input.notes?.trim() || null,
          createdBy: staffId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      created = row ?? null;
    }
    if (!created) throw new AppError('PO_NUMBER', 'Gagal membuat nomor PO.');
    await tx.insert(purchaseOrderItems).values(
      items.map((item) => ({
        outletId,
        purchaseOrderId: created!.id,
        ingredientId: item.ingredientId,
        qty: item.qty,
        unitCost: item.unitCost,
      })),
    );
    await audit(tx, {
      staffId,
      action: 'purchase_order.created',
      entityType: 'purchase_order',
      entityId: created.id,
      detail: { poNumber: created.poNumber, supplier: supplier.name, total, items: items.length },
      at: now,
    });
    return { id: created.id, poNumber: created.poNumber };
  });
}

export async function setPurchaseOrderStatus(
  staffId: string,
  poId: string,
  status: 'ordered' | 'received' | 'cancelled',
) {
  const outletId = await getActiveOutletId();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const [po] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.outletId, outletId)))
      .limit(1);
    if (!po) throw new AppError('PO_NOT_FOUND', 'Purchase order tidak ditemukan.');
    if (po.status === 'received' || po.status === 'cancelled') {
      throw new AppError('PO_LOCKED', 'Purchase order ini sudah final.');
    }
    if (status === 'ordered') {
      if (po.status !== 'draft') throw new AppError('PO_STATUS', 'PO sudah dipesan.');
      const [updated] = await tx
        .update(purchaseOrders)
        .set({ status: 'ordered', orderedAt: now, updatedAt: now })
        .where(eq(purchaseOrders.id, po.id))
        .returning();
      await audit(tx, {
        staffId,
        action: 'purchase_order.ordered',
        entityType: 'purchase_order',
        entityId: po.id,
        detail: { poNumber: po.poNumber },
        at: now,
      });
      return { status: updated.status };
    }
    if (status === 'cancelled') {
      const [updated] = await tx
        .update(purchaseOrders)
        .set({ status: 'cancelled', updatedAt: now })
        .where(eq(purchaseOrders.id, po.id))
        .returning();
      await audit(tx, {
        staffId,
        action: 'purchase_order.cancelled',
        entityType: 'purchase_order',
        entityId: po.id,
        detail: { poNumber: po.poNumber },
        at: now,
      });
      return { status: updated.status };
    }

    const items = await tx
      .select({ item: purchaseOrderItems, ingredient: ingredients })
      .from(purchaseOrderItems)
      .innerJoin(ingredients, eq(purchaseOrderItems.ingredientId, ingredients.id))
      .where(eq(purchaseOrderItems.purchaseOrderId, po.id));
    for (const row of items) {
      await tx
        .update(ingredients)
        .set({
          stockQty: sql`${ingredients.stockQty} + ${row.item.qty}`,
          costPerUnit: row.item.unitCost,
          updatedAt: now,
        })
        .where(eq(ingredients.id, row.ingredient.id));
      await tx.insert(stockMovements).values({
        outletId,
        ingredientId: row.ingredient.id,
        type: 'in',
        qty: row.item.qty,
        referenceType: 'purchase_order',
        referenceId: po.id,
        note: `Terima ${po.poNumber}`,
        createdBy: staffId,
        createdAt: now,
      });
      await tx
        .update(purchaseOrderItems)
        .set({ receivedQty: row.item.qty })
        .where(eq(purchaseOrderItems.id, row.item.id));
    }
    const [updated] = await tx
      .update(purchaseOrders)
      .set({
        status: 'received',
        receivedAt: now,
        receivedBy: staffId,
        updatedAt: now,
      })
      .where(eq(purchaseOrders.id, po.id))
      .returning();
    await audit(tx, {
      staffId,
      action: 'purchase_order.received',
      entityType: 'purchase_order',
      entityId: po.id,
      detail: { poNumber: po.poNumber, total: po.total, items: items.length },
      at: now,
    });
    return { status: updated.status };
  });
}

export async function postStockOpname(
  staffId: string,
  counts: Array<{ ingredientId: string; countedQty: number }>,
  notes?: string | null,
) {
  if (counts.length === 0) throw new AppError('EMPTY_OPNAME', 'Isi minimal satu hasil hitung.');
  const outletId = await getActiveOutletId();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const now = await dbNow(tx);
    const rows = await tx
      .select()
      .from(ingredients)
      .where(
        and(
          eq(ingredients.outletId, outletId),
          inArray(
            ingredients.id,
            counts.map((count) => count.ingredientId),
          ),
        ),
      );
    const byId = new Map(rows.map((row) => [row.id, row]));
    if (byId.size !== new Set(counts.map((count) => count.ingredientId)).size) {
      throw new AppError('INGREDIENT_NOT_FOUND', 'Ada bahan yang tidak ditemukan.');
    }
    const [opname] = await tx
      .insert(stockOpnames)
      .values({
        outletId,
        notes: notes?.trim() || null,
        createdBy: staffId,
        createdAt: now,
      })
      .returning();
    let differenceUnits = 0;
    for (const count of counts) {
      const ingredient = byId.get(count.ingredientId)!;
      const counted = Math.round(Number(count.countedQty));
      if (!Number.isFinite(counted) || counted < 0) {
        throw new AppError('INVALID_QTY', 'Jumlah opname tidak valid.');
      }
      const difference = counted - ingredient.stockQty;
      if (difference === 0) continue;
      differenceUnits += Math.abs(difference);
      await tx
        .update(ingredients)
        .set({ stockQty: counted, updatedAt: now })
        .where(eq(ingredients.id, ingredient.id));
      await tx.insert(stockOpnameItems).values({
        outletId,
        opnameId: opname.id,
        ingredientId: ingredient.id,
        systemQty: ingredient.stockQty,
        countedQty: counted,
        difference,
        createdAt: now,
      });
      await tx.insert(stockMovements).values({
        outletId,
        ingredientId: ingredient.id,
        type: 'opname',
        qty: difference,
        referenceType: 'stock_opname',
        referenceId: opname.id,
        note: notes?.trim() || 'Stock opname',
        createdBy: staffId,
        createdAt: now,
      });
    }
    await audit(tx, {
      staffId,
      action: 'inventory.opname_posted',
      entityType: 'stock_opname',
      entityId: opname.id,
      detail: { itemCount: counts.length, differenceUnits },
      at: now,
    });
    return { id: opname.id, differenceUnits };
  });
}

export async function getInventoryData() {
  const db = await getDb();
  const outletId = await getActiveOutletId();
  const [ingredientRows, menuRows, recipeRows, movementRows, supplierRows, poRows, opnameRows] =
    await Promise.all([
      db
        .select()
        .from(ingredients)
        .where(eq(ingredients.outletId, outletId))
        .orderBy(asc(ingredients.name)),
      db
        .select()
        .from(menuItems)
        .where(eq(menuItems.outletId, outletId))
        .orderBy(asc(menuItems.name)),
      db
        .select({ recipe: recipes, ingredient: ingredients, menu: menuItems })
        .from(recipes)
        .innerJoin(ingredients, eq(recipes.ingredientId, ingredients.id))
        .innerJoin(menuItems, eq(recipes.menuItemId, menuItems.id))
        .where(eq(recipes.outletId, outletId))
        .orderBy(asc(menuItems.name), asc(ingredients.name)),
      db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.outletId, outletId))
        .orderBy(desc(stockMovements.createdAt))
        .limit(40),
      db
        .select()
        .from(suppliers)
        .where(eq(suppliers.outletId, outletId))
        .orderBy(asc(suppliers.name)),
      db
        .select({ po: purchaseOrders, supplierName: suppliers.name })
        .from(purchaseOrders)
        .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .where(eq(purchaseOrders.outletId, outletId))
        .orderBy(desc(purchaseOrders.createdAt))
        .limit(40),
      db
        .select()
        .from(stockOpnames)
        .where(eq(stockOpnames.outletId, outletId))
        .orderBy(desc(stockOpnames.createdAt))
        .limit(10),
    ]);

  const poIds = poRows.map((row) => row.po.id);
  const poItemRows = poIds.length
    ? await db
        .select({
          item: purchaseOrderItems,
          ingredientName: ingredients.name,
          unit: ingredients.unit,
        })
        .from(purchaseOrderItems)
        .innerJoin(ingredients, eq(purchaseOrderItems.ingredientId, ingredients.id))
        .where(inArray(purchaseOrderItems.purchaseOrderId, poIds))
    : [];
  const poItemsByPo = new Map<string, typeof poItemRows>();
  for (const row of poItemRows) {
    const list = poItemsByPo.get(row.item.purchaseOrderId) ?? [];
    list.push(row);
    poItemsByPo.set(row.item.purchaseOrderId, list);
  }

  const opnameIds = opnameRows.map((row) => row.id);
  const opnameItemRows = opnameIds.length
    ? await db
        .select()
        .from(stockOpnameItems)
        .where(inArray(stockOpnameItems.opnameId, opnameIds))
    : [];
  const opnameByOpname = new Map<string, typeof opnameItemRows>();
  for (const row of opnameItemRows) {
    const list = opnameByOpname.get(row.opnameId) ?? [];
    list.push(row);
    opnameByOpname.set(row.opnameId, list);
  }
  const ingredientCost = new Map(ingredientRows.map((row) => [row.id, row.costPerUnit]));

  const recipesByMenu = new Map<string, typeof recipeRows>();
  for (const row of recipeRows) {
    const list = recipesByMenu.get(row.recipe.menuItemId) ?? [];
    list.push(row);
    recipesByMenu.set(row.recipe.menuItemId, list);
  }
  const hpp = menuRows.map((menu) => {
    const rows = recipesByMenu.get(menu.id) ?? [];
    const cost = rows.reduce(
      (sum, row) => sum + row.recipe.qty * row.ingredient.costPerUnit,
      0,
    );
    const margin = menu.price - cost;
    return {
      menuItemId: menu.id,
      name: menu.name,
      price: menu.price,
      cost,
      margin,
      marginBps: menu.price > 0 ? Math.round((margin / menu.price) * 10_000) : 0,
      recipeCount: rows.length,
    };
  });

  return {
    ingredients: ingredientRows.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      stockQty: ingredient.stockQty,
      minStock: ingredient.minStock,
      costPerUnit: ingredient.costPerUnit,
      active: ingredient.active,
      low: ingredient.stockQty <= ingredient.minStock,
    })),
    menuItems: menuRows.map((item) => ({ id: item.id, name: item.name, price: item.price })),
    recipes: recipeRows.map((row) => ({
      id: row.recipe.id,
      menuItemId: row.menu.id,
      menuName: row.menu.name,
      ingredientId: row.ingredient.id,
      ingredientName: row.ingredient.name,
      qty: row.recipe.qty,
      unit: row.ingredient.unit,
    })),
    movements: movementRows.map((movement) => ({
      id: movement.id,
      ingredientId: movement.ingredientId,
      type: movement.type,
      qty: movement.qty,
      referenceType: movement.referenceType,
      note: movement.note,
      createdAt: movement.createdAt.toISOString(),
    })),
    suppliers: supplierRows.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      notes: supplier.notes,
      active: supplier.active,
    })),
    purchaseOrders: poRows.map((row) => ({
      id: row.po.id,
      poNumber: row.po.poNumber,
      supplierId: row.po.supplierId,
      supplierName: row.supplierName,
      status: row.po.status,
      total: row.po.total,
      notes: row.po.notes,
      orderedAt: row.po.orderedAt?.toISOString() ?? null,
      receivedAt: row.po.receivedAt?.toISOString() ?? null,
      createdAt: row.po.createdAt.toISOString(),
      items: (poItemsByPo.get(row.po.id) ?? []).map((item) => ({
        id: item.item.id,
        ingredientId: item.item.ingredientId,
        ingredientName: item.ingredientName,
        unit: item.unit,
        qty: item.item.qty,
        unitCost: item.item.unitCost,
        receivedQty: item.item.receivedQty,
      })),
    })),
    hpp,
    opnames: opnameRows.map((opname) => {
      const items = opnameByOpname.get(opname.id) ?? [];
      const differenceValue = items.reduce(
        (sum, item) =>
          sum + Math.abs(item.difference) * (ingredientCost.get(item.ingredientId) ?? 0),
        0,
      );
      return {
        id: opname.id,
        notes: opname.notes,
        itemCount: items.length,
        differenceValue,
        createdAt: opname.createdAt.toISOString(),
      };
    }),
  };
}
