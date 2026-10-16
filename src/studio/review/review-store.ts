import type { ReviewRow } from "@/src/chess/review-engine";

// SIG-965: persistent store for finished Game Reviews. Plain JSON records only
// (ReviewRow core arrays — no Path objects). Every public method is
// failure-safe: IndexedDB may be unavailable (SSR, private mode, quota, blocked
// open) and the caller must never see a rejection — the in-memory hot layer in
// ./review-cache.ts keeps working on its own.

export const REVIEW_STORE_DB = "chess-studio";
export const REVIEW_STORE_NAME = "reviews";
export const MAX_PERSISTED_REVIEWS = 50;
export const MAX_PERSISTED_BYTES = 5_000_000;

export type PersistedReviewRecord = {
  /** Persistent (SHA-256) key — the IndexedDB primary key. */
  key: string;
  /** Sync hot-layer key (see review-cache.ts) so hydration can repopulate the Map. */
  cacheKey: string;
  rows: ReviewRow[];
  preset: string;
  engineBuild: string;
  moves: number;
  bytes: number;
  lastUsedAt: number;
};

export type ReviewStoreMeta = {
  preset: string;
  engineBuild: string;
  moves: number;
  /** Sync hot-layer key so hydration can repopulate the Map without re-deriving. */
  cacheKey: string;
};

/** Minimal async key-value backend so tests can inject an in-memory map. */
export interface StoreBackend {
  get(key: string): Promise<PersistedReviewRecord | null>;
  put(record: PersistedReviewRecord): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  entries(): Promise<PersistedReviewRecord[]>;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = indexedDB.open(REVIEW_STORE_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(REVIEW_STORE_NAME)) {
          db.createObjectStore(REVIEW_STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
      request.onblocked = () => reject(new Error("IndexedDB open blocked"));
    } catch (error) {
      reject(error);
    }
  });
}

function withStore<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return requestToPromise(run(db.transaction(REVIEW_STORE_NAME, mode).objectStore(REVIEW_STORE_NAME)));
}

/**
 * Raw IndexedDB backend. Created eagerly but opens the database lazily on
 * first use; every operation degrades to a safe default when IndexedDB is
 * absent or any step throws.
 */
export function createIndexedDbBackend(): StoreBackend {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB unavailable"));
    }
    if (!dbPromise) {
      dbPromise = openDatabase();
      // A failed open must not poison later attempts (e.g. transient block).
      dbPromise.catch(() => {
        dbPromise = null;
      });
    }
    return dbPromise;
  };
  return {
    async get(key) {
      try {
        return (await withStore(await db(), "readonly", (store) => store.get(key))) ?? null;
      } catch {
        return null;
      }
    },
    async put(record) {
      try {
        await withStore(await db(), "readwrite", (store) => store.put(record));
      } catch {
        // Silent: persistence is best-effort, the hot layer still holds the rows.
      }
    },
    async delete(key) {
      try {
        await withStore(await db(), "readwrite", (store) => store.delete(key));
      } catch {
        // Silent (see put).
      }
    },
    async clear() {
      try {
        await withStore(await db(), "readwrite", (store) => store.clear());
      } catch {
        // Silent (see put).
      }
    },
    async entries() {
      try {
        const all = await withStore(await db(), "readonly", (store) => store.getAll());
        return Array.isArray(all) ? (all as PersistedReviewRecord[]) : [];
      } catch {
        return [];
      }
    },
  };
}

function recordBytes(rows: ReviewRow[]): number {
  try {
    return new TextEncoder().encode(JSON.stringify(rows)).length;
  } catch {
    return 0;
  }
}

function isStoredRows(value: unknown): value is ReviewRow[] {
  return Array.isArray(value);
}

export type ReviewStore = {
  loadReview(persistentKey: string): Promise<ReviewRow[] | null>;
  saveReview(persistentKey: string, meta: ReviewStoreMeta, rows: ReviewRow[]): Promise<void>;
  loadAllByRecency(): Promise<Array<{ key: string; cacheKey: string; rows: ReviewRow[] }>>;
  clearReviews(): Promise<void>;
};

/** Failure-safe review store over any backend. Never rejects. */
export function createReviewStore(backend?: StoreBackend): ReviewStore {
  const store = backend ?? createIndexedDbBackend();
  return {
    async loadReview(persistentKey) {
      try {
        const record = await store.get(persistentKey);
        if (!record || !isStoredRows(record.rows)) {
          if (record) {
            await store.delete(persistentKey).catch(() => undefined);
          }
          return null;
        }
        // Bump recency so frequently revisited reviews survive eviction.
        // Fire-and-forget: a failed touch must not fail the read.
        void store
          .put({ ...record, lastUsedAt: Date.now() })
          .catch(() => undefined);
        return record.rows;
      } catch {
        return null;
      }
    },
    async saveReview(persistentKey, meta, rows) {
      try {
        await store.put({
          key: persistentKey,
          cacheKey: meta.cacheKey,
          rows,
          preset: meta.preset,
          engineBuild: meta.engineBuild,
          moves: meta.moves,
          bytes: recordBytes(rows),
          lastUsedAt: Date.now(),
        });
        const all = await store.entries();
        if (all.length <= MAX_PERSISTED_REVIEWS && all.reduce((sum, record) => sum + record.bytes, 0) <= MAX_PERSISTED_BYTES) {
          return;
        }
        const oldestFirst = [...all].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
        let count = all.length;
        let bytes = all.reduce((sum, record) => sum + record.bytes, 0);
        for (const record of oldestFirst) {
          if (count <= MAX_PERSISTED_REVIEWS && bytes <= MAX_PERSISTED_BYTES) {
            break;
          }
          await store.delete(record.key).catch(() => undefined);
          count -= 1;
          bytes -= record.bytes;
        }
      } catch {
        // Silent: persistence is best-effort.
      }
    },
    async loadAllByRecency() {
      try {
        const all = await store.entries();
        return [...all]
          .filter((record) => isStoredRows(record.rows))
          .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
          .map((record) => ({ key: record.key, cacheKey: record.cacheKey, rows: record.rows }));
      } catch {
        return [];
      }
    },
    async clearReviews() {
      try {
        await store.clear();
      } catch {
        // Silent (see saveReview).
      }
    },
  };
}
