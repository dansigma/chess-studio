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
            delete: () => ({ eq: () => finish({}) }),
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
    remoteId: null,
    name: "Db",
    folderId: null,
    games: Array.from({ length: count }, (_, index) => makePgnGame(index)),
  };
}

test("persistRemoteDatabase: failed second chunk leaves game_count untouched and deletes pending rows", async () => {
  const { calls } = installFakeSupabase({ failChunkAt: 2 });

  const result = await persistRemoteDatabase(databaseWithGames(250), "user-1");

  assert.equal(result.remoteId, null);
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

test("persistRemoteDatabase: 11th database maps quota_databases to the databases message", async () => {
  const { calls } = installFakeSupabase({ failCreateDbWith: { message: "quota_databases", code: "P0001" } });

  const result = await persistRemoteDatabase({ ...databaseWithGames(1), remoteId: null }, "user-1");

  assert.equal(result.remoteId, null);
  assert.equal(result.saveError, "You can keep up to 10 personal databases. Delete one to add another.");
  assert.ok(!calls.some((call) => call.op === "insert-games"), "no games may be written when creation is rejected");
});

test("persistRemoteDatabase: swap quota failure maps quota_games and cleans pending rows", async () => {
  const { calls } = installFakeSupabase({
    failSwap: true,
    failSwapWith: { message: "quota_games", code: "P0001" },
  });

  const result = await persistRemoteDatabase(databaseWithGames(10), "user-1");

  assert.equal(result.remoteId, null);
  assert.equal(result.saveError, "This database holds more than 25,000 games. Remove some games and try again.");
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

test("persistRemoteDatabase: a 25,000-game first upload swaps once after the last chunk and updates game_count from the swap", async () => {
  const { calls, rpcCount } = installFakeSupabase({ promotedCount: 25_000 });

  const result = await persistRemoteDatabase({ ...databaseWithGames(25_000), remoteId: null }, "user-1");

  assert.equal(result.saveError, null);
  assert.equal(result.remoteId, "remote-db");
  const inserts = calls.filter((call) => call.op === "insert-games");
  assert.equal(inserts.length, 125);
  assert.ok(inserts.every((call) => call.rows.length === 200));
  assert.equal(rpcCount(), 1, "swap must run exactly once");
  // Swap runs after all chunks: rpc-swap is the call right after the last insert.
  const lastInsertIndex = calls.map((call) => call.op).lastIndexOf("insert-games");
  assert.equal(calls[lastInsertIndex + 1].op, "rpc-swap");
  const gameCountUpdates = calls.filter((call) => call.op === "update-db" && "game_count" in call.row);
  assert.equal(gameCountUpdates.length, 1);
  assert.deepEqual(
    (gameCountUpdates[0] as { row: Record<string, unknown> }).row,
    { game_count: 25_000 },
    "game_count must come from the swap return value",
  );
});

test("append to a 1,000-game cloud database sends one game write and metadata changes send none", async () => {
  const calls: Record<string, unknown>[] = [];
  const metadata: Record<string, unknown>[] = [];
  (globalThis as { __sig1037Fake?: unknown }).__sig1037Fake = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "write_database_game");
      calls.push(args);
      return { error: null };
    },
    from: (table: string) => {
      assert.equal(table, "game_databases");
      return {
        update: (fields: Record<string, unknown>) => ({
          eq: async (column: string, value: string) => {
            assert.equal(column, "id");
            assert.equal(value, "remote-db");
            metadata.push(fields);
            return { error: null };
          },
        }),
      };
    },
  };

  const { useStudioStore } = await import("@/src/store/studio-store");
  const database = { ...databaseWithGames(1000), remoteId: "remote-db" };
  useStudioStore.setState({
    files: { databases: [database], folders: [] },
    user: { id: "user-1", email: "owner@example.test" },
  });
  const state = useStudioStore.getState();
  state.importPgnText('[White "Judit"]\n\n1. e4 e5 *', "Board");
  assert.equal(state.addActiveGameToDatabase({ id: database.id }), true);
  state.renameFileDatabase(database.id, "Renamed");
  state.moveFileDatabase(database.id, "folder");
  const { games } = useStudioStore.getState().files.databases[0];
  assert.equal(games.length, 1001);
  assert.deepEqual(games.slice(0, -1), database.games);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_operation, "insert");
  assert.equal(calls[0].p_game_id, games[1000].id);
  assert.equal((calls[0].p_game as { pgn: string }).pgn, games[1000].pgn);
  assert.equal((calls[0].p_positions as unknown[]).length, 3);
  assert.deepEqual(metadata, [{ name: "Renamed" }, { folder_id: "folder" }]);

  const edited = { ...games[1000], pgn: '[Result "1-0"]\n\n1. d4 1-0' };
  state.replaceFileDatabaseGames(database.id, [...games.slice(0, -1), edited]);
  state.replaceFileDatabaseGames(database.id, games.slice(0, -1));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.map((call) => [call.p_operation, call.p_game_id]), [
    ["insert", edited.id],
    ["update", edited.id],
    ["delete", edited.id],
  ]);
  assert.equal(calls[2].p_previous_pgn, edited.pgn);
});

test("sign-in uploads local databases once, skips duplicates, and keeps rejected databases local", async () => {
  const { useStudioStore } = await import("@/src/store/studio-store");
  const { loadLocalFiles, saveLocalFiles } = await import("./user-files.ts");
  const { calls } = installFakeSupabase({
    failChunkAt: 2,
    failChunkWith: { message: "quota_games", code: "P0001" },
  });
  const originalWindow = (globalThis as { window?: unknown }).window;
  const cache = new Map<string, string>();
  (globalThis as { window?: unknown }).window = { localStorage: {
    getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => cache.set(key, value),
  } };
  const base = { ...databaseWithGames(1), remoteId: null };
  const local = {
    folders: [],
    databases: [
      { ...base, id: "local-1", name: "New" },
      { ...base, id: "local-2", name: "Rejected" },
      { ...base, id: "local-3", name: "Already there" },
    ],
  };
  const remote = {
    folders: [],
    databases: [{ ...base, id: "cloud-1", remoteId: "account-db", name: "Already there" }],
  };
  try {
    await saveLocalFiles(local);
    useStudioStore.getState().setUser({ id: "user-1", email: null });
    await useStudioStore.getState().uploadLocalDatabases(remote);

    assert.deepEqual(calls.flatMap((call) => call.op === "insert-db" ? [call.row.name] : []), ["New", "Rejected"]);
    const { files, statusMessage } = useStudioStore.getState();
    assert.deepEqual(files.databases.map(({ id, remoteId }) => [id, remoteId]), [
      ["local-1", "remote-db"], ["local-2", null], ["local-3", null], ["cloud-1", "account-db"],
    ]);
    assert.deepEqual(await loadLocalFiles(), files);
    assert.match(statusMessage ?? "", /Databases uploaded to your account: 1/);
    assert.match(statusMessage ?? "", /Rejected \(This database holds more than 25,000 games\./);
  } finally {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test("account Library downloads every page and keeps databases above the new quota", async () => {
  const ranges: Array<[number, number]> = [];
  const rows = Array.from({ length: 11 }, (_, i) => ({
    id: `remote-${i}`, name: `Database ${i}`, folder_id: null, game_count: i === 0 ? 25_000 : 0,
  }));
  const readGames = {
    eq: () => readGames,
    order: (column: string) => {
      assert.equal(column, "id");
      return readGames;
    },
    range: (start: number, end: number) => {
      ranges.push([start, end]);
      return {
        data: Array.from({ length: end - start + 1 }, (_, i) => makePgnGame(start + i)),
        error: null,
      };
    },
  };
  (globalThis as { __sig1037Fake?: unknown }).__sig1037Fake = {
    from: (table: string) => ({
      select: () => {
        if (table === "user_folders") return { eq: () => ({ data: [], error: null }) };
        if (table === "game_databases") return { eq: () => ({ eq: () => ({ data: rows, error: null }) }) };
        assert.equal(table, "games");
        return readGames;
      },
    }),
  };
  const { loadRemoteFiles } = await import("./user-files.ts");
  const files = await loadRemoteFiles("user-1");
  assert.equal(files.databases.length, 11);
  assert.equal(files.databases[0].games.length, 25_000);
  assert.equal(new Set(files.databases[0].games.map(({ id }) => id)).size, 25_000);
  assert.equal(ranges.length, 25);
  assert.deepEqual(ranges.at(-1), [24_000, 24_999]);
});

test("sign-in joins an in-flight first upload and an append queues one game write", async () => {
  const { useStudioStore } = await import("@/src/store/studio-store");
  const { fake, calls } = buildFakeSupabase();
  const swapStarted = Promise.withResolvers<void>();
  const finishSwap = Promise.withResolvers<void>();
  const writes: Record<string, unknown>[] = [];
  (globalThis as { __sig1037Fake?: unknown }).__sig1037Fake = {
    ...fake,
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "write_database_game") {
        writes.push(args);
        return { error: null };
      }
      swapStarted.resolve();
      await finishSwap.promise;
      return fake.rpc(name, args);
    },
  };
  useStudioStore.setState({
    files: { folders: [], databases: [] },
    filesHydrated: true,
    user: { id: "user-1", email: null },
  });
  const state = useStudioStore.getState();
  const id = state.importParsedDatabase("New", [makePgnGame(0)]);
  await swapStarted.promise;
  const signIn = state.uploadLocalDatabases({ folders: [], databases: [] });
  try {
    state.importPgnText('[White "Judit"]\n\n1. d4 d5 *', "Board");
    assert.equal(state.addActiveGameToDatabase({ id }), true);
    assert.equal(writes.length, 0);
  } finally {
    finishSwap.resolve();
  }
  await signIn;
  await new Promise<void>((resolve) => setImmediate(resolve));
  const { files, statusMessage } = useStudioStore.getState();
  const [database] = files.databases;
  assert.match(statusMessage ?? "", /Databases uploaded to your account: 1/);
  assert.equal(database.remoteId, "remote-db");
  assert.equal(database.games.length, 2);
  assert.equal(calls.filter(({ op }) => op === "insert-db").length, 1);
  assert.deepEqual(writes.map(({ p_operation, p_game_id }) => [p_operation, p_game_id]), [
    ["insert", database.games[1].id],
  ]);
});
