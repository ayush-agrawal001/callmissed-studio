// Minimal IndexedDB store for generated images (data URLs are too large for
// localStorage). Every call degrades to a no-op if IndexedDB is unavailable.

export type StoredImage = {
  id: string;
  image: string; // data URL
  prompt: string;
  negativePrompt?: string;
  model: string;
  size: string;
  seed?: number;
  createdAt: number;
};

const DB = "cm-studio";
const STORE = "images";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listImages(): Promise<StoredImage[]> {
  try {
    const all = await tx<StoredImage[]>("readonly", (s) => s.getAll());
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function putImage(img: StoredImage) {
  try {
    await tx("readwrite", (s) => s.put(img));
  } catch {}
}

export async function deleteImage(id: string) {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {}
}
