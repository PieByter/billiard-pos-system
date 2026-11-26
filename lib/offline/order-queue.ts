'use client';

export type QueuedOrderItem = {
  menuItemId: string;
  qty: number;
  note?: string;
};

export type QueuedOrder = {
  id: string;
  tableId: string;
  tableCode: string;
  items: QueuedOrderItem[];
  note?: string | null;
  idempotencyKey: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
};

const DB_NAME = 'cuetap-offline';
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

export async function enqueueOfflineOrder(input: {
  tableId: string;
  tableCode: string;
  items: QueuedOrderItem[];
  note?: string | null;
  idempotencyKey: string;
}): Promise<QueuedOrder> {
  const db = await openDb();
  const order: QueuedOrder = {
    id: crypto.randomUUID(),
    tableId: input.tableId,
    tableCode: input.tableCode,
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
    tx.onerror = () => reject(tx.error ?? new Error('Gagal menyimpan order offline.'));
  });
  db.close();
  return order;
}

export async function listOfflineOrders(): Promise<QueuedOrder[]> {
  const db = await openDb();
  const rows = await requestToPromise<QueuedOrder[]>(
    db.transaction(STORE, 'readonly').objectStore(STORE).getAll(),
  );
  db.close();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeOfflineOrder(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal menghapus antrean.'));
  });
  db.close();
}

export async function updateOfflineOrder(order: QueuedOrder): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(order);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Gagal update antrean.'));
  });
  db.close();
}

export async function countOfflineOrders(): Promise<number> {
  const db = await openDb();
  const count = await requestToPromise<number>(
    db.transaction(STORE, 'readonly').objectStore(STORE).count(),
  );
  db.close();
  return count;
}
