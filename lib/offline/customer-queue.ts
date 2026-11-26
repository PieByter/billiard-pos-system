'use client';

import type { QueuedOrderItem } from './order-queue';

export type QueuedCustomerOrder = {
  id: string;
  token: string;
  items: QueuedOrderItem[];
  note?: string | null;
  idempotencyKey: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
};

const DB_NAME = 'cuetap-customer-offline';
const STORE = 'orders';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Gagal membuka IndexedDB.'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB error.'));
  });
}

export async function enqueueCustomerOrder(input: {
  token: string;
  items: QueuedOrderItem[];
  note?: string | null;
  idempotencyKey: string;
}): Promise<QueuedCustomerOrder> {
  const db = await openDb();
  const order: QueuedCustomerOrder = {
    id: crypto.randomUUID(),
    token: input.token,
    items: input.items,
    note: input.note ?? null,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(order);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal menyimpan pesanan offline.'));
  });
  db.close();
  return order;
}

export async function listCustomerOrders(): Promise<QueuedCustomerOrder[]> {
  const db = await openDb();
  const rows = await requestToPromise<QueuedCustomerOrder[]>(
    db.transaction(STORE, 'readonly').objectStore(STORE).getAll(),
  );
  db.close();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeCustomerOrder(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal menghapus antrean.'));
  });
  db.close();
}

export async function updateCustomerOrder(order: QueuedCustomerOrder): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(order);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal update antrean.'));
  });
  db.close();
}
