import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PERSISTED_BYTES,
  MAX_PERSISTED_REVIEWS,
  createReviewStore,
  getReviewStore,
  resetReviewStoreForTests,
  type PersistedReviewRecord,
  type StoreBackend,
} from "./review-store";

const rows = [{ index: 0 }] as unknown as Parameters<ReturnType<typeof createReviewStore>["saveReview"]>[2];

function makeRecord(key: string, lastUsedAt = 0, bytes = 10): PersistedReviewRecord {
  return {
    key,
    cacheKey: `sync:${key}`,
    rows: rows as unknown as PersistedReviewRecord["rows"],
    preset: "standard",
    engineBuild: "lite",
    moves: 1,
    bytes,
    lastUsedAt,
  };
}

/** In-memory StoreBackend for tests (mirrors the IDB contract, no browser needed). */
class MapBackend implements StoreBackend {
  readonly map = new Map<string, PersistedReviewRecord>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async put(record: PersistedReviewRecord) {
    this.map.set(record.key, { ...record });
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  async clear() {
    this.map.clear();
  }
  async entries() {
    return [...this.map.values()];
  }
}

test("save/load round-trips rows", async () => {
  const store = createReviewStore(new MapBackend());
  await store.saveReview("k1", { preset: "deep", engineBuild: "lite", moves: 12, cacheKey: "sync:k1" }, rows);
  assert.deepEqual(await store.loadReview("k1"), rows);
  assert.equal(await store.loadReview("missing"), null);
});

test("corrupt records are treated as a miss and removed", async () => {
  const backend = new MapBackend();
  backend.map.set("bad", { ...makeRecord("bad"), rows: "nope" as unknown as PersistedReviewRecord["rows"] });
  const store = createReviewStore(backend);
  assert.equal(await store.loadReview("bad"), null);
  assert.equal(backend.map.has("bad"), false);
});

test("eviction drops the oldest entries past the count cap", async () => {
  const backend = new MapBackend();
  const store = createReviewStore(backend);
  for (let index = 0; index < MAX_PERSISTED_REVIEWS + 1; index += 1) {
    backend.map.set(`k${index}`, makeRecord(`k${index}`, index));
    await store.saveReview(`k${index}`, { preset: "standard", engineBuild: "lite", moves: 2, cacheKey: "sync:k" }, rows);
    // Force deterministic recency: the save above stamps Date.now(), so re-stamp in order.
    const record = backend.map.get(`k${index}`);
    if (record) {
      backend.map.set(`k${index}`, { ...record, bytes: 10, lastUsedAt: index });
    }
  }
  assert.equal(backend.map.size, MAX_PERSISTED_REVIEWS);
  assert.equal(backend.map.has("k0"), false);
  assert.equal(backend.map.has(`k${MAX_PERSISTED_REVIEWS}`), true);
});

test("byte-cap eviction removes oldest until under budget", async () => {
  const backend = new MapBackend();
  backend.map.set("old", makeRecord("old", 1, MAX_PERSISTED_BYTES));
  const store = createReviewStore(backend);
  await store.saveReview("new", { preset: "standard", engineBuild: "lite", moves: 2, cacheKey: "sync:k" }, rows);
  assert.equal(backend.map.has("old"), false);
  assert.ok(backend.map.has("new"));
});

test("loadAllByRecency returns oldest-first for ordered hydration", async () => {
  const backend = new MapBackend();
  backend.map.set("b", makeRecord("b", 2));
  backend.map.set("a", makeRecord("a", 1));
  const store = createReviewStore(backend);
  assert.deepEqual(
    (await store.loadAllByRecency()).map((entry) => entry.key),
    ["a", "b"],
  );
});

test("a throwing backend still resolves (failure-safe)", async () => {
  const throwing: StoreBackend = {
    get: () => Promise.reject(new Error("boom")),
    put: () => Promise.reject(new Error("boom")),
    delete: () => Promise.reject(new Error("boom")),
    clear: () => Promise.reject(new Error("boom")),
    entries: () => Promise.reject(new Error("boom")),
  };
  const store = createReviewStore(throwing);
  assert.equal(await store.loadReview("k"), null);
  await store.saveReview("k", { preset: "standard", engineBuild: "lite", moves: 1, cacheKey: "sync:k" }, rows);
  assert.deepEqual(await store.loadAllByRecency(), []);
  await store.clearReviews();
});

test("clearReviews empties the store", async () => {
  const backend = new MapBackend();
  const store = createReviewStore(backend);
  await store.saveReview("k1", { preset: "standard", engineBuild: "lite", moves: 1, cacheKey: "sync:k" }, rows);
  await store.clearReviews();
  assert.equal(backend.map.size, 0);
});

// SIG-1105: minimal fake IndexedDB so the singleton + versionchange behavior
// of the real createIndexedDbBackend is exercised without a browser.
type FakeDb = {
  onversionchange: (() => void) | null;
  onclose: (() => void) | null;
  closeCalls: number;
  close(): void;
  transaction(): { objectStore(): Record<string, unknown> };
};

function installFakeIndexedDb() {
  const dbs: FakeDb[] = [];
  let openCalls = 0;
  const stored: PersistedReviewRecord[] = [
    { ...makeRecord("seed", 1) },
  ];
  const makeRequest = <T>(value: T) => {
    const request = { result: value } as unknown as IDBRequest<T> & {
      onsuccess: (() => void) | null;
      onerror: (() => void) | null;
    };
    request.onsuccess = null;
    request.onerror = null;
    // requestToPromise assigns onsuccess synchronously after this returns;
    // fire it on a microtask like a real completed request.
    queueMicrotask(() => {
      try {
        request.onsuccess?.();
      } catch {
        // Ignored: resolution already captured result.
      }
    });
    return request;
  };
  const fakeDb = (): FakeDb => {
    const db: FakeDb = {
      onversionchange: null,
      onclose: null,
      closeCalls: 0,
      close() {
        db.closeCalls += 1;
      },
      transaction() {
        const storeStub = {
          getAll: () => makeRequest<PersistedReviewRecord[]>([...stored]),
          get: () => makeRequest<PersistedReviewRecord | undefined>(stored[0]),
          put: () => makeRequest<void>(undefined),
          delete: () => makeRequest<void>(undefined),
          clear: () => makeRequest<void>(undefined),
        };
        return { objectStore: () => storeStub };
      },
    };
    return db;
  };
  const realIndexedDb = (globalThis as { indexedDB?: unknown }).indexedDB;
  const g = globalThis as unknown as {
    indexedDB: {
      open(name: string, version?: number): IDBOpenDBRequest;
    };
  };
  g.indexedDB = {
    open() {
      openCalls += 1;
      const db = fakeDb();
      dbs.push(db);
      const request = {
        result: db,
        onupgradeneeded: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onblocked: null as (() => void) | null,
      } as unknown as IDBOpenDBRequest & {
        onsuccess: (() => void) | null;
      };
      // Resolve like a real open: upgrade (skipped, guarded by try) then success.
      queueMicrotask(() => {
        try {
          (request as unknown as { onupgradeneeded: (() => void) | null }).onupgradeneeded?.();
        } catch {
          // Ignored: the fake db has no objectStoreNames.
        }
        request.onsuccess?.();
      });
      return request;
    },
  };
  return {
    dbs,
    openCalls: () => openCalls,
    restore() {
      if (realIndexedDb === undefined) {
        delete (globalThis as { indexedDB?: unknown }).indexedDB;
      } else {
        (globalThis as { indexedDB?: unknown }).indexedDB = realIndexedDb;
      }
    },
  };
}

test("getReviewStore returns the same instance and opens the database once", async () => {
  await resetReviewStoreForTests();
  const fake = installFakeIndexedDb();
  try {
    assert.equal(getReviewStore(), getReviewStore());
    await getReviewStore().loadAllByRecency();
    await getReviewStore().loadAllByRecency();
    assert.equal(fake.openCalls(), 1);
  } finally {
    await resetReviewStoreForTests();
    fake.restore();
  }
});

test("versionchange closes the connection and the next operation reopens it", async () => {
  await resetReviewStoreForTests();
  const fake = installFakeIndexedDb();
  try {
    await getReviewStore().loadAllByRecency();
    assert.equal(fake.openCalls(), 1);
    const db = fake.dbs[0];
    assert.ok(db);
    assert.equal(typeof db.onversionchange, "function");
    db.onversionchange?.();
    assert.equal(db.closeCalls, 1);
    await getReviewStore().loadAllByRecency();
    assert.equal(fake.openCalls(), 2);
  } finally {
    await resetReviewStoreForTests();
    fake.restore();
  }
});
