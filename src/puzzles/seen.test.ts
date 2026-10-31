// SIG-1179: tests for the persistent seen-history helpers (pure parts +
// upsert shape: conflicting upserts must resolve as skips, not updates,
// because the ledger is insert-only with no UPDATE policy).
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

type UpsertCall = { row: unknown; options: unknown };

const holder: { calls: UpsertCall[] } = { calls: [] };

function fakeSupabase() {
  return {
    from: (table: string) => {
      void table;
      return {
        upsert: (row: unknown, options: unknown) => {
          holder.calls.push({ row, options });
          return Promise.resolve({ data: row, error: null });
        },
      };
    },
  };
}

// NOTE: dynamic imports only — a static `import "./seen.ts"` would bind the
// real supabase client before the mock below registers.
mock.module("@/src/lib/supabase/client.ts", {
  namedExports: { createBrowserSupabase: () => fakeSupabase() },
});

// `recordSeen`/`mergeLocalSeenToAccount` persist the local buffer through
// window.localStorage; install a Map-backed one (mirrors progress-sync.test.ts).
const storage = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  },
};

const { MAX_LOCAL_SEEN_IDS, mergeLocalSeenToAccount, normalizeSeenIds, recordSeen } = await import("./seen.ts");

describe("normalizeSeenIds", () => {
  it("drops non-strings, blanks and duplicates, keeping first-seen order", () => {
    assert.deepEqual(normalizeSeenIds(["a", "", "b", "a", 42, null, "c"]), ["a", "b", "c"]);
  });

  it("returns empty for non-array payloads", () => {
    assert.deepEqual(normalizeSeenIds(null), []);
    assert.deepEqual(normalizeSeenIds({}), []);
    assert.deepEqual(normalizeSeenIds("a"), []);
  });

  it("caps at the max, keeping the newest ids", () => {
    const ids = Array.from({ length: MAX_LOCAL_SEEN_IDS + 50 }, (_, i) => `p${i}`);
    const normalized = normalizeSeenIds(ids);
    assert.equal(normalized.length, MAX_LOCAL_SEEN_IDS);
    assert.equal(normalized[0], "p50");
    assert.equal(normalized[normalized.length - 1], `p${MAX_LOCAL_SEEN_IDS + 49}`);
  });

  it("respects an explicit max", () => {
    assert.deepEqual(normalizeSeenIds(["a", "b", "c"], 2), ["b", "c"]);
  });
});

describe("puzzle_seen upserts", () => {
  it("recordSeen upserts with ignoreDuplicates so re-attempts skip instead of updating", async () => {
    holder.calls.length = 0;
    // recordSeen writes the local set synchronously and fire-and-forget
    // upserts; await a tick so the (already-resolved) fake write lands.
    recordSeen("p-1", "u-1");
    await Promise.resolve();
    assert.equal(holder.calls.length, 1);
    assert.deepEqual(holder.calls[0]?.row, { user_id: "u-1", puzzle_id: "p-1" });
    assert.deepEqual(holder.calls[0]?.options, { onConflict: "user_id,puzzle_id", ignoreDuplicates: true });
  });

  it("mergeLocalSeenToAccount batch upserts with ignoreDuplicates", async () => {
    holder.calls.length = 0;
    // Seed the local buffer via an anonymous record, then merge at login.
    recordSeen("p-merge", null);
    holder.calls.length = 0;
    await mergeLocalSeenToAccount("u-2");
    const batch = holder.calls.find((call) => Array.isArray(call.row));
    assert.ok(batch, "expected a batch upsert call");
    assert.ok((batch?.row as unknown[]).some((row) => (row as { puzzle_id: string }).puzzle_id === "p-merge"));
    assert.deepEqual(batch?.options, { onConflict: "user_id,puzzle_id", ignoreDuplicates: true });
  });
});
