// SIG-1039: unit tests for the linked-accounts lib. The fake client casts
// to `SupabaseClient<Database>` (structural hand-rolled chains); assertions
// run against the recorded calls.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types.ts";
import {
  isLinkedAccountUsername,
  loadLinkedAccounts,
  removeLinkedAccount,
  saveLinkedAccount,
} from "./linked-accounts.ts";

type Row = Record<string, unknown>;

function createFakeClient(options: {
  userId?: string | null;
  rows?: Row[];
  selectError?: unknown;
  writeError?: unknown;
  authError?: unknown;
} = {}): { client: SupabaseClient<Database>; calls: { from: string[]; select: string[]; upsert: Row[]; deleteEq: Array<[string, unknown]> } } {
  const calls = { from: [] as string[], select: [] as string[], upsert: [] as Row[], deleteEq: [] as Array<[string, unknown]> };
  const rows = options.rows ?? [];
  const failWrite = options.writeError ?? null;
  const failSelect = options.selectError ?? null;
  const failAuth = options.authError ?? null;
  const query = {
    eq(col: string, val: unknown) {
      calls.deleteEq.push([col, val]);
      return query;
    },
    order() {
      return Promise.resolve({ data: failSelect ? null : rows, error: failSelect });
    },
    then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
      return resolve({ data: failSelect ? null : rows, error: failSelect });
    },
  };
  const client = {
    auth: {
      getUser: async () => {
        if (failAuth) {
          return { data: { user: null }, error: failAuth };
        }
        const userId = options.userId === undefined ? "user-1" : options.userId;
        return { data: { user: userId ? { id: userId } : null }, error: null };
      },
    },
    from(table: string) {
      calls.from.push(table);
      return {
        select(cols: string) {
          calls.select.push(cols);
          return query;
        },
        upsert: async (row: Record<string, unknown>) => {
          calls.upsert.push(row);
          return { data: row, error: failWrite };
        },
        delete: () => query,
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("isLinkedAccountUsername", () => {
  it("accepts 2-30 handle chars and rejects the 1/31 boundaries", () => {
    assert.equal(isLinkedAccountUsername("ab"), true);
    assert.equal(isLinkedAccountUsername("a".repeat(30)), true);
    assert.equal(isLinkedAccountUsername("Magnus_C-1"), true);
    assert.equal(isLinkedAccountUsername("a"), false);
    assert.equal(isLinkedAccountUsername("a".repeat(31)), false);
    assert.equal(isLinkedAccountUsername("bad name"), false);
    assert.equal(isLinkedAccountUsername("name!"), false);
    assert.equal(isLinkedAccountUsername("  "), false);
    assert.equal(isLinkedAccountUsername(null), false);
  });

  it("trims before measuring", () => {
    assert.equal(isLinkedAccountUsername("  abc  "), true);
  });
});

describe("saveLinkedAccount", () => {
  it('rejects "a", "bad name" and 31-char names before any request', async () => {
    for (const bad of ["a", "bad name", "a".repeat(31)]) {
      const { client, calls } = createFakeClient();
      const result = await saveLinkedAccount(client, "lichess", bad);
      assert.deepEqual(result, { ok: false, error: "invalid_username" });
      assert.deepEqual(calls.from, [], `no request for ${JSON.stringify(bad)}`);
    }
  });

  it("upserts on a second save for the same source", async () => {
    const first = createFakeClient();
    const one = await saveLinkedAccount(first.client, "lichess", "Magnus");
    assert.equal(one.ok, true);
    assert.deepEqual(first.calls.upsert, [{ user_id: "user-1", source: "lichess", username: "Magnus" }]);

    const second = createFakeClient({
      rows: [{ source: "lichess", username: "Magnus", last_synced_at: null }],
    });
    const two = await saveLinkedAccount(second.client, "lichess", "Hikaru");
    assert.equal(two.ok, true);
    assert.deepEqual(second.calls.upsert, [{ user_id: "user-1", source: "lichess", username: "Hikaru" }]);
    assert.deepEqual(two.ok ? two.accounts : [], [
      { source: "lichess", username: "Magnus", lastSyncedAt: null },
    ]);
  });

  it("maps write errors to unavailable", async () => {
    const { client } = createFakeClient({ writeError: new Error("denied") });
    const result = await saveLinkedAccount(client, "chesscom", "Hikaru");
    assert.deepEqual(result, { ok: false, error: "unavailable" });
  });

  it("requires a signed-in user", async () => {
    const { client, calls } = createFakeClient({ userId: null });
    const result = await saveLinkedAccount(client, "chesscom", "Hikaru");
    assert.deepEqual(result, { ok: false, error: "unavailable" });
    assert.deepEqual(calls.from, [], "no request without a user");
  });
});

describe("loadLinkedAccounts", () => {
  it("maps rows and null last_synced_at", async () => {
    const { client } = createFakeClient({
      rows: [
        { source: "chesscom", username: "Hikaru", last_synced_at: "2026-10-01T00:00:00.000Z" },
        { source: "lichess", username: "Magnus", last_synced_at: null },
      ],
    });
    const result = await loadLinkedAccounts(client);
    assert.deepEqual(result, {
      ok: true,
      accounts: [
        { source: "lichess", username: "Magnus", lastSyncedAt: null },
        { source: "chesscom", username: "Hikaru", lastSyncedAt: "2026-10-01T00:00:00.000Z" },
      ],
    });
  });

  it("maps select errors to unavailable", async () => {
    const { client } = createFakeClient({ selectError: new Error("denied") });
    assert.deepEqual(await loadLinkedAccounts(client), { ok: false, error: "unavailable" });
  });
});

describe("removeLinkedAccount", () => {
  it("deletes the own row scoped by user and source", async () => {
    const { client, calls } = createFakeClient({
      rows: [{ source: "lichess", username: "Magnus", last_synced_at: null }],
    });
    const result = await removeLinkedAccount(client, "chesscom");
    assert.equal(result.ok, true);
    assert.deepEqual(calls.deleteEq, [
      ["user_id", "user-1"],
      ["source", "chesscom"],
    ]);
  });

  it("requires a signed-in user", async () => {
    const { client } = createFakeClient({ userId: null });
    const result = await removeLinkedAccount(client, "lichess");
    assert.deepEqual(result, { ok: false, error: "unavailable" });
  });
});
