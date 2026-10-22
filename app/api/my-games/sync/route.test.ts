// Tests for POST /api/my-games/sync (SIG-1088): auth, rate limits,
// incremental behavior, and per-account error isolation.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "@/src/test-utils/stubs/next-server.ts";
import {
  mockSupabaseModules,
  nextTestIp,
  type FakeSupabaseState,
} from "@/src/test-utils/route-test.ts";
import type { PlayerGame } from "@/src/lib/player-types.ts";

const state: FakeSupabaseState = {};
mockSupabaseModules(state);

const { POST, setSyncLoadersForTest, resetSyncLoadersForTest } = await import("./route.ts");

const URL_ = "http://app.test/api/my-games/sync";

function post(ip = nextTestIp()): NextRequest {
  return new NextRequest(URL_, { method: "POST", headers: { "x-forwarded-for": ip } });
}

function game(id: string, playedAt: number): PlayerGame {
  return {
    id,
    winner: "white",
    whiteName: "Magnus",
    whiteRating: 2800,
    blackName: "Hikaru",
    blackRating: 2790,
    year: 2026,
    month: 10,
    event: "Lichess",
    eco: "C50",
    opening: "Italian Game",
    pgn: `[White "Magnus"]\n\n1. e4 e5 ${id}`,
    moves: "e4 e5",
    timeClass: "blitz",
    color: "white",
    playerResult: "win",
    playedAt,
  };
}

type TableRows = Record<string, Array<Record<string, unknown>>>;

export type SyncTestQueryChain = {
  select: (...args: unknown[]) => SyncTestQueryChain & PromiseLike<unknown>;
  order: () => Promise<{ data: unknown; error: unknown }>;
  eq: (...args: unknown[]) => SyncTestQueryChain;
  in: (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>;
  then?: (resolve: (value: unknown) => unknown) => unknown;
};

function syncFake(options: {
  userId?: string | null;
  linkedRows?: Array<Record<string, unknown>>;
  linkedError?: unknown;
  myGames?: TableRows;
  myGamesWriteError?: unknown;
  myGamesSelectError?: unknown;
}): { client: unknown; store: { myGames: TableRows; updates: Array<Record<string, unknown>> } } {
  const fakeStore: { myGames: TableRows; updates: Array<Record<string, unknown>> } = {
    myGames: options.myGames ?? {},
    updates: [],
  };
  const selectError = options.linkedError ?? null;
  const myGamesSelectError = options.myGamesSelectError ?? null;
  const query = (table: string): SyncTestQueryChain => {
    const filters: unknown[][] = [];
    // Builders returned by `select(...)`: linked-account reads resolve at the
    // terminal `order`; the sync pre-select resolves at the terminal `in` via
    // a diff against the fake store, so the imported-count logic is covered by
    // tests instead of trusting `upsert(ignoreDuplicates)` response shapes.
    const selectScope = (): SyncTestQueryChain & PromiseLike<unknown> => {
      const scope = {
        select: () => selectScope(),
        order: () => {
          if (table === "linked_accounts") {
            return Promise.resolve({
              data: selectError ? null : (options.linkedRows ?? []),
              error: selectError,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
        eq: (...args: unknown[]) => {
          filters.push(args);
          return scope;
        },
        in: (...args: unknown[]) => {
          filters.push(args);
          if (table !== "my_games") {
            return Promise.resolve({ data: [], error: null });
          }
          if (myGamesSelectError) {
            return Promise.resolve({ data: null, error: myGamesSelectError });
          }
          const ids = new Set(
            args[0] === "external_id" && Array.isArray(args[1]) ? (args[1] as unknown[]) : [],
          );
          const rows = (fakeStore.myGames[table] ?? []).filter((row) => ids.has(row.external_id));
          return Promise.resolve({
            data: rows.map((row) => ({ external_id: row.external_id })),
            error: null,
          });
        },
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: selectError && table === "linked_accounts" ? null : [], error: selectError }),
      } as unknown as SyncTestQueryChain & PromiseLike<unknown>;
      return scope;
    };
    const chain: SyncTestQueryChain = {
      select: (..._args: unknown[]) => selectScope(),
      order: () => {
        if (table === "linked_accounts") {
          return Promise.resolve({
            data: selectError ? null : (options.linkedRows ?? []),
            error: selectError,
          });
        }
        return Promise.resolve({ data: [], error: null });
      },
      eq: (...args: unknown[]) => {
        if (table === "my_games") {
          filters.push(args);
        }
        return chain;
      },
      in: (...args: unknown[]) => {
        if (table === "my_games") {
          filters.push(args);
          if (myGamesSelectError) {
            return Promise.resolve({ data: null, error: myGamesSelectError });
          }
          const ids = new Set(
            args[0] === "external_id" && Array.isArray(args[1]) ? (args[1] as unknown[]) : [],
          );
          const rows = (fakeStore.myGames[table] ?? []).filter((row) => ids.has(row.external_id));
          return Promise.resolve({
            data: rows.map((row) => ({ external_id: row.external_id })),
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      },
    } satisfies SyncTestQueryChain;
    return chain;
  };
  const client = {
    auth: {
      getUser: async () => {
        if (!options.userId) {
          return { data: { user: null }, error: null };
        }
        return { data: { user: { id: options.userId } }, error: null };
      },
    },
    from: (table: string) => ({
      select: (...args: unknown[]) => query(table).select(...args),
      upsert: async (rows: unknown) => {
        if (options.myGamesWriteError) {
          return { data: null, error: options.myGamesWriteError };
        }
        const list = Array.isArray(rows) ? rows : [rows];
        const seen = new Set(
          (fakeStore.myGames[table] ?? []).map((row) => `${row.user_id}|${row.source}|${row.external_id}`),
        );
        const inserted: unknown[] = [];
        for (const row of list as Array<Record<string, unknown>>) {
          const key = `${row.user_id}|${row.source}|${row.external_id}`;
          if (!seen.has(key)) {
            seen.add(key);
            fakeStore.myGames[table] = [...(fakeStore.myGames[table] ?? []), row];
            inserted.push({ id: `row-${inserted.length}` });
          }
        }
        return { data: inserted, error: null };
      },
      insert: async () => {
        throw new Error("insert not used");
      },
      update: (attrs: unknown) => {
        fakeStore.updates.push({ table, attrs });
        const updateChain: Record<string, unknown> = {};
        updateChain.eq = () => updateChain;
        updateChain.then = (resolve: (value: unknown) => unknown) =>
          resolve({ data: null, error: null });
        return updateChain;
      },
      delete: () => query(table),
      eq: (...args: unknown[]) => query(table).eq(...args),
      in: (...args: unknown[]) => query(table).in(...args),
    }),
  };
  return { client: client as unknown, store: fakeStore };
}

beforeEach(() => {
  resetSyncLoadersForTest();
});

test("anonymous request gets 401", async () => {
  const { client } = syncFake({ userId: null });
  state.server = client;
  setSyncLoadersForTest({
    lichess: async () => {
      throw new Error("must not fetch without a user");
    },
  });
  const res = await POST(post());
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Sign in to sync games." });
});

test("second sync imports 0 rows and sends since equal to last_synced_at", async () => {
  const since = "2026-10-20T00:00:00.000Z";
  const seenSince: number[] = [];
  const firstStore: TableRows = {};
  const { client, store } = syncFake({
    userId: "user-1",
    linkedRows: [{ source: "lichess", username: "Magnus", last_synced_at: since }],
    myGames: firstStore,
  });
  state.server = client;
  setSyncLoadersForTest({
    lichess: async (_username, sinceMs) => {
      seenSince.push(sinceMs);
      if (seenSince.length === 1) {
        return [game("g1", Date.parse("2026-10-21T00:00:00.000Z"))];
      }
      return [game("g1", Date.parse("2026-10-21T00:00:00.000Z"))];
    },
  });
  const first = await POST(post());
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    imported: 1,
    accounts: [{ source: "lichess", imported: 1 }],
  });

  // Stored last_synced_at now reflects the newest fetched game; the second
  // sync passes it as `since` and the dedupe yields 0 new rows.
  const { client: secondClient } = syncFake({
    userId: "user-1",
    linkedRows: [{ source: "lichess", username: "Magnus", last_synced_at: "2026-10-21T00:00:00.000Z" }],
    myGames: store.myGames,
  });
  state.server = secondClient;
  const second = await POST(post());
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), {
    imported: 0,
    accounts: [{ source: "lichess", imported: 0 }],
  });
  assert.deepEqual(seenSince, [Date.parse(since), Date.parse("2026-10-21T00:00:00.000Z")]);
});

test("one account failing upstream does not stop the other", async () => {
  const { client } = syncFake({
    userId: "user-1",
    linkedRows: [
      { source: "lichess", username: "Magnus", last_synced_at: null },
      { source: "chesscom", username: "Hikaru", last_synced_at: null },
    ],
  });
  state.server = client;
  setSyncLoadersForTest({
    lichess: async () => {
      throw new Error("upstream down");
    },
    chesscom: async () => [game("c1", Date.now())],
  });
  const res = await POST(post());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    imported: 1,
    accounts: [
      { source: "lichess", imported: 0, error: "upstream_unavailable" },
      { source: "chesscom", imported: 1 },
    ],
  });
});

test("last_synced_at advances to newest fetched game", async () => {
  const { client, store } = syncFake({
    userId: "user-1",
    linkedRows: [{ source: "lichess", username: "Magnus", last_synced_at: null }],
  });
  state.server = client;
  setSyncLoadersForTest({
    lichess: async () => [
      game("old", Date.parse("2026-10-20T00:00:00.000Z")),
      game("new", Date.parse("2026-10-22T00:00:00.000Z")),
    ],
  });
  const res = await POST(post());
  assert.equal(res.status, 200);
  assert.equal(store.updates.length, 1);
  assert.equal(store.updates[0]?.table, "linked_accounts");
  assert.deepEqual((store.updates[0]?.attrs as Record<string, string>).last_synced_at, "2026-10-22T00:00:00.000Z");
});

test("write failure reports unavailable without advancing last_synced_at", async () => {
  const { client, store } = syncFake({
    userId: "user-1",
    linkedRows: [{ source: "lichess", username: "Magnus", last_synced_at: null }],
    myGamesWriteError: new Error("denied"),
  });
  state.server = client;
  setSyncLoadersForTest({ lichess: async () => [game("g1", Date.now())] });
  const res = await POST(post());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    imported: 0,
    accounts: [{ source: "lichess", imported: 0, error: "unavailable" }],
  });
  assert.equal(store.updates.length, 0);
});

test("pre-select failure reports unavailable without advancing last_synced_at", async () => {
  const { client, store } = syncFake({
    userId: "user-select-fail",
    linkedRows: [{ source: "lichess", username: "Magnus", last_synced_at: null }],
    myGamesSelectError: new Error("denied"),
  });
  state.server = client;
  setSyncLoadersForTest({ lichess: async () => [game("g1", Date.now())] });
  const res = await POST(post(nextTestIp()));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    imported: 0,
    accounts: [{ source: "lichess", imported: 0, error: "unavailable" }],
  });
  assert.equal(store.updates.length, 0);
});

test("7th sync within an hour gets 429", async () => {
  const { client } = syncFake({
    userId: "rate-user",
    linkedRows: [{ source: "lichess", username: "Magnus", last_synced_at: null }],
  });
  state.server = client;
  setSyncLoadersForTest({ lichess: async () => [] });
  const ip = nextTestIp();
  let last = 0;
  for (let i = 0; i < 7; i += 1) {
    const res = await POST(post(ip));
    await res.json();
    last = res.status;
  }
  assert.equal(last, 429);
});

test("unavailable linked accounts returns 502", async () => {
  const { client } = syncFake({ userId: "user-1", linkedError: new Error("denied") });
  state.server = client;
  const res = await POST(post());
  assert.equal(res.status, 502);
});

test("a second sync after an all-skipped sync still imports the newest game", async () => {
  // Newest-first loaders return the unmappable game (empty PGN → row null)
  // first; the cursor must not advance past it, so a second sync re-fetches
  // from the original `last_synced_at` and stores the game once it is back.
  // Fresh user + IPs: the shared in-memory limiter counts every POST per
  // user, and earlier tests in this file already consumed "user-1" quota.
  const since = "2026-10-20T00:00:00.000Z";
  const seenSince: number[] = [];
  let pgn = "";
  const { client, store } = syncFake({
    userId: "user-skipped",
    linkedRows: [{ source: "lichess", username: "Magnus", last_synced_at: since }],
  });
  state.server = client;
  setSyncLoadersForTest({
    lichess: async (_username, sinceMs) => {
      seenSince.push(sinceMs);
      const malformed = { ...game("bad", Date.parse("2026-10-22T00:00:00.000Z")), pgn: "" };
      return pgn === "" ? [malformed] : [game("fixed", Date.parse("2026-10-22T00:00:00.000Z"))];
    },
  });
  const first = await POST(post());
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { imported: 0, accounts: [{ source: "lichess", imported: 0 }] });
  assert.equal(store.updates.length, 0);

  // Same store, same linked cursor: the second sync sees the same `since`
  // (fresh IPs — the shared in-memory limiter counts every POST per user).
  pgn = "1. e4 e5";
  const second = await POST(post(nextTestIp()));
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { imported: 1, accounts: [{ source: "lichess", imported: 1 }] });
  assert.deepEqual(seenSince, [Date.parse(since), Date.parse(since)]);
  assert.equal((store.updates as Array<Record<string, unknown>>).length, 1);
  assert.deepEqual((store.updates[0]?.attrs as Record<string, string>).last_synced_at, "2026-10-22T00:00:00.000Z");
});
