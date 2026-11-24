'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  saveMenuItemAction,
  toggleMenuItemAction,
  updateMenuStockAction,
} from '@/app/actions/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input, Label, Select, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, SectionHeader, StatCard } from '@/components/ui/stat-card';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn, formatRp } from '@/lib/format';
import type { MenuAdminData, MenuItemView } from '@/lib/types';

const ICON_CHOICES = [
  'restaurant_menu',
  'rice_bowl',
  'lunch_dining',
  'local_pizza',
  'ramen_dining',
  'tapas',
  'kebab_dining',
  'set_meal',
  'local_fire_department',
  'breakfast_dining',
  'local_cafe',
  'coffee',
  'local_bar',
  'local_drink',
  'emoji_food_beverage',
  'sports_bar',
  'icecream',
  'cake',
  'water_drop',
  'ramen_dining',
];

type Filter = 'all' | 'available' | 'soldout' | 'offmenu';

export function MenuManager({ data }: { data: MenuAdminData }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<MenuItemView | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const itemRows = data.items;

  const stats = useMemo(
    () => ({
      total: itemRows.length,
      best: itemRows.filter((item) => item.bestSeller).length,
      soldout: itemRows.filter((item) => item.soldOut || !item.available).length,
      lowStock: itemRows.filter((item) => item.stock !== null && item.stock <= 5).length,
    }),
    [itemRows],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return itemRows.filter((item) => {
      if (category !== 'all' && item.categoryId !== category) return false;
      if (filter === 'available' && (!item.available || item.soldOut)) return false;
      if (filter === 'soldout' && !(item.available && item.soldOut)) return false;
      if (filter === 'offmenu' && item.available) return false;
      if (!term) return true;
      return `${item.name} ${item.description} ${item.categoryName}`.toLowerCase().includes(term);
    });
  }, [itemRows, search, category, filter]);

  async function toggle(item: MenuItemView) {
    setBusyId(item.id);
    const result = await toggleMenuItemAction(item.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Menu ${item.name} ${result.data?.available ? 'diaktifkan' : 'dinonaktifkan'}`);
    router.refresh();
  }

  async function adjustStock(item: MenuItemView, delta: number) {
    if (item.stock === null) return;
    const next = Math.max(0, item.stock + delta);
    setBusyId(item.id);
    const result = await updateMenuStockAction(item.id, next);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow="Admin catalog"
        title="Menu & Stok"
        description="Harga, ketersediaan, stok, dan routing station kitchen/bar."
        actions={
          <Button variant="primary" size="md" onClick={() => setEditing('new')}>
            <Icon name="add" className="text-[18px]" />
            Tambah menu
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total menu" value={stats.total} icon="restaurant_menu" tone="primary" />
        <StatCard label="Best seller" value={stats.best} icon="star" tone="tertiary" />
        <StatCard
          label="Sold out / off"
          value={stats.soldout}
          icon="remove_shopping_cart"
          tone="error"
          hint="Tidak bisa dipesan"
        />
        <StatCard
          label="Stok tipis ≤ 5"
          value={stats.lowStock}
          icon="inventory_2"
          tone="cyan"
          hint="Segera restock"
        />
      </section>

      <div className="panel flex flex-col gap-2 rounded-xl p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Semua', count: itemRows.length },
              { value: 'available', label: 'Tersedia' },
              { value: 'soldout', label: 'Habis' },
              { value: 'offmenu', label: 'Off menu' },
            ]}
          />
          <div className="relative w-full lg:w-72">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari menu…"
              className="h-10 w-full rounded-lg border border-outline-variant/55 bg-surface-container-lowest pl-9 pr-3 text-body-md text-on-surface placeholder:text-outline/70 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-body-sm font-semibold transition-colors',
              category === 'all'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface',
            )}
          >
            Semua kategori
          </button>
          {data.categories.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setCategory(entry.id)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-body-sm font-semibold transition-colors',
                category === entry.id
                  ? 'bg-secondary text-on-secondary'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface',
              )}
            >
              {entry.name}
            </button>
          ))}
        </div>
      </div>

      <div className="panel overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-high text-label-badge uppercase tracking-[0.08em] text-on-surface-variant">
                <th className="px-3 py-2.5 font-bold">Menu</th>
                <th className="px-3 py-2.5 font-bold">Kategori</th>
                <th className="px-3 py-2.5 font-bold">Station</th>
                <th className="px-3 py-2.5 font-bold">Harga</th>
                <th className="px-3 py-2.5 font-bold">Stok</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 text-right font-bold">Opsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/15 text-body-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      compact
                      icon="search_off"
                      title="Menu tidak ditemukan"
                      description="Ubah filter atau tambah menu baru."
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-surface-container-high/20">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br',
                            item.station === 'bar'
                              ? 'border-secondary/20 from-secondary/20 to-secondary/5 text-secondary'
                              : 'border-tertiary/20 from-tertiary/20 to-tertiary/5 text-tertiary',
                          )}
                        >
                          <Icon name={item.imageIcon} className="text-[19px]" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="max-w-[240px] truncate font-bold text-on-surface">
                              {item.name}
                            </span>
                            {item.bestSeller ? (
                              <span className="text-[10px] text-tertiary">★</span>
                            ) : null}
                          </div>
                          <p className="max-w-[300px] truncate text-[10px] text-outline">
                            {item.description || 'Tanpa deskripsi'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-on-surface-variant">
                      {item.categoryName}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={item.station === 'bar' ? 'cyan' : 'paused'}>
                        {item.station === 'bar' ? 'Bar' : 'Kitchen'}
                      </Badge>
                    </td>
                    <td className="numeric whitespace-nowrap px-3 py-2.5 font-semibold text-primary">
                      {formatRp(item.price)}
                    </td>
                    <td className="px-3 py-2.5">
                      {item.stock === null ? (
                        <span className="text-outline">∞ bebas</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busyId === item.id || item.stock <= 0}
                            onClick={() => adjustStock(item, -1)}
                            className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-high text-on-surface-variant hover:text-error disabled:opacity-40"
                          >
                            <Icon name="remove" className="text-[14px]" />
                          </button>
                          <span
                            className={cn(
                              'numeric w-8 text-center font-semibold',
                              item.stock <= 5 ? 'text-error' : 'text-on-surface',
                            )}
                          >
                            {item.stock}
                          </span>
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => adjustStock(item, 1)}
                            className="flex h-6 w-6 items-center justify-center rounded bg-surface-container-high text-on-surface-variant hover:text-primary disabled:opacity-40"
                          >
                            <Icon name="add" className="text-[14px]" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        tone={!item.available ? 'neutral' : item.soldOut ? 'error' : 'primary'}
                        dot
                      >
                        {!item.available ? 'Off menu' : item.soldOut ? 'Sold out' : 'Tersedia'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(item)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-secondary"
                          title="Edit menu"
                        >
                          <Icon name="edit" className="text-[17px]" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => toggle(item)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary disabled:opacity-50"
                          title={item.available ? 'Nonaktifkan' : 'Aktifkan'}
                        >
                          <Icon
                            name={
                              busyId === item.id
                                ? 'progress_activity'
                                : item.available
                                  ? 'toggle_on'
                                  : 'toggle_off'
                            }
                            className="text-[22px]"
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <MenuItemDialog
        item={editing === 'new' ? null : editing}
        open={Boolean(editing)}
        categories={data.categories}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function MenuItemDialog({
  item,
  open,
  categories,
  onClose,
}: {
  item: MenuItemView | null;
  open: boolean;
  categories: MenuAdminData['categories'];
  onClose: () => void;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [station, setStation] = useState<'kitchen' | 'bar'>('kitchen');
  const [tracked, setTracked] = useState(false);
  const [stock, setStock] = useState(0);
  const [imageIcon, setImageIcon] = useState('restaurant_menu');
  const [bestSeller, setBestSeller] = useState(false);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCategoryId(item?.categoryId ?? categories[0]?.id ?? '');
    setName(item?.name ?? '');
    setDescription(item?.description ?? '');
    setPrice(item?.price ?? 0);
    setStation(item?.station ?? 'kitchen');
    setTracked(item ? item.stock !== null : false);
    setStock(item?.stock ?? 0);
    setImageIcon(item?.imageIcon ?? 'restaurant_menu');
    setBestSeller(item?.bestSeller ?? false);
    setAvailable(item?.available ?? true);
    setError(null);
    setLoading(false);
  }, [open, item, categories]);

  async function submit() {
    setLoading(true);
    setError(null);
    const result = await saveMenuItemAction({
      id: item?.id,
      categoryId,
      name,
      description,
      price,
      stock: tracked ? stock : null,
      station,
      imageIcon,
      bestSeller,
      available,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(item ? 'Menu diperbarui' : 'Menu baru ditambahkan');
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `Edit menu · ${item.name}` : 'Tambah menu baru'}
      subtitle="Perubahan harga hanya berlaku untuk order baru; snapshot order lama aman."
      icon="restaurant_menu"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={loading}
            disabled={!name.trim() || !categoryId || price <= 0}
          >
            Simpan menu
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Nama menu"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Contoh: Truffle Parmesan Fries"
          />
          <Select
            label="Kategori"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        </div>
        <Textarea
          label="Deskripsi"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Deskripsi singkat untuk halaman customer & kasir."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Harga</Label>
            <div className="mt-1.5">
              <MoneyInput value={price} onChange={setPrice} />
            </div>
          </div>
          <Select
            label="Station KDS"
            value={station}
            onChange={(event) => setStation(event.target.value as 'kitchen' | 'bar')}
          >
            <option value="kitchen">Kitchen / dapur panas</option>
            <option value="bar">Bar / barista</option>
          </Select>
        </div>

        <div className="rounded-xl border border-outline-variant/25 bg-surface-container p-3">
          <Switch
            checked={tracked}
            onChange={setTracked}
            label="Lacak stok"
            description="Stok berkurang otomatis saat order. Nonaktif = stok bebas."
          />
          {tracked ? (
            <div className="mt-3 max-w-[180px]">
              <Input
                label="Stok tersedia"
                type="number"
                min={0}
                value={stock}
                onChange={(event) => setStock(Math.max(0, Number(event.target.value)))}
              />
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-outline-variant/25 bg-surface-container p-3">
          <Label hint="Tampil di filter best seller">Ikon menu</Label>
          <div className="mt-2 grid grid-cols-8 gap-1.5 sm:grid-cols-10">
            {ICON_CHOICES.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setImageIcon(icon)}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg border transition-colors',
                  imageIcon === icon
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant hover:text-on-surface',
                )}
                title={icon}
              >
                <Icon name={icon} className="text-[20px]" />
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-3">
            <Switch
              checked={bestSeller}
              onChange={setBestSeller}
              label="Best seller"
              description="Tampil di filter populer"
            />
          </div>
          <div className="rounded-lg border border-outline-variant/25 bg-surface-container p-3">
            <Switch
              checked={available}
              onChange={setAvailable}
              label="Tersedia"
              description="Off menu = tidak bisa dipesan"
            />
          </div>
        </div>

        <FormError message={error} />
      </div>
    </Modal>
  );
}
