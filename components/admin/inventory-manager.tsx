'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  adjustStockAction,
  deleteRecipeAction,
  postStockOpnameAction,
  saveIngredientAction,
  savePurchaseOrderAction,
  saveRecipeAction,
  saveSupplierAction,
  setPurchaseOrderStatusAction,
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
type Supplier = InventoryData['suppliers'][number];
type PurchaseOrder = InventoryData['purchaseOrders'][number];
type PoLine = { ingredientId: string; qty: number; unitCost: number };

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

  const [supplierEditor, setSupplierEditor] = useState<Supplier | 'new' | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');

  const [poOpen, setPoOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState(data.suppliers[0]?.id ?? '');
  const [poNotes, setPoNotes] = useState('');
  const [poLines, setPoLines] = useState<PoLine[]>([]);

  const [opnameOpen, setOpnameOpen] = useState(false);
  const [opnameNotes, setOpnameNotes] = useState('');
  const [opnameCounts, setOpnameCounts] = useState<Record<string, number>>({});

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

  function openSupplier(supplier: Supplier | 'new') {
    setSupplierEditor(supplier);
    setSupplierName(supplier === 'new' ? '' : supplier.name);
    setSupplierContact(supplier === 'new' ? '' : supplier.contactName ?? '');
    setSupplierPhone(supplier === 'new' ? '' : supplier.phone ?? '');
    setSupplierEmail(supplier === 'new' ? '' : supplier.email ?? '');
    setSupplierNotes(supplier === 'new' ? '' : supplier.notes ?? '');
    setError(null);
  }

  async function saveSupplier() {
    setSaving(true);
    setError(null);
    const result = await saveSupplierAction({
      id: supplierEditor === 'new' || supplierEditor === null ? undefined : supplierEditor.id,
      name: supplierName,
      contactName: supplierContact || null,
      phone: supplierPhone || null,
      email: supplierEmail || null,
      notes: supplierNotes || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Supplier disimpan');
    setSupplierEditor(null);
    router.refresh();
  }

  function openPo() {
    setPoSupplierId(data.suppliers[0]?.id ?? '');
    setPoNotes('');
    setPoLines(
      data.ingredients[0]
        ? [
            {
              ingredientId: data.ingredients[0].id,
              qty: 1,
              unitCost: data.ingredients[0].costPerUnit,
            },
          ]
        : [],
    );
    setError(null);
    setPoOpen(true);
  }

  async function savePo() {
    setSaving(true);
    setError(null);
    const result = await savePurchaseOrderAction({
      supplierId: poSupplierId,
      notes: poNotes || null,
      items: poLines,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`PO ${result.data?.poNumber} dibuat`);
    setPoOpen(false);
    router.refresh();
  }

  async function changePoStatus(po: PurchaseOrder, status: 'ordered' | 'received' | 'cancelled') {
    if (
      status === 'received' &&
      !window.confirm(`Terima PO ${po.poNumber}? Stok bahan akan bertambah dan harga modal diperbarui.`)
    ) {
      return;
    }
    const result = await setPurchaseOrderStatusAction(po.id, status);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      status === 'received'
        ? `PO ${po.poNumber} diterima, stok diperbarui`
        : status === 'ordered'
          ? `PO ${po.poNumber} ditandai dipesan`
          : `PO ${po.poNumber} dibatalkan`,
    );
    router.refresh();
  }

  function openOpname() {
    const initial: Record<string, number> = {};
    for (const ingredient of data.ingredients) initial[ingredient.id] = ingredient.stockQty;
    setOpnameCounts(initial);
    setOpnameNotes('');
    setError(null);
    setOpnameOpen(true);
  }

  async function postOpname() {
    setSaving(true);
    setError(null);
    const result = await postStockOpnameAction(
      Object.entries(opnameCounts).map(([ingredientId, countedQty]) => ({
        ingredientId,
        countedQty,
      })),
      opnameNotes || null,
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Stock opname diposting', {
      description: `${result.data?.differenceUnits ?? 0} unit selisih dicatat.`,
    });
    setOpnameOpen(false);
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(ingredient)}
                  aria-label={`Edit bahan ${ingredient.name}`}
                >
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
                  aria-label={`Adjust stok ${ingredient.name}`}
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

      <section className="panel flex flex-col gap-3 rounded-xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-headline-md font-bold text-on-surface">HPP per menu</h2>
            <p className="text-body-sm text-on-surface-variant">
              Biaya bahan dari resep × harga modal terbaru. Margin dihitung sebelum pajak/service.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={openOpname}>
            <Icon name="assignment_turned_in" className="text-[16px]" />
            Stock opname
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[11px]">
            <thead className="text-[10px] uppercase tracking-wider text-outline">
              <tr>
                <th className="pb-2">Menu</th>
                <th className="pb-2 text-right">Harga</th>
                <th className="pb-2 text-right">HPP</th>
                <th className="pb-2 text-right">Margin</th>
                <th className="pb-2 text-right">Resep</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {data.hpp.map((row) => (
                <tr key={row.menuItemId}>
                  <td className="py-1.5 font-semibold text-on-surface">{row.name}</td>
                  <td className="numeric py-1.5 text-right text-on-surface-variant">
                    {formatRp(row.price)}
                  </td>
                  <td className="numeric py-1.5 text-right text-on-surface-variant">
                    {formatRp(row.cost)}
                  </td>
                  <td
                    className={cn(
                      'numeric py-1.5 text-right font-bold',
                      row.margin < 0 ? 'text-error' : 'text-primary',
                    )}
                  >
                    {formatRp(row.margin)} · {(row.marginBps / 100).toFixed(1)}%
                  </td>
                  <td className="numeric py-1.5 text-right text-outline">{row.recipeCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel flex flex-col gap-3 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-headline-md font-bold text-on-surface">Supplier</h2>
            <p className="text-body-sm text-on-surface-variant">
              Vendor bahan baku untuk purchase order dan evaluasi harga.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => openSupplier('new')}>
            <Icon name="add" className="text-[16px]" />
            Tambah supplier
          </Button>
        </div>
        {data.suppliers.length === 0 ? (
          <EmptyState compact icon="local_shipping" title="Belum ada supplier" />
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.suppliers.map((supplier) => (
              <div
                key={supplier.id}
                className="rounded-lg border border-outline-variant/20 bg-surface-container p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-bold text-on-surface">{supplier.name}</p>
                    <p className="text-[10px] text-on-surface-variant">
                      {supplier.contactName || 'Tanpa kontak'} · {supplier.phone || supplier.email || '—'}
                    </p>
                    {supplier.notes ? (
                      <p className="mt-1 line-clamp-2 text-[10px] text-outline">{supplier.notes}</p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openSupplier(supplier)}
                    aria-label={`Edit supplier ${supplier.name}`}
                  >
                    <Icon name="edit" className="text-[15px]" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel flex flex-col gap-3 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-headline-md font-bold text-on-surface">Purchase order</h2>
            <p className="text-body-sm text-on-surface-variant">
              PO diterima → stok bahan bertambah → harga modal diperbarui.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={openPo}
            disabled={data.suppliers.length === 0 || data.ingredients.length === 0}
          >
            <Icon name="add_shopping_cart" className="text-[16px]" />
            Buat PO
          </Button>
        </div>
        {data.purchaseOrders.length === 0 ? (
          <EmptyState compact icon="receipt_long" title="Belum ada purchase order" />
        ) : (
          <div className="flex flex-col gap-2">
            {data.purchaseOrders.map((po) => (
              <div
                key={po.id}
                className="rounded-lg border border-outline-variant/20 bg-surface-container p-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="numeric text-body-sm font-bold text-primary">{po.poNumber}</span>
                      <Badge
                        tone={
                          po.status === 'received'
                            ? 'primary'
                            : po.status === 'cancelled'
                              ? 'error'
                              : po.status === 'ordered'
                                ? 'cyan'
                                : 'neutral'
                        }
                        dot
                      >
                        {po.status}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-on-surface-variant">
                      {po.supplierName} · {formatRp(po.total)} · {po.items.length} bahan
                    </p>
                    <p className="text-[10px] text-outline">
                      {po.items.map((item) => `${item.ingredientName} ${item.qty}${item.unit}`).join(', ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {po.status === 'draft' ? (
                      <Button variant="secondary" size="sm" onClick={() => changePoStatus(po, 'ordered')}>
                        Pesan
                      </Button>
                    ) : null}
                    {po.status === 'draft' || po.status === 'ordered' ? (
                      <>
                        <Button variant="primary" size="sm" onClick={() => changePoStatus(po, 'received')}>
                          Terima
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => changePoStatus(po, 'cancelled')}>
                          Batal
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {data.opnames.length > 0 ? (
          <div className="border-t border-outline-variant/20 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">
              Stock opname terakhir
            </p>
            <div className="mt-1 flex flex-col gap-1">
              {data.opnames.map((opname) => (
                <div key={opname.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-on-surface-variant">
                    {new Date(opname.createdAt).toLocaleString('id-ID', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    {opname.notes ? ` · ${opname.notes}` : ''}
                  </span>
                  <span className="numeric text-on-surface">
                    {opname.itemCount} item · {formatRp(opname.differenceValue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
            min={adjustType === 'opname' ? 0 : 1}
            value={adjustQty}
            onChange={(event) =>
              setAdjustQty(
                Math.max(adjustType === 'opname' ? 0 : 1, Number(event.target.value) || 0),
              )
            }
            hint={adjusting ? `${adjusting.unit}` : undefined}
          />
          <Input label="Catatan" value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} />
          <FormError message={error} />
        </div>
      </Modal>

      <Modal
        open={supplierEditor !== null}
        onClose={() => (saving ? undefined : setSupplierEditor(null))}
        title={supplierEditor === 'new' ? 'Tambah supplier' : 'Edit supplier'}
        icon="local_shipping"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setSupplierEditor(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={saveSupplier} loading={saving}>
              Simpan supplier
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Input label="Nama supplier" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Kontak" value={supplierContact} onChange={(event) => setSupplierContact(event.target.value)} />
            <Input label="Telepon" value={supplierPhone} onChange={(event) => setSupplierPhone(event.target.value)} />
          </div>
          <Input label="Email" type="email" value={supplierEmail} onChange={(event) => setSupplierEmail(event.target.value)} />
          <Input label="Catatan" value={supplierNotes} onChange={(event) => setSupplierNotes(event.target.value)} />
          <FormError message={error} />
        </div>
      </Modal>

      <Modal
        open={poOpen}
        onClose={() => (saving ? undefined : setPoOpen(false))}
        title="Buat purchase order"
        subtitle="PO draft bisa diubah. Setelah diterima, stok dan harga modal bahan diperbarui."
        icon="add_shopping_cart"
        size="lg"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setPoOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button
              variant="primary"
              className="flex-[2]"
              onClick={savePo}
              loading={saving}
              disabled={!poSupplierId || poLines.length === 0}
            >
              Simpan PO
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Select
            label="Supplier"
            value={poSupplierId}
            onChange={(event) => setPoSupplierId(event.target.value)}
          >
            {data.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </Select>
          <div className="flex flex-col gap-2">
            {poLines.map((line, index) => {
              const ingredient = data.ingredients.find((item) => item.id === line.ingredientId);
              return (
                <div key={`${line.ingredientId}-${index}`} className="grid grid-cols-[1fr_80px_110px_32px] items-end gap-2">
                  <Select
                    label={index === 0 ? 'Bahan' : undefined}
                    value={line.ingredientId}
                    onChange={(event) => {
                      const next = data.ingredients.find((item) => item.id === event.target.value);
                      setPoLines((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? {
                                ...entry,
                                ingredientId: event.target.value,
                                unitCost: next?.costPerUnit ?? entry.unitCost,
                              }
                            : entry,
                        ),
                      );
                    }}
                  >
                    {data.ingredients.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label={index === 0 ? `Qty${ingredient ? ` (${ingredient.unit})` : ''}` : undefined}
                    type="number"
                    min={1}
                    value={line.qty}
                    onChange={(event) =>
                      setPoLines((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, qty: Math.max(1, Number(event.target.value) || 1) }
                            : entry,
                        ),
                      )
                    }
                  />
                  <Input
                    label={index === 0 ? 'Harga/unit' : undefined}
                    type="number"
                    min={0}
                    value={line.unitCost}
                    onChange={(event) =>
                      setPoLines((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, unitCost: Math.max(0, Number(event.target.value) || 0) }
                            : entry,
                        ),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPoLines((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                    aria-label="Hapus baris PO"
                  >
                    <Icon name="delete" className="text-[16px]" />
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setPoLines((current) => [
                  ...current,
                  {
                    ingredientId: data.ingredients[0]?.id ?? '',
                    qty: 1,
                    unitCost: data.ingredients[0]?.costPerUnit ?? 0,
                  },
                ])
              }
            >
              <Icon name="add" className="text-[16px]" />
              Tambah baris
            </Button>
            <span className="numeric text-body-sm font-bold text-primary">
              Total {formatRp(poLines.reduce((sum, line) => sum + line.qty * line.unitCost, 0))}
            </span>
          </div>
          <Input label="Catatan PO" value={poNotes} onChange={(event) => setPoNotes(event.target.value)} />
          <FormError message={error} />
        </div>
      </Modal>

      <Modal
        open={opnameOpen}
        onClose={() => (saving ? undefined : setOpnameOpen(false))}
        title="Stock opname"
        subtitle="Masukkan hasil hitung fisik. Sistem mencatat selisih dan menyesuaikan stok."
        icon="assignment_turned_in"
        size="lg"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpnameOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={postOpname} loading={saving}>
              Posting opname
            </Button>
          </div>
        }
      >
        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
          {data.ingredients.map((ingredient) => {
            const counted = opnameCounts[ingredient.id] ?? ingredient.stockQty;
            const difference = counted - ingredient.stockQty;
            return (
              <div key={ingredient.id} className="grid grid-cols-[1fr_120px_120px] items-center gap-2">
                <div>
                  <p className="text-body-sm font-semibold text-on-surface">{ingredient.name}</p>
                  <p className="text-[10px] text-outline">
                    Sistem {ingredient.stockQty} {ingredient.unit}
                  </p>
                </div>
                <Input
                  type="number"
                  min={0}
                  value={counted}
                  onChange={(event) =>
                    setOpnameCounts((current) => ({
                      ...current,
                      [ingredient.id]: Math.max(0, Number(event.target.value) || 0),
                    }))
                  }
                />
                <span
                  className={cn(
                    'numeric text-right text-[11px] font-bold',
                    difference === 0 ? 'text-outline' : difference > 0 ? 'text-primary' : 'text-error',
                  )}
                >
                  {difference > 0 ? '+' : ''}
                  {difference} {ingredient.unit}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <Input label="Catatan opname" value={opnameNotes} onChange={(event) => setOpnameNotes(event.target.value)} />
        </div>
        <FormError message={error} />
      </Modal>
    </div>
  );
}
