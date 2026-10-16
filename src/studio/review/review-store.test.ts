import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PERSISTED_BYTES,
  MAX_PERSISTED_REVIEWS,
  createReviewStore,
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
