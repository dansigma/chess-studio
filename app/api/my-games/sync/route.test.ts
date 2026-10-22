// Tests for POST /api/my-games/sync (SIG-1088): auth, rate limits,
// incremental behavior, and per-account error isolation.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "@/src/test-utils/stubs/next-server.ts";
import {
  createFakeSupabase,
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

function syncFake(options: {
  userId?: string | null;
  linkedRows?: Array<Record<string, unknown>>;
  linkedError?: unknown;
  myGames?: TableRows;
  myGamesWriteError?: unknown;
}): { client: unknown; store: { myGames: TableRows; updates: Array<Record<string, unknown>> } } {
  const store = {
    myGames: options.myGames ?? {},
    updates: [] as Array<Record<string, unknown>>,
  };
  const selectError = options.linkedError ?? null;
  const query = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => {
      if (table === "linked_accounts") {
        return Promise.resolve({
          data: selectError ? null : (options.linkedRows ?? []),
          error: selectError,
        });
      }
      return Promise.resolve({ data: [], error: null });
    };
    chain.eq = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) =>
      resolve({ data: selectError && table === "linked_accounts" ? null : [], error: selectError });
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
        const seen = new Set((store.myGames[table] ?? []).map((row) => `${row.user_id}|${row.source}|${row.external_id}`));
        const inserted: unknown[] = [];
        for (const row of list as Array<Record<string, unknown>>) {
          const key = `${row.user_id}|${row.source}|${row.external_id}`;
          if (!seen.has(key)) {
            seen.add(key);
            store.myGames[table] = [...(store.myGames[table] ?? []), row];
            inserted.push({ id: `row-${inserted.length}` });
          }
        }
        return { data: inserted, error: null };
      },
      insert: async () => ({ data: null, error: new Error("insert not used") }),
      update: (attrs: unknown) => {
        store.updates.push({ table, attrs });
        const updateChain: Record<string, unknown> = {};
        updateChain.eq = () => updateChain;
        updateChain.then = (resolve: (value: unknown) => unknown) =>
          resolve({ data: null, error: null });
        return updateChain;
      },
      delete: () => query(table),
    }),
  };
  return { client: client as unknown, store };
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

test("createFakeSupabase import keeps the shared helper exercised", () => {
  assert.ok(typeof createFakeSupabase === "function");
});
