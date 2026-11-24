'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { placeCashierOrderAction } from '@/app/actions/orders';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Textarea } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/stat-card';
import { cn, formatRp } from '@/lib/format';
import type { MenuCategoryView, MenuItemView, TableView } from '@/lib/types';

type CartEntry = { qty: number; note: string };

const TILE_TONES = [
  'from-primary/25 to-primary/5 text-primary border-primary/20',
  'from-secondary/25 to-secondary/5 text-secondary border-secondary/20',
  'from-tertiary/25 to-tertiary/5 text-tertiary border-tertiary/20',
  'from-error/20 to-error/5 text-error border-error/20',
];

export function OrderDialog({
  open,
  table,
  categories,
  items,
  onClose,
  onDone,
}: {
  open: boolean;
  table: TableView | null;
  categories: MenuCategoryView[];
  items: MenuItemView[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [orderNote, setOrderNote] = useState('');
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setCategory('all');
      setCart({});
      setOrderNote('');
      setMobileTab('menu');
      setError(null);
      setLoading(false);
    }
  }, [open, table?.id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (category === 'best' && !item.bestSeller) return false;
      if (category !== 'all' && category !== 'best' && item.categoryId !== category) return false;
      if (!term) return true;
      return `${item.name} ${item.description}`.toLowerCase().includes(term);
    });
  }, [items, search, category]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, entry]) => {
          const item = items.find((menuItem) => menuItem.id === id);
          return item && entry.qty > 0 ? { item, ...entry } : null;
        })
        .filter((line): line is { item: MenuItemView; qty: number; note: string } => Boolean(line)),
    [cart, items],
  );
  const subtotal = cartLines.reduce((sum, line) => sum + line.item.price * line.qty, 0);
  const itemCount = cartLines.reduce((sum, line) => sum + line.qty, 0);

  function add(item: MenuItemView) {
    if (!item.available || item.soldOut) return;
    setCart((current) => {
      const entry = current[item.id];
      const max = item.stock ?? 99;
      const nextQty = Math.min((entry?.qty ?? 0) + 1, max, 50);
      return { ...current, [item.id]: { qty: nextQty, note: entry?.note ?? '' } };
    });
  }

  function remove(item: MenuItemView) {
    setCart((current) => {
      const entry = current[item.id];
      if (!entry) return current;
      const nextQty = entry.qty - 1;
      if (nextQty <= 0) {
        const next = { ...current };
        delete next[item.id];
        return next;
      }
      return { ...current, [item.id]: { ...entry, qty: nextQty } };
    });
  }

  function setNote(itemId: string, note: string) {
    setCart((current) => {
      const entry = current[itemId];
      if (!entry) return current;
      return { ...current, [itemId]: { ...entry, note } };
    });
  }

  async function submit() {
    if (!table || cartLines.length === 0) return;
    setLoading(true);
    setError(null);
    const result = await placeCashierOrderAction({
      tableId: table.id,
      items: cartLines.map((line) => ({
        menuItemId: line.item.id,
        qty: line.qty,
        note: line.note || undefined,
      })),
      note: orderNote || undefined,
    });
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    toast.success(`Order ${result.data?.orderNumber ?? ''} dikirim ke KDS`, {
      description: `${itemCount} item · ${formatRp(subtotal)} ditambahkan ke bill ${table.code}`,
    });
    setLoading(false);
    onClose();
    onDone?.();
    router.refresh();
  }

  return (
    <Modal
      open={open && Boolean(table)}
      onClose={onClose}
      title={table ? `Order F&B — Meja ${table.code}` : 'Order F&B'}
      subtitle="Order kasir langsung diterima KDS. Harga dan stok diambil server-side."
      icon="restaurant"
      size="full"
      bodyClassName="p-0"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Icon name="shopping_bag" className="text-[20px]" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-outline">
                {itemCount} item · subtotal
              </div>
              <div className="numeric text-numeric-md font-bold text-primary">
                {formatRp(subtotal)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading} className="hidden sm:flex">
              Batal
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1 sm:flex-none"
              onClick={submit}
              loading={loading}
              disabled={cartLines.length === 0}
            >
              <Icon name="send" className="text-[18px]" />
              Kirim ke dapur &amp; bill
            </Button>
          </div>
        </div>
      }
    >
      {table ? (
        <div className="flex h-[72dvh] min-h-[480px] flex-col">
          <div className="flex gap-1 border-b border-outline-variant/25 bg-surface-container-low/60 p-2 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileTab('menu')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-body-sm font-semibold transition-colors',
                mobileTab === 'menu'
                  ? 'bg-surface-container-high text-primary'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              <Icon name="restaurant_menu" className="text-[17px]" />
              Menu
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('cart')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-body-sm font-semibold transition-colors',
                mobileTab === 'cart'
                  ? 'bg-surface-container-high text-primary'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              <Icon name="shopping_bag" className="text-[17px]" />
              Keranjang
              <span className="numeric rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                {itemCount}
              </span>
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.35fr_0.85fr]">
          {/* Catalog */}
          <div
            className={cn(
              'min-h-0 flex-col border-b border-outline-variant/25 lg:flex lg:border-b-0 lg:border-r',
              mobileTab === 'menu' ? 'flex' : 'hidden',
            )}
          >
            <div className="flex flex-col gap-2 border-b border-outline-variant/20 bg-surface-container-low/60 p-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Icon
                    name="search"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Cari menu, bahan, atau minuman…"
                    className="h-10 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest pl-9 pr-3 text-body-md text-on-surface placeholder:text-outline/70 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <Badge tone="dark">{filtered.length} item</Badge>
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
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('best')}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 text-body-sm font-semibold transition-colors',
                    category === 'best'
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  ★ Best seller
                </button>
                {categories.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id)}
                    className={cn(
                      'shrink-0 rounded-full px-3 py-1.5 text-body-sm font-semibold transition-colors',
                      category === item.id
                        ? 'bg-secondary text-on-secondary'
                        : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface',
                    )}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filtered.length === 0 ? (
                <EmptyState
                  icon="search_off"
                  title="Menu tidak ditemukan"
                  description="Coba kata kunci atau kategori lain."
                />
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {filtered.map((item, index) => {
                    const entry = cart[item.id];
                    const disabled = !item.available || item.soldOut;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'flex gap-2.5 rounded-xl border border-outline-variant/25 bg-surface-container p-2.5 transition-colors',
                          disabled ? 'opacity-50' : 'hover:border-outline-variant/50 hover:bg-surface-container-high',
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br',
                            TILE_TONES[index % TILE_TONES.length],
                          )}
                        >
                          <Icon name={item.imageIcon} className="text-[26px]" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-1">
                              <h4 className="truncate text-body-sm font-bold text-on-surface">
                                {item.name}
                              </h4>
                              {item.bestSeller ? (
                                <span className="shrink-0 text-[9px] font-bold text-tertiary">★</span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-[10px] text-on-surface-variant">
                              {item.description}
                            </p>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <div className="flex flex-col">
                              <span className="numeric text-body-sm font-bold text-primary">
                                {formatRp(item.price)}
                              </span>
                              <span className="text-[9px] text-outline">
                                {item.stock === null
                                  ? 'Stok bebas'
                                  : item.stock <= 0
                                    ? 'Habis'
                                    : `Stok ${item.stock}`}
                              </span>
                            </div>
                            {disabled ? (
                              <span className="rounded bg-surface-container-highest px-2 py-1 text-[10px] font-semibold text-outline">
                                Sold out
                              </span>
                            ) : entry ? (
                              <div className="flex items-center gap-1 rounded-lg bg-surface-container-lowest p-0.5">
                                <button
                                  type="button"
                                  onClick={() => remove(item)}
                                  className="flex h-7 w-7 items-center justify-center rounded bg-surface-container text-on-surface transition-colors hover:text-error"
                                >
                                  <Icon name="remove" className="text-[15px]" />
                                </button>
                                <span className="numeric w-5 text-center text-body-sm font-bold text-on-surface">
                                  {entry.qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => add(item)}
                                  className="flex h-7 w-7 items-center justify-center rounded bg-surface-container text-on-surface transition-colors hover:text-primary"
                                >
                                  <Icon name="add" className="text-[15px]" />
                                </button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => add(item)}
                                className="px-2"
                              >
                                <Icon name="add" className="text-[15px]" />
                                Tambah
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Cart */}
          <div
            className={cn(
              'min-h-0 flex-col bg-surface-container-low/50 lg:flex',
              mobileTab === 'cart' ? 'flex' : 'hidden',
            )}
          >
            <div className="flex items-center justify-between border-b border-outline-variant/20 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Icon name="receipt_long" className="text-[18px] text-primary" />
                <span className="text-body-sm font-bold text-on-surface">
                  Keranjang · Meja {table.code}
                </span>
              </div>
              {cartLines.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setCart({})}
                  className="text-[10px] font-semibold uppercase tracking-wider text-error/80 hover:text-error"
                >
                  Kosongkan
                </button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {cartLines.length === 0 ? (
                <EmptyState
                  compact
                  icon="shopping_cart"
                  title="Keranjang kosong"
                  description="Tap item di katalog untuk menambah."
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {cartLines.map((line) => (
                    <div
                      key={line.item.id}
                      className="rounded-xl border border-outline-variant/25 bg-surface-container p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate text-body-sm font-bold text-on-surface">
                            {line.item.name}
                          </h4>
                          <span className="numeric text-[11px] text-primary">
                            {formatRp(line.item.price)} / pcs
                          </span>
                        </div>
                        <div className="flex items-center gap-1 rounded-lg bg-surface-container-lowest p-0.5">
                          <button
                            type="button"
                            onClick={() => remove(line.item)}
                            className="flex h-7 w-7 items-center justify-center rounded bg-surface-container text-on-surface hover:text-error"
                          >
                            <Icon name="remove" className="text-[15px]" />
                          </button>
                          <span className="numeric w-5 text-center text-body-sm font-bold text-on-surface">
                            {line.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => add(line.item)}
                            className="flex h-7 w-7 items-center justify-center rounded bg-surface-container text-on-surface hover:text-primary"
                          >
                            <Icon name="add" className="text-[15px]" />
                          </button>
                        </div>
                      </div>
                      <input
                        value={line.note}
                        onChange={(event) => setNote(line.item.id, event.target.value)}
                        placeholder="Catatan: less sugar, pedas sedang…"
                        className="mt-2 h-8 w-full rounded-md border border-outline-variant/35 bg-surface-container-lowest px-2 text-[11px] text-on-surface placeholder:text-outline/70 focus:border-primary/50 focus:outline-none"
                      />
                      <div className="mt-1 flex justify-end">
                        <span className="numeric text-[11px] font-semibold text-on-surface">
                          {formatRp(line.item.price * line.qty)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3">
                <Textarea
                  label="Catatan order"
                  hint="Opsional"
                  rows={2}
                  placeholder="Contoh: antar sekaligus setelah semua matang."
                  value={orderNote}
                  onChange={(event) => setOrderNote(event.target.value)}
                />
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-lg border border-secondary/20 bg-secondary/[0.06] p-2.5 text-[10px] text-on-surface-variant">
                <Icon name="bolt" className="mt-0.5 text-[16px] text-secondary" />
                Order langsung masuk KDS dan otomatis ditambahkan ke bill meja {table.code}.
              </div>

              <FormError message={error} />
            </div>

            <div className="border-t border-outline-variant/20 bg-surface-container p-3">
              <p className="text-[10px] text-outline">
                PB1 &amp; service dihitung di bill akhir.
              </p>
            </div>
          </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
