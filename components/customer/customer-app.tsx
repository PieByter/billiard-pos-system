'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { placeCustomerOrderAction } from '@/app/actions/orders';
import { Icon } from '@/components/ui/icon';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/stat-card';
import { cn, formatClock, formatRp } from '@/lib/format';
import { DEPOSIT_LABEL, VENUE_TAGLINE } from '@/lib/constants';
import {
  enqueueCustomerOrder,
  listCustomerOrders,
  removeCustomerOrder,
  updateCustomerOrder,
} from '@/lib/offline/customer-queue';
import type { CustomerData, CustomerOrderView, MenuItemView } from '@/lib/types';
import { CartSheet, ServiceSheet, TrackerSheet, type CartMap } from './customer-sheets';

const TILE_TONES = [
  'from-primary/25 via-primary/10 to-transparent border-primary/25 text-primary',
  'from-secondary/25 via-secondary/10 to-transparent border-secondary/25 text-secondary',
  'from-tertiary/25 via-tertiary/10 to-transparent border-tertiary/25 text-tertiary',
  'from-error/20 via-error/10 to-transparent border-error/25 text-error',
];

export function CustomerApp({ data }: { data: CustomerData }) {
  const [cart, setCart] = useState<CartMap>({});
  const [restored, setRestored] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [cartOpen, setCartOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [orders, setOrders] = useState<CustomerOrderView[]>(data.orders);
  const [bill, setBill] = useState<CustomerData['bill']>(data.bill);
  const [orderNote, setOrderNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [hasServiceRequest, setHasServiceRequest] = useState(data.openServiceRequest);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const idempotencyRef = useRef<string | null>(null);
  const storageKey = `cuetap:cart:${data.table.qrToken}`;
  const favoritesKey = 'cuetap:favorites';

  const menuById = useMemo(
    () => new Map(data.items.map((item) => [item.id, item])),
    [data.items],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as CartMap;
        const valid: CartMap = {};
        for (const [id, entry] of Object.entries(parsed)) {
          if (menuById.has(id) && entry.qty > 0) {
            valid[id] = { qty: Math.min(entry.qty, 50), note: entry.note ?? '' };
          }
        }
        setCart(valid);
      }
    } catch {
      // ignore corrupt storage
    }
    setRestored(true);
  }, [storageKey, menuById]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      // storage full / private mode
    }
  }, [cart, restored, storageKey]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(favoritesKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setFavorites(parsed.filter((value): value is string => typeof value === 'string'));
        }
      }
    } catch {
      // ignore corrupt storage
    }
    setFavoritesReady(true);
  }, [favoritesKey]);

  useEffect(() => {
    if (!favoritesReady) return;
    try {
      window.localStorage.setItem(favoritesKey, JSON.stringify(favorites));
    } catch {
      // storage full / private mode
    }
  }, [favorites, favoritesKey, favoritesReady]);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const refreshOrders = useCallback(async () => {
    try {
      const response = await fetch(`/api/customer/orders?token=${encodeURIComponent(data.table.qrToken)}`, {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const json = (await response.json()) as {
        ok: boolean;
        orders: CustomerOrderView[];
        bill: CustomerData['bill'];
      };
      if (json.ok) {
        setOrders(json.orders);
        setBill(json.bill);
      }
    } catch {
      // offline — keep cached state
    }
  }, [data.table.qrToken]);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === 'visible') void refreshOrders();
    };
    const timer = window.setInterval(poll, 8000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [refreshOrders]);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (typeof navigator === 'undefined' || !navigator.onLine) return;
      const queued = await listCustomerOrders();
      if (queued.length === 0) return;
      let synced = 0;
      for (const order of queued) {
        try {
          const result = await placeCustomerOrderAction({
            token: order.token,
            idempotencyKey: order.idempotencyKey,
            items: order.items,
            note: order.note,
          });
          if (result.ok) {
            await removeCustomerOrder(order.id);
            synced += 1;
          } else {
            const next = { ...order, attempts: order.attempts + 1, lastError: result.error };
            if (next.attempts >= 3) {
              await removeCustomerOrder(order.id);
            } else {
              await updateCustomerOrder(next);
            }
          }
        } catch {
          break;
        }
      }
      if (!cancelled && synced > 0) {
        await refreshOrders();
        toast.success(`${synced} pesanan offline terkirim`, {
          description: 'Kasir akan mengonfirmasi pesananmu.',
        });
      }
    };
    void sync();
    window.addEventListener('online', sync);
    return () => {
      cancelled = true;
      window.removeEventListener('online', sync);
    };
  }, [refreshOrders]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, entry]) => {
          const item = menuById.get(id);
          return item && entry.qty > 0 ? { item, qty: entry.qty, note: entry.note } : null;
        })
        .filter((line): line is { item: MenuItemView; qty: number; note: string } => Boolean(line)),
    [cart, menuById],
  );
  const cartCount = cartLines.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = cartLines.reduce((sum, line) => sum + line.item.price * line.qty, 0);
  const activeOrders = orders.filter((order) =>
    ['pending', 'accepted', 'preparing', 'ready'].includes(order.status),
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.items.filter((item) => {
      if (category === 'best' && !item.bestSeller) return false;
      if (category === 'favorites' && !favoriteSet.has(item.id)) return false;
      if (
        category !== 'all' &&
        category !== 'best' &&
        category !== 'favorites' &&
        item.categoryId !== category
      ) {
        return false;
      }
      if (!term) return true;
      return `${item.name} ${item.description}`.toLowerCase().includes(term);
    });
  }, [data.items, category, search, favoriteSet]);

  const grouped = useMemo(() => {
    const result: Array<{
      category: CustomerData['categories'][number];
      items: MenuItemView[];
    }> = [];
    for (const entry of data.categories) {
      const itemsInCategory = filtered.filter(
        (item) => item.categoryId === entry.id && !item.bestSeller,
      );
      if (itemsInCategory.length > 0) result.push({ category: entry, items: itemsInCategory });
    }
    return result;
  }, [data.categories, filtered]);

  const bestVisible = category === 'all' && !search
    ? filtered.filter((item) => item.bestSeller)
    : [];

  function toggleFavorite(itemId: string) {
    setFavorites((current) =>
      current.includes(itemId)
        ? current.filter((value) => value !== itemId)
        : [...current, itemId],
    );
  }

  function reorder(order: CustomerOrderView) {
    const next: CartMap = {};
    for (const line of order.items) {
      const menuItem = menuById.get(line.menuItemId);
      if (!menuItem || !menuItem.available || menuItem.soldOut) continue;
      next[menuItem.id] = {
        qty: Math.min(line.qty, menuItem.stock ?? 50, 50),
        note: line.note ?? '',
      };
    }
    if (Object.keys(next).length === 0) {
      toast.info('Menu dari pesanan ini sudah tidak tersedia.');
      return;
    }
    setCart(next);
    setTrackerOpen(false);
    setCartOpen(true);
    toast.success('Pesanan dimasukkan lagi ke keranjang', {
      description: 'Periksa jumlah lalu kirim ulang.',
    });
  }

  function addItem(item: MenuItemView) {
    if (!data.table.allowSelfOrder || !item.available || item.soldOut) return;
    setCart((current) => {
      const entry = current[item.id];
      const max = Math.min(item.stock ?? 50, 50);
      return {
        ...current,
        [item.id]: { qty: Math.min((entry?.qty ?? 0) + 1, max), note: entry?.note ?? '' },
      };
    });
  }

  function setQty(itemId: string, qty: number) {
    const item = menuById.get(itemId);
    if (!item) return;
    if (qty <= 0) {
      setCart((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
      return;
    }
    setCart((current) => ({
      ...current,
      [itemId]: {
        qty: Math.min(qty, item.stock ?? 50, 50),
        note: current[itemId]?.note ?? '',
      },
    }));
  }

  function setNote(itemId: string, note: string) {
    setCart((current) => ({
      ...current,
      [itemId]: { qty: current[itemId]?.qty ?? 1, note: note.slice(0, 240) },
    }));
  }

  async function submitOrder() {
    if (!data.table.allowSelfOrder || cartLines.length === 0) return;
    setSubmitting(true);
    setCheckoutError(null);
    if (!idempotencyRef.current) idempotencyRef.current = crypto.randomUUID();
    const payload = {
      token: data.table.qrToken,
      idempotencyKey: idempotencyRef.current,
      items: cartLines.map((line) => ({
        menuItemId: line.item.id,
        qty: line.qty,
        note: line.note || undefined,
      })),
      note: orderNote || null,
    };
    const saveOffline = async () => {
      await enqueueCustomerOrder({
        token: payload.token,
        idempotencyKey: payload.idempotencyKey,
        items: payload.items,
        note: payload.note,
      });
      idempotencyRef.current = null;
      setSubmitting(false);
      setCart({});
      setOrderNote('');
      setCartOpen(false);
      toast.success('Pesanan disimpan offline', {
        description: 'Akan dikirim otomatis saat koneksi kembali.',
      });
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        await saveOffline();
      } catch (error) {
        setCheckoutError(
          error instanceof Error ? error.message : 'Gagal menyimpan pesanan offline.',
        );
        setSubmitting(false);
      }
      return;
    }

    try {
      const result = await placeCustomerOrderAction(payload);
      if (!result.ok) {
        setCheckoutError(result.error);
        setSubmitting(false);
        return;
      }
      idempotencyRef.current = null;
      setSubmitting(false);
      setCart({});
      setOrderNote('');
      setCartOpen(false);
      // Ambil status terbaru dulu agar tracker langsung menampilkan order yang baru dibuat,
      // bukan order lama yang masih tersimpan di state.
      await refreshOrders();
      setTrackerOpen(true);
      toast.success('Pesanan terkirim!', {
        description: 'Kasir akan mengonfirmasi sebentar lagi. Status bisa dilihat live.',
      });
    } catch {
      try {
        await saveOffline();
      } catch (error) {
        setCheckoutError(
          error instanceof Error ? error.message : 'Koneksi terputus dan pesanan gagal disimpan.',
        );
        setSubmitting(false);
      }
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div className="pointer-events-none absolute -left-40 top-10 h-[420px] w-[420px] rounded-full bg-primary/[0.07] blur-[100px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[420px] w-[420px] rounded-full bg-secondary/[0.06] blur-[100px]" />

      <div className="relative mx-auto grid w-full max-w-[1280px] grid-cols-1 items-start justify-center gap-4 px-0 py-0 sm:px-4 sm:py-6 lg:grid-cols-[250px_minmax(0,460px)_250px] xl:grid-cols-[280px_minmax(0,480px)_280px] lg:gap-5">
        {/* Desktop left context */}
        <aside className="sticky top-6 hidden flex-col gap-3 lg:flex">
          <div className="panel rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-outline">
                Guest portal
              </span>
              <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Live sync
              </span>
            </div>
            <h2 className="mt-1.5 text-headline-md font-extrabold text-on-surface">
              Pemesanan mandiri
            </h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Scan QR meja, pilih menu, lalu kirim. Pesanan terikat ke bill meja dan dikonfirmasi
              kasir.
            </p>

            <div className="mt-3 flex flex-col gap-1.5 rounded-xl border border-outline-variant/25 bg-surface-container p-3 text-body-sm">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Meja</span>
                <span className="numeric text-body-lg font-bold text-primary">{data.table.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Zona</span>
                <span className="text-on-surface">{data.table.zone || 'Lounge'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Kapasitas</span>
                <span className="text-on-surface">{data.table.capacity} pax</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Bill dibuka</span>
                <span className="text-on-surface">
                  {bill ? formatClock(bill.openedAt) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Token</span>
                <span className="font-mono text-[10px] text-secondary">
                  {data.table.qrToken.slice(0, 6)}…{data.table.qrToken.slice(-4)}
                </span>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.06] p-2.5">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-outline">Status order</span>
                <p className="text-body-sm font-bold text-on-surface">
                  {data.table.allowSelfOrder ? 'Self-order aktif' : 'Dilayani kasir'}
                </p>
              </div>
              <Icon
                name={data.table.allowSelfOrder ? 'verified_user' : 'support_agent'}
                className="text-[24px] text-primary"
              />
            </div>
          </div>

          <div className="panel rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-tertiary">
              <Icon name="bolt" className="text-[17px]" />
              <span className="text-[9px] font-bold uppercase tracking-[0.12em]">
                Double-order protection
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
              Idempotency key mencegah order ganda saat jaringan drop atau double-tap.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              disabled={!data.table.allowSelfOrder}
              className="flex items-center justify-between rounded-xl border border-outline-variant/25 bg-surface-container-low p-3 text-left transition-colors hover:bg-surface-container disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-body-sm font-semibold text-on-surface">
                <Icon name="shopping_bag" className="text-[18px] text-primary" />
                Keranjang tamu
              </span>
              <span className="numeric text-body-sm font-bold text-primary">{cartCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setTrackerOpen(true)}
              className="flex items-center justify-between rounded-xl border border-outline-variant/25 bg-surface-container-low p-3 text-left transition-colors hover:bg-surface-container"
            >
              <span className="flex items-center gap-2 text-body-sm font-semibold text-on-surface">
                <Icon name="local_shipping" className="text-[18px] text-secondary" />
                Live order tracker
              </span>
              <span className="text-[10px] text-outline">{activeOrders.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setServiceOpen(true)}
              className="flex items-center justify-between rounded-xl border border-tertiary/25 bg-tertiary/[0.05] p-3 text-left transition-colors hover:bg-tertiary/10"
            >
              <span className="flex items-center gap-2 text-body-sm font-semibold text-tertiary">
                <Icon name="notifications_active" className="text-[18px]" />
                Panggil waiter
              </span>
              {hasServiceRequest ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tertiary" />
              ) : null}
            </button>
          </div>

          <p className="px-1 text-[10px] leading-4 text-on-surface-variant/50">
            {DEPOSIT_LABEL}
          </p>
        </aside>

        {/* Customer app */}
        <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden bg-surface-container-lowest shadow-[0_30px_100px_-30px_rgba(0,0,0,0.9)] sm:min-h-0 sm:rounded-2xl sm:border sm:border-outline-variant/30 lg:h-[calc(100dvh-3rem)] lg:max-w-none lg:overflow-hidden">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-44 w-80 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />

          <header className="sticky top-0 z-30 border-b border-outline-variant/25 bg-surface-container-low/95 px-3 pb-2.5 pt-3 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Logo size={34} />
                <div className="min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-outline">
                    {data.venueName} Lounge
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-headline-md font-extrabold leading-none text-on-surface">
                      Meja {data.table.code}
                    </span>
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                      {data.table.zone || 'Lounge'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTrackerOpen(true)}
                  className="flex items-center gap-1 rounded-full border border-secondary/25 bg-secondary/10 px-2.5 py-1.5 text-secondary transition-colors hover:bg-secondary/20"
                >
                  <Icon name="sync" className="text-[15px]" />
                  <span className="numeric text-[10px] font-semibold">
                    {activeOrders.length || orders.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setServiceOpen(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant/30 bg-surface-container text-on-surface-variant transition-colors hover:text-tertiary"
                  aria-label="Panggil waiter"
                >
                  <Icon name="notifications_active" className="text-[17px]" />
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between rounded-lg border border-outline-variant/20 bg-surface-container px-2.5 py-1.5 text-[10px] text-on-surface-variant">
              <span className="flex items-center gap-1.5">
                <Icon name="qr_code_2" className="text-[14px] text-primary" />
                Token QR terverifikasi
                <span className="font-mono text-on-surface-variant/70">
                  {data.table.qrToken.slice(0, 4)}…{data.table.qrToken.slice(-3)}
                </span>
              </span>
              <span className="flex items-center gap-1 text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Live
              </span>
            </div>

            <div className="relative mt-2">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari makanan atau minuman…"
                className="h-10 w-full rounded-xl border border-outline-variant/40 bg-surface-container-highest pl-9 pr-3 text-body-sm text-on-surface placeholder:text-outline/70 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            <div className="-mx-3 mt-2 flex items-center gap-1.5 overflow-x-auto px-3 pb-0.5 no-scrollbar">
              <button
                type="button"
                onClick={() => setCategory('all')}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors',
                  category === 'all'
                    ? 'bg-primary text-on-primary shadow-[0_0_14px_rgba(78,222,163,0.25)]'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface',
                )}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setCategory('best')}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors',
                  category === 'best'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface',
                )}
              >
                🔥 Best seller
              </button>
              <button
                type="button"
                onClick={() => setCategory('favorites')}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors',
                  category === 'favorites'
                    ? 'bg-tertiary text-on-tertiary'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface',
                )}
              >
                ★ Favorit {favorites.length > 0 ? `(${favorites.length})` : ''}
              </button>
              {data.categories.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setCategory(entry.id)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors',
                    category === entry.id
                      ? 'bg-secondary text-on-secondary'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          </header>

          <div className="relative flex flex-1 flex-col gap-4 px-3 py-3 pb-28 lg:min-h-0 lg:overflow-y-auto lg:pb-4">
            {!data.table.allowSelfOrder ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-tertiary/30 bg-tertiary/[0.07] p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tertiary/15 text-tertiary">
                  <Icon name="support_agent" className="text-[20px]" />
                </span>
                <div>
                  <p className="text-body-sm font-bold text-on-surface">
                    Meja ini dilayani kasir
                  </p>
                  <p className="mt-0.5 text-[11px] text-on-surface-variant">
                    Kamu tetap bisa melihat menu. Untuk memesan, panggil waiter atau hubungi kasir.
                  </p>
                  <button
                    type="button"
                    onClick={() => setServiceOpen(true)}
                    className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-tertiary"
                  >
                    Panggil waiter →
                  </button>
                </div>
              </div>
            ) : null}

            {!search && category === 'all' && bestVisible.length > 0 ? (
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-1 rounded-full bg-primary" />
                    <h2 className="text-headline-md font-extrabold tracking-tight text-on-surface">
                      Pilihan terpopuler
                    </h2>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-outline">
                    {bestVisible.length} rekomendasi
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {bestVisible.map((item, index) => (
                    <CustomerMenuCard
                      key={item.id}
                      item={item}
                      index={index}
                      qty={cart[item.id]?.qty ?? 0}
                      allowSelfOrder={data.table.allowSelfOrder}
                      favorite={favoriteSet.has(item.id)}
                      onFavorite={() => toggleFavorite(item.id)}
                      onAdd={() => addItem(item)}
                      onRemove={() => setQty(item.id, (cart[item.id]?.qty ?? 0) - 1)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {search || category !== 'all' ? (
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-headline-md font-extrabold tracking-tight text-on-surface">
                    {search
                      ? 'Hasil pencarian'
                      : category === 'best'
                        ? 'Best seller'
                        : category === 'favorites'
                          ? 'Favoritmu'
                          : data.categories.find((entry) => entry.id === category)?.name}
                  </h2>
                  <span className="text-[9px] uppercase tracking-wider text-outline">
                    {filtered.length} item
                  </span>
                </div>
                {category === 'best' ? (
                  <div className="flex flex-col gap-2.5">
                    {filtered.map((item, index) => (
                      <CustomerMenuCard
                        key={item.id}
                        item={item}
                        index={index}
                        qty={cart[item.id]?.qty ?? 0}
                        allowSelfOrder={data.table.allowSelfOrder}
                        favorite={favoriteSet.has(item.id)}
                        onFavorite={() => toggleFavorite(item.id)}
                        onAdd={() => addItem(item)}
                        onRemove={() => setQty(item.id, (cart[item.id]?.qty ?? 0) - 1)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {filtered.map((item, index) => (
                      <CustomerMenuCard
                        key={item.id}
                        item={item}
                        index={index}
                        qty={cart[item.id]?.qty ?? 0}
                        allowSelfOrder={data.table.allowSelfOrder}
                        favorite={favoriteSet.has(item.id)}
                        onFavorite={() => toggleFavorite(item.id)}
                        onAdd={() => addItem(item)}
                        onRemove={() => setQty(item.id, (cart[item.id]?.qty ?? 0) - 1)}
                      />
                    ))}
                  </div>
                )}
                {filtered.length === 0 ? (
                  <EmptyState
                    icon="search_off"
                    title="Menu tidak ditemukan"
                    description="Coba kata kunci atau kategori lain."
                  />
                ) : null}
              </section>
            ) : (
              grouped.map((group) => (
                <section key={group.category.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-container-high text-secondary">
                        <Icon name={group.category.icon} className="text-[16px]" />
                      </span>
                      <h2 className="text-body-lg font-extrabold tracking-tight text-on-surface">
                        {group.category.name}
                      </h2>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider text-outline">
                      {group.items.length} menu
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {group.items.map((item, index) => (
                      <CustomerMenuCard
                        key={item.id}
                        item={item}
                        index={index}
                        qty={cart[item.id]?.qty ?? 0}
                        allowSelfOrder={data.table.allowSelfOrder}
                        favorite={favoriteSet.has(item.id)}
                        onFavorite={() => toggleFavorite(item.id)}
                        onAdd={() => addItem(item)}
                        onRemove={() => setQty(item.id, (cart[item.id]?.qty ?? 0) - 1)}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}

            {data.items.length === 0 ? (
              <EmptyState icon="restaurant_menu" title="Menu belum tersedia" />
            ) : null}

            <div className="mt-2 flex flex-col items-center gap-1 pb-2 text-center text-[9px] uppercase tracking-[0.14em] text-on-surface-variant/40">
              <span>{VENUE_TAGLINE}</span>
              <span>PWA · {data.venueName} · Pembayaran di kasir</span>
            </div>
          </div>

          {data.table.allowSelfOrder ? (
            <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-outline-variant/25 bg-surface-container-low/95 px-3 py-2.5 backdrop-blur-xl safe-bottom lg:static lg:left-auto lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0">
              {cartCount > 0 ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-on-primary-container shadow-[0_0_18px_rgba(16,185,129,0.3)]">
                        <Icon name="shopping_bag" className="text-[21px]" />
                      </span>
                      <span className="numeric absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-tertiary px-1 text-[9px] font-bold text-on-tertiary">
                        {cartCount}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-outline">
                        Total pesanan
                      </span>
                      <span className="numeric block text-numeric-md font-bold text-primary">
                        {formatRp(subtotal)}
                      </span>
                    </div>
                  </div>
                  <Button variant="primary" size="md" onClick={() => setCartOpen(true)}>
                    Lihat pesanan
                    <Icon name="keyboard_arrow_up" className="text-[17px]" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                    <Icon name="restaurant_menu" className="text-[18px] text-primary" />
                    Pilih menu favoritmu untuk mulai order.
                  </div>
                  <button
                    type="button"
                    onClick={() => setTrackerOpen(true)}
                    className="text-[10px] font-bold uppercase tracking-wider text-secondary"
                  >
                    Status
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-outline-variant/25 bg-surface-container-low/95 px-3 py-2.5 backdrop-blur-xl safe-bottom lg:static lg:left-auto lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0">
              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={() => setServiceOpen(true)}
              >
                <Icon name="notifications_active" className="text-[18px]" />
                Panggil waiter untuk memesan
              </Button>
            </div>
          )}
        </main>

        {/* Desktop right bill summary */}
        <aside className="sticky top-6 hidden flex-col gap-3 xl:flex">
          <div className="panel rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-outline">
                Ringkasan tagihan
              </span>
              <Icon name="account_balance_wallet" className="text-[20px] text-primary" />
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-wider text-on-surface-variant">
              Total berjalan meja {data.table.code}
            </p>
            <p className="numeric text-numeric-lg font-extrabold text-on-surface">
              {bill ? formatRp(bill.total) : 'Rp 0'}
            </p>
            <div className="mt-2 border-t border-outline-variant/20 pt-2 text-[11px]">
              <div className="flex justify-between py-0.5 text-on-surface-variant">
                <span>Subtotal F&amp;B</span>
                <span className="numeric text-on-surface">
                  {bill ? formatRp(bill.subtotal) : 'Rp 0'}
                </span>
              </div>
              <div className="flex justify-between py-0.5 text-on-surface-variant">
                <span>Order aktif</span>
                <span className="numeric text-secondary">{activeOrders.length}</span>
              </div>
              <div className="flex justify-between py-0.5 text-on-surface-variant">
                <span>Bill number</span>
                <span className="numeric text-[10px] text-on-surface">
                  {bill?.number ?? '—'}
                </span>
              </div>
            </div>
            <div className="mt-2 rounded-lg border border-tertiary/20 bg-tertiary/[0.06] px-2.5 py-2 text-[10px] text-on-surface-variant">
              <span className="flex items-center gap-1 font-semibold text-tertiary">
                <Icon name="timer" className="text-[14px]" />
                Pembayaran di kasir
              </span>
              <p className="mt-0.5">Minta bill atau bayar saat checkout di meja kasir.</p>
            </div>
          </div>

          <div className="panel rounded-2xl p-4">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-outline">
              Lounge perks
            </span>
            <div className="mt-2 flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                  <Icon name="wifi" className="text-[18px]" />
                </span>
                <div>
                  <p className="text-body-sm font-semibold text-on-surface">Wi-Fi lounge gratis</p>
                  <p className="font-mono text-[10px] text-on-surface-variant">
                    CueTap-Guest / 8ballbreak
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name="sports" className="text-[18px]" />
                </span>
                <div>
                  <p className="text-body-sm font-semibold text-on-surface">House cues &amp; chalk</p>
                  <p className="text-[10px] text-on-surface-variant">
                    Tersedia gratis di rack samping meja.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary/10 text-tertiary">
                  <Icon name="support_agent" className="text-[18px]" />
                </span>
                <div>
                  <p className="text-body-sm font-semibold text-on-surface">Butuh bantuan?</p>
                  <p className="text-[10px] text-on-surface-variant">
                    Tap panggil waiter, kami datang ke meja.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setServiceOpen(true)}
            className="rounded-xl border border-tertiary/25 bg-tertiary/[0.06] p-3 text-left text-body-sm font-semibold text-tertiary transition-colors hover:bg-tertiary/10"
          >
            <span className="flex items-center gap-2">
              <Icon name="notifications_active" className="text-[18px]" />
              Panggil waiter / minta bill
            </span>
          </button>
        </aside>
      </div>

      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        tableCode={data.table.code}
        lines={cartLines}
        onQty={setQty}
        onNote={setNote}
        orderNote={orderNote}
        setOrderNote={setOrderNote}
        subtotal={subtotal}
        submitting={submitting}
        error={checkoutError}
        onSubmit={submitOrder}
      />
      <TrackerSheet
        open={trackerOpen}
        onClose={() => setTrackerOpen(false)}
        orders={orders}
        bill={bill}
        hasOpenServiceRequest={hasServiceRequest}
        onReorder={reorder}
        onCallWaiter={() => {
          setTrackerOpen(false);
          setServiceOpen(true);
        }}
      />
      <ServiceSheet
        open={serviceOpen}
        onClose={() => setServiceOpen(false)}
        token={data.table.qrToken}
        hasOpenRequest={hasServiceRequest}
        onSuccess={() => setHasServiceRequest(true)}
      />
    </div>
  );
}

function CustomerMenuCard({
  item,
  index,
  qty,
  allowSelfOrder,
  favorite,
  onFavorite,
  onAdd,
  onRemove,
}: {
  item: MenuItemView;
  index: number;
  qty: number;
  allowSelfOrder: boolean;
  favorite: boolean;
  onFavorite: () => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const disabled = !item.available || item.soldOut;

  return (
    <article
      className={cn(
        'relative flex gap-2.5 rounded-xl border border-outline-variant/20 bg-surface-container-low p-2.5 shadow-[0_12px_30px_-24px_rgba(0,0,0,0.9)] transition-colors',
        disabled ? 'opacity-55' : 'hover:border-outline-variant/40 hover:bg-surface-container',
      )}
    >
      <button
        type="button"
        onClick={onFavorite}
        aria-label={favorite ? 'Hapus dari favorit' : 'Tambah ke favorit'}
        className={cn(
          'absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur transition-colors',
          favorite
            ? 'border-tertiary/40 bg-tertiary/20 text-tertiary'
            : 'border-outline-variant/30 bg-background/50 text-outline hover:text-tertiary',
        )}
      >
        <Icon name={favorite ? 'star' : 'star_border'} className="text-[16px]" />
      </button>
      <div
        className={cn(
          'relative flex h-[86px] w-[86px] shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-gradient-to-br',
          TILE_TONES[index % TILE_TONES.length],
          disabled && 'grayscale',
        )}
      >
        <div className="absolute inset-0 grid-lines opacity-30" />
        <Icon name={item.imageIcon} className="relative text-[38px]" />
        {item.bestSeller ? (
          <span className="absolute left-1 top-1 rounded bg-background/80 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-tertiary backdrop-blur">
            Best
          </span>
        ) : null}
        {disabled ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <span className="rounded bg-error-container px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-on-error-container">
              Habis
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <h3 className="truncate pr-4 text-body-md font-bold text-on-surface">{item.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">
            {item.description}
          </p>
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <div className="flex flex-col">
            <span className="numeric text-body-md font-bold text-primary">{formatRp(item.price)}</span>
            <span className="text-[9px] text-outline">
              {item.stock === null
                ? 'Tersedia'
                : item.stock <= 0
                  ? 'Stok habis'
                  : item.stock <= 5
                    ? `Sisa ${item.stock}`
                    : `Stok ${item.stock}`}
            </span>
          </div>
          {disabled || !allowSelfOrder ? (
            <span className="rounded-lg bg-surface-container-highest px-2.5 py-1.5 text-[10px] font-semibold text-outline">
              {disabled ? 'Sold out' : 'Via kasir'}
            </span>
          ) : qty > 0 ? (
            <div className="flex items-center gap-1 rounded-lg bg-surface-container-lowest p-0.5">
              <button
                type="button"
                onClick={onRemove}
                className="flex h-7 w-7 items-center justify-center rounded bg-surface-container text-on-surface transition-colors hover:text-error"
              >
                <Icon name="remove" className="text-[15px]" />
              </button>
              <span className="numeric w-5 text-center text-body-sm font-bold text-on-surface">
                {qty}
              </span>
              <button
                type="button"
                onClick={onAdd}
                className="flex h-7 w-7 items-center justify-center rounded bg-surface-container text-on-surface transition-colors hover:text-primary"
              >
                <Icon name="add" className="text-[15px]" />
              </button>
            </div>
          ) : (
            <Button variant="primary" size="sm" onClick={onAdd} className="px-2.5">
              <Icon name="add" className="text-[15px]" />
              Tambah
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
