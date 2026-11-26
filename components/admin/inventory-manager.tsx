'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  adjustStockAction,
  deleteRecipeAction,
  saveIngredientAction,
  saveRecipeAction,
} from '@/app/actions/inventory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label, Select } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { cn, formatRp } from '@/lib/format';
import type { InventoryData } from '@/lib/types';

type Ingredient = InventoryData['ingredients'][number];

export function InventoryManager({ data }: { data: InventoryData }) {
  const router = useRouter();
  const [editor, setEditor] = useState<Ingredient | 'new' | null>(null);
  const [adjusting, setAdjusting] = useState<Ingredient | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [stockQty, setStockQty] = useState(0);
  const [minStock, setMinStock] = useState(0);
  const [costPerUnit, setCostPerUnit] = useState(0);
  const [active, setActive] = useState(true);

  const [adjustType, setAdjustType] = useState<'in' | 'adjust' | 'waste' | 'opname'>('in');
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustNote, setAdjustNote] = useState('');

  const [menuItemId, setMenuItemId] = useState(data.menuItems[0]?.id ?? '');
  const [ingredientId, setIngredientId] = useState(data.ingredients[0]?.id ?? '');
  const [recipeQty, setRecipeQty] = useState(1);

  const stats = useMemo(
    () => ({
      total: data.ingredients.length,
      low: data.ingredients.filter((ingredient) => ingredient.low).length,
      recipes: data.recipes.length,
      value: data.ingredients.reduce(
        (sum, ingredient) => sum + ingredient.stockQty * ingredient.costPerUnit,
        0,
      ),
    }),
    [data.ingredients, data.recipes.length],
  );

  const recipesByMenu = useMemo(() => {
    const map = new Map<string, InventoryData['recipes']>();
    for (const recipe of data.recipes) {
      const list = map.get(recipe.menuItemId) ?? [];
      list.push(recipe);
      map.set(recipe.menuItemId, list);
    }
    return [...map.entries()];
  }, [data.recipes]);

  function openNew() {
    setEditor('new');
    setName('');
    setUnit('pcs');
    setStockQty(0);
    setMinStock(0);
    setCostPerUnit(0);
    setActive(true);
    setError(null);
  }

  function openEdit(ingredient: Ingredient) {
    setEditor(ingredient);
    setName(ingredient.name);
    setUnit(ingredient.unit);
    setStockQty(ingredient.stockQty);
    setMinStock(ingredient.minStock);
    setCostPerUnit(ingredient.costPerUnit);
    setActive(ingredient.active);
    setError(null);
  }

  async function saveIngredient() {
    setSaving(true);
    setError(null);
    const result = await saveIngredientAction({
      id: editor === 'new' || editor === null ? undefined : editor.id,
      name,
      unit,
      stockQty,
      minStock,
      costPerUnit,
      active,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(editor === 'new' ? 'Bahan ditambahkan' : 'Bahan diperbarui');
    setEditor(null);
    router.refresh();
  }

  async function submitAdjustment() {
    if (!adjusting) return;
    setSaving(true);
    setError(null);
    const result = await adjustStockAction({
      ingredientId: adjusting.id,
      type: adjustType,
      qty: adjustQty,
      note: adjustNote || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Stok diperbarui', {
      description: `${adjusting.name} → ${result.data?.stockQty ?? 0} ${adjusting.unit}`,
    });
    setAdjusting(null);
    router.refresh();
  }

  async function addRecipe() {
    setSaving(true);
    setError(null);
    const result = await saveRecipeAction({ menuItemId, ingredientId, qty: recipeQty });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Resep disimpan');
    router.refresh();
  }

  async function removeRecipe(id: string) {
    const result = await deleteRecipeAction(id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Resep dihapus');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Inventory"
        title="Bahan, Resep & Stok"
        description="Stok bahan, resep per menu, dan stock movement append-only."
        actions={
          <Button variant="primary" size="md" onClick={openNew}>
            <Icon name="add" className="text-[18px]" />
            Tambah bahan
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total bahan" value={stats.total} icon="inventory_2" tone="primary" />
        <StatCard label="Stok rendah" value={stats.low} icon="warning" tone="error" />
        <StatCard label="Baris resep" value={stats.recipes} icon="menu_book" tone="cyan" />
        <StatCard label="Nilai stok" value={formatRp(stats.value)} icon="payments" tone="tertiary" />
      </section>

      <section className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        {data.ingredients.map((ingredient) => (
          <article key={ingredient.id} className="panel rounded-xl p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-body-md font-bold text-on-surface">{ingredient.name}</span>
                  <Badge tone={ingredient.low ? 'error' : 'primary'} dot>
                    {ingredient.low ? 'Low stock' : 'OK'}
                  </Badge>
                  {!ingredient.active ? <Badge tone="neutral">Off</Badge> : null}
                </div>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  Stok {ingredient.stockQty.toLocaleString('id-ID')} {ingredient.unit} · min{' '}
                  {ingredient.minStock} {ingredient.unit}
                </p>
                <p className="text-[10px] text-outline">
                  Biaya {formatRp(ingredient.costPerUnit)}/{ingredient.unit}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(ingredient)}>
                  <Icon name="edit" className="text-[16px]" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setAdjusting(ingredient);
                    setAdjustType('in');
                    setAdjustQty(0);
                    setAdjustNote('');
                    setError(null);
                  }}
                >
                  <Icon name="tune" className="text-[16px]" />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="panel flex flex-col gap-3 rounded-xl p-4">
        <div>
          <h2 className="text-headline-md font-bold text-on-surface">Resep per menu</h2>
          <p className="text-body-sm text-on-surface-variant">
            Pemakaian bahan otomatis mengurangi stok saat order dibuat.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_1fr_120px_auto]">
          <Select value={menuItemId} onChange={(event) => setMenuItemId(event.target.value)}>
            {data.menuItems.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {menu.name}
              </option>
            ))}
          </Select>
          <Select value={ingredientId} onChange={(event) => setIngredientId(event.target.value)}>
            {data.ingredients.map((ingredient) => (
              <option key={ingredient.id} value={ingredient.id}>
                {ingredient.name} ({ingredient.unit})
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min={1}
            value={recipeQty}
            onChange={(event) => setRecipeQty(Math.max(1, Number(event.target.value) || 1))}
          />
          <Button variant="secondary" onClick={addRecipe} loading={saving}>
            Simpan resep
          </Button>
        </div>
        <FormError message={error} />
        {recipesByMenu.length === 0 ? (
          <EmptyState compact icon="menu_book" title="Belum ada resep" />
        ) : (
          <div className="flex flex-col gap-2">
            {recipesByMenu.map(([menuId, rows]) => (
              <div key={menuId} className="rounded-lg border border-outline-variant/20 bg-surface-container p-2.5">
                <div className="text-body-sm font-bold text-on-surface">
                  {data.menuItems.find((item) => item.id === menuId)?.name ?? 'Menu'}
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  {rows.map((recipe) => (
                    <div key={recipe.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-on-surface-variant">
                        {recipe.ingredientName} · {recipe.qty} {recipe.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRecipe(recipe.id)}
                        className="text-outline hover:text-error"
                        aria-label="Hapus resep"
                      >
                        <Icon name="delete" className="text-[15px]" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel rounded-xl p-4">
        <h2 className="text-body-md font-bold text-on-surface">Stock movement terbaru</h2>
        <div className="mt-2 flex flex-col divide-y divide-outline-variant/10">
          {data.movements.length === 0 ? (
            <p className="py-4 text-body-sm text-on-surface-variant">Belum ada movement.</p>
          ) : (
            data.movements.map((movement) => {
              const ingredient = data.ingredients.find((item) => item.id === movement.ingredientId);
              return (
                <div key={movement.id} className="flex items-center justify-between gap-2 py-1.5 text-[11px]">
                  <span className={cn('text-on-surface-variant', movement.qty < 0 && 'text-error')}>
                    {movement.type} · {ingredient?.name ?? 'Bahan'} · {movement.note ?? movement.referenceType}
                  </span>
                  <span className={cn('numeric font-semibold', movement.qty < 0 ? 'text-error' : 'text-primary')}>
                    {movement.qty > 0 ? '+' : ''}
                    {movement.qty}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <Modal
        open={editor !== null}
        onClose={() => (saving ? undefined : setEditor(null))}
        title={editor === 'new' ? 'Tambah bahan' : 'Edit bahan'}
        icon="inventory_2"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditor(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={saveIngredient} loading={saving}>
              Simpan bahan
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Nama bahan" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Satuan" value={unit} onChange={(event) => setUnit(event.target.value)} />
            <Input
              label="Min. stok"
              type="number"
              min={0}
              value={minStock}
              onChange={(event) => setMinStock(Math.max(0, Number(event.target.value) || 0))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Stok saat ini"
              type="number"
              min={0}
              value={stockQty}
              onChange={(event) => setStockQty(Math.max(0, Number(event.target.value) || 0))}
            />
            <Input
              label="Biaya/satuan"
              type="number"
              min={0}
              value={costPerUnit}
              onChange={(event) => setCostPerUnit(Math.max(0, Number(event.target.value) || 0))}
            />
          </div>
          <FormError message={error} />
        </div>
      </Modal>

      <Modal
        open={Boolean(adjusting)}
        onClose={() => (saving ? undefined : setAdjusting(null))}
        title={adjusting ? `Adjust stok ${adjusting.name}` : 'Adjust stok'}
        icon="tune"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setAdjusting(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={submitAdjustment} loading={saving}>
              Simpan
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <Label>Tipe</Label>
            <Select className="mt-1.5" value={adjustType} onChange={(event) => setAdjustType(event.target.value as typeof adjustType)}>
              <option value="in">Stok masuk</option>
              <option value="adjust">Tambah koreksi</option>
              <option value="waste">Waste / rusak</option>
              <option value="opname">Set jumlah opname</option>
            </Select>
          </div>
          <Input
            label="Jumlah"
            type="number"
            min={1}
            value={adjustQty}
            onChange={(event) => setAdjustQty(Math.max(1, Number(event.target.value) || 1))}
            hint={adjusting ? `${adjusting.unit}` : undefined}
          />
          <Input label="Catatan" value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} />
          <FormError message={error} />
        </div>
      </Modal>
    </div>
  );
}
