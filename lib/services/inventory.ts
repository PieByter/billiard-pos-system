import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { dbNow, getDb, type DbTransaction } from '@/lib/db';
import {
  ingredients,
  menuItems,
  orderItems,
  recipes,
  stockMovements,
} from '@/lib/db/schema';
import { AppError } from '@/lib/errors';
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
      .select({ id: menuItems.id, name: menuItems.name })
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
      .values({ menuItemId: input.menuItemId, ingredientId: input.ingredientId, qty })
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
    await tx
      .update(ingredients)
      .set({ stockQty: sql`${ingredients.stockQty} + ${row.qty}`, updatedAt: now })
      .where(eq(ingredients.id, row.ingredientId));
    await tx.insert(stockMovements).values({
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

export async function getInventoryData() {
  const db = await getDb();
  const [ingredientRows, menuRows, recipeRows, movementRows] = await Promise.all([
    db.select().from(ingredients).orderBy(asc(ingredients.name)),
    db.select().from(menuItems).orderBy(asc(menuItems.name)),
    db
      .select({ recipe: recipes, ingredient: ingredients, menu: menuItems })
      .from(recipes)
      .innerJoin(ingredients, eq(recipes.ingredientId, ingredients.id))
      .innerJoin(menuItems, eq(recipes.menuItemId, menuItems.id))
      .orderBy(asc(menuItems.name), asc(ingredients.name)),
    db.select().from(stockMovements).orderBy(sql`${stockMovements.createdAt} desc`).limit(30),
  ]);
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
    menuItems: menuRows.map((item) => ({ id: item.id, name: item.name })),
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
  };
}
