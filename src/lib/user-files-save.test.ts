// SIG-1037: persistRemoteDatabase inserts new games as pending (200-row
// chunks), then promotes them with the transactional swap_database_games RPC.
// On any chunk/RPC failure the pending rows are deleted and saveError is set,
// while the old games and game_count stay untouched.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { FileDatabase } from "./user-files.ts";

type RecordedCall =
  | { op: "insert-db"; row: Record<string, unknown> }
  | { op: "update-db"; row: Record<string, unknown>; filters: Record<string, unknown> }
  | { op: "insert-games"; rows: Array<Record<string, unknown>> }
  | { op: "delete-games"; filters: Record<string, unknown> }
  | { op: "clear-stats" }
  | { op: "rpc-swap"; databaseId: string }
  | { op: "write-index-skipped" };

type FakeOptions = {
  failChunkAt?: number;
  failChunkWith?: { message: string; code?: string };
  failSwap?: boolean;
  failSwapWith?: { message: string; code?: string };
  failCreateDbWith?: { message: string; code?: string };
  promotedCount?: number;
};

function makePgnGame(n: number): FileDatabase["games"][number] {
  return {
    id: `game-${n}`,
    white: "White",
    black: "Black",
    result: "*",
    event: "",
    date: "",
    pgn: "1. e4 e5 *",
    title: `Game ${n}`,
  };
}

// One module mock for the whole file (node:test forbids re-mocking); each
// test installs its fake through the global holder before calling through.
mock.module("@/src/lib/supabase/client.ts", {
  namedExports: {
    createBrowserSupabase: () =>
      (globalThis as { __sig1037Fake?: unknown }).__sig1037Fake ?? null,
  },
});

function installFakeSupabase(options: FakeOptions = {}) {
  const built = buildFakeSupabase(options);
  (globalThis as { __sig1037Fake?: unknown }).__sig1037Fake = built.fake;
  return { calls: built.calls, rpcCount: built.rpcCount };
}

const { persistRemoteDatabase } = await import("./user-files.ts");

function buildFakeSupabase(options: FakeOptions = {}) {
  const calls: RecordedCall[] = [];
  let chunkCount = 0;
  let rpcCount = 0;

  const finish = (result: { data?: unknown; error?: { message: string; code?: string } | null }) => {
    const response = { data: result.data ?? null, error: result.error ?? null };
    return {
      ...response,
      // select().single() after insert/select chains
      select: () => ({ single: async () => response }),
      single: async () => response,
      then: (
        resolve: (value: typeof response) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(response).then(resolve, reject),
    };
  };

  const gamesBuilder = (filters: Record<string, unknown> = {}) => {
    const builder: Record<string, (...args: never[]) => unknown> = {
      insert: (rows: Array<Record<string, unknown>>) => {
        chunkCount += 1;
        if (options.failChunkAt === chunkCount) {
          return finish({ error: options.failChunkWith ?? { message: `chunk ${chunkCount} failed` } });
        }
        calls.push({ op: "insert-games", rows });
        return finish({ data: rows });
      },
      delete: () => gamesBuilder({ ...filters, delete: true }),
      eq: (column: string, value: unknown) => {
        if ((filters as Record<string, unknown>).delete === true) {
          const next = { ...filters, [column]: value };
          delete (next as Record<string, unknown>).delete;
          if ("pending" in next) {
            calls.push({ op: "delete-games", filters: next });
            return finish({});
          }
          // Second .eq() in the chained cleanup delete — keep chaining.
          return gamesBuilder({ ...next, delete: true });
        }
        return gamesBuilder({ ...filters, [column]: value });
      },
      select: () => finish({ data: null }),
    };
    return builder;
  };

  const fake = {
    from: (table: string) => {
      if (table === "game_databases") {
        const dbBuilder = (filters: Record<string, unknown> = {}) => {
          const terminal = finish({});
          const builder: Record<string, (...args: never[]) => unknown> = {
            insert: (row: Record<string, unknown>) => {
              if (options.failCreateDbWith) {
                return finish({ error: options.failCreateDbWith });
              }
              calls.push({ op: "insert-db", row });
              return finish({ data: { id: "remote-db" } });
            },
            update: (row: Record<string, unknown>) => {
              const pendingUpdate = { ...filters, row };
              return {
                ...terminal,
                eq: (column: string, value: unknown) => {
                  calls.push({ op: "update-db", row, filters: { ...filters, [column]: value } });
                  void pendingUpdate;
                  return finish({});
                },
              };
            },
            eq: (column: string, value: unknown) => dbBuilder({ ...filters, [column]: value }),
            select: () => ({ single: async () => ({ data: { id: "remote-db" }, error: null }) }),
            delete: () => finish({}),
          };
          return builder;
        };
        return dbBuilder();
      }
      if (table === "games") {
        return gamesBuilder();
      }
      if (table === "position_stats") {
        return {
          delete: () => ({ eq: () => { calls.push({ op: "clear-stats" }); return finish({}); } }),
          insert: (rows: unknown) => {
            void rows;
            return finish({});
          },
        };
      }
      if (table === "game_positions") {
        return {
          insert: (rows: unknown) => {
            void rows;
            return finish({});
          },
          delete: () => ({ eq: () => finish({}) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "swap_database_games");
      rpcCount += 1;
      calls.push({ op: "rpc-swap", databaseId: args.p_database_id as string });
      if (options.failSwap) {
        return { data: null, error: options.failSwapWith ?? { message: "swap failed" } };
      }
      return { data: options.promotedCount ?? 250, error: null };
    },
  };

  return { fake, calls, rpcCount: () => rpcCount };
}

function databaseWithGames(count: number): FileDatabase {
  return {
    id: "local-db",
    remoteId: "remote-db",
    name: "Db",
    folderId: null,
    games: Array.from({ length: count }, (_, index) => makePgnGame(index)),
  };
}

test("persistRemoteDatabase: failed second chunk keeps old games and game_count, deletes pending rows", async () => {
  const { calls } = installFakeSupabase({ failChunkAt: 2 });

  const result = await persistRemoteDatabase(databaseWithGames(250), "user-1");

  assert.equal(result.remoteId, "remote-db");
  assert.equal(result.saveError, "chunk 2 failed");
  assert.equal(result.indexError, null);
  // Exactly one chunk (200 rows) succeeded before the failure.
  const inserts = calls.filter((call) => call.op === "insert-games");
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].op === "insert-games" && inserts[0].rows.length, 200);
  assert.ok(
    inserts.every(
      (call) => call.op !== "insert-games" || call.rows.every((row) => row.pending === true),
    ),
    "all inserted rows must be pending",
  );
  // Old games untouched: no delete of non-pending rows, no game_count update.
  assert.deepEqual(
    calls.filter((call) => call.op === "delete-games"),
    [{ op: "delete-games", filters: { database_id: "remote-db", pending: true } }],
    "only pending rows may be deleted",
  );
  assert.ok(
    calls.every((call) => !(call.op === "update-db" && "game_count" in call.row)),
    "game_count must not be updated on failure",
  );
  assert.ok(!calls.some((call) => call.op === "rpc-swap"), "swap must not run after a failed chunk");
});

test("persistRemoteDatabase: 51st database maps quota_databases to the databases message", async () => {
  const { calls } = installFakeSupabase({ failCreateDbWith: { message: "quota_databases", code: "P0001" } });

  const result = await persistRemoteDatabase({ ...databaseWithGames(1), remoteId: null }, "user-1");

  assert.equal(result.remoteId, null);
  assert.equal(result.saveError, "You can keep up to 50 personal databases. Delete one to add another.");
  assert.ok(!calls.some((call) => call.op === "insert-games"), "no games may be written when creation is rejected");
});

test("persistRemoteDatabase: swap quota failure maps quota_games and cleans pending rows", async () => {
  const { calls } = installFakeSupabase({
    failSwap: true,
    failSwapWith: { message: "quota_games", code: "P0001" },
  });

  const result = await persistRemoteDatabase(databaseWithGames(10), "user-1");

  assert.equal(result.remoteId, "remote-db");
  assert.equal(result.saveError, "This database holds more than 5,000 games. Remove some games and try again.");
  assert.deepEqual(
    calls.filter((call) => call.op === "delete-games"),
    [{ op: "delete-games", filters: { database_id: "remote-db", pending: true } }],
    "pending rows must be deleted after a quota swap failure",
  );
  assert.ok(
    calls.every((call) => !(call.op === "update-db" && "game_count" in call.row)),
    "game_count must not be updated on quota failure",
  );
});

test("persistRemoteDatabase: 23514 chunk failure mentioning games_pgn_size maps to the 1 MB text", async () => {
  installFakeSupabase({
    failChunkAt: 1,
    failChunkWith: { message: 'new row violates check constraint "games_pgn_size"', code: "23514" },
  });

  const result = await persistRemoteDatabase(databaseWithGames(10), "user-1");

  assert.equal(result.saveError, "One game is larger than 1 MB and was not saved.");
});

test("persistRemoteDatabase: over-1 MB pgn is rejected client-side without touching the database", async () => {
  const { calls } = installFakeSupabase();

  const oversized = { ...makePgnGame(0), pgn: `1. e4 e5 *${"e".repeat(1_000_000)}` };
  const result = await persistRemoteDatabase({ ...databaseWithGames(0), remoteId: null, games: [oversized] }, "user-1");

  assert.equal(result.remoteId, null);
  assert.equal(result.saveError, "One game is larger than 1 MB and was not saved.");
  assert.deepEqual(calls, [], "no database request may run before the client-side size check");
});

test("persistRemoteDatabase: success swaps once after the last chunk and updates game_count from the swap", async () => {
  const { calls, rpcCount } = installFakeSupabase({ promotedCount: 250 });

  const result = await persistRemoteDatabase(databaseWithGames(250), "user-1");

  assert.equal(result.saveError, null);
  assert.equal(result.remoteId, "remote-db");
  const inserts = calls.filter((call) => call.op === "insert-games");
  assert.equal(inserts.length, 2, "250 games must be inserted in 200-row chunks");
  assert.equal(rpcCount(), 1, "swap must run exactly once");
  // Swap runs after all chunks: rpc-swap is the call right after the last insert.
  const lastInsertIndex = calls.map((call) => call.op).lastIndexOf("insert-games");
  assert.equal(calls[lastInsertIndex + 1].op, "rpc-swap");
  const gameCountUpdates = calls.filter((call) => call.op === "update-db" && "game_count" in call.row);
  assert.equal(gameCountUpdates.length, 1);
  assert.deepEqual(
    (gameCountUpdates[0] as { row: Record<string, unknown> }).row,
    { game_count: 250 },
    "game_count must come from the swap return value",
  );
});
