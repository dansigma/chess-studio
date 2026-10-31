// SIG-1089: unit tests for the my_games loader. The fake client casts to
// `SupabaseClient<Database>` (structural hand-rolled chain, same grain as
// `linked-accounts.test.ts`); assertions run against the recorded calls.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types.ts";
import type { PlayerGame } from "@/src/lib/player-types.ts";
import { playerGameToRow } from "./game-row.ts";
import { loadCappedMyGames, loadMyGames, myGamesRowToPlayerGame, type MyGamesRow } from "./load-games.ts";

type Row = Record<string, unknown>;

function baseRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "row-1",
    user_id: "user-1",
    source: "lichess",
    external_id: "game-1",
    played_at: "2026-10-20T12:00:00.000Z",
    color: "white",
    result: "win",
    time_class: "blitz",
    white: "Magnus",
    black: "Hikaru",
    white_elo: 2800,
    black_elo: 2790,
    eco: "C50",
    opening: "Italian Game",
    ply_count: 2,
    pgn: '[White "Magnus"]\n\n1. e4 e5 *',
    created_at: "2026-10-20T12:00:00.000Z",
    rated: true,
    ...overrides,
  };
}

function createFakeClient(options: {
  userId?: string | null;
  store?: Row[];
  selectError?: unknown;
  authError?: unknown;
} = {}): {
  client: SupabaseClient<Database>;
  calls: {
    from: string[];
    orders: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }>;
    ranges: Array<[number, number]>;
  };
} {
  const calls = {
    from: [] as string[],
    orders: [] as Array<{ column: string; ascending: boolean; nullsFirst?: boolean }>,
    ranges: [] as Array<[number, number]>,
  };
  // `store` is the full ordered table (newest first, nulls last, id
  // tiebreaker) — the fake pages through the same windows the real
  // offset query would, so multi-page tests assert real continuation.
  const store = options.store ?? [];
  const failSelect = options.selectError ?? null;
  const failAuth = options.authError ?? null;
  const query = {
    order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
      calls.orders.push({
        column,
        ascending: options?.ascending ?? true,
        nullsFirst: options?.nullsFirst,
      });
      return query;
    },
    range(from: number, to: number) {
      calls.ranges.push([from, to]);
      // PostgREST `range()` is inclusive on both ends.
      const slice = store.slice(from, to + 1);
      return Promise.resolve({ data: failSelect ? null : slice, error: failSelect });
    },
    then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
      return resolve({ data: failSelect ? null : store, error: failSelect });
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
        select() {
          return query;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("myGamesRowToPlayerGame", () => {
  it("maps a full row to a PlayerGame importPlayerGame accepts", () => {
    const game = myGamesRowToPlayerGame(baseRow() as unknown as MyGamesRow);
    assert.deepEqual(game, {
      id: "game-1",
      rowId: "row-1",
      winner: "white",
      whiteName: "Magnus",
      whiteRating: 2800,
      blackName: "Hikaru",
      blackRating: 2790,
      year: 2026,
      month: 10,
      event: null,
      eco: "C50",
      opening: "Italian Game",
      pgn: '[White "Magnus"]\n\n1. e4 e5 *',
      moves: undefined,
      timeClass: "blitz",
      // SIG-1048: rated round-trips; old rows carry null.
      rated: true,
      color: "white",
      playerResult: "win",
      playedAt: Date.parse("2026-10-20T12:00:00.000Z"),
      userAccuracy: null,
      opponentAccuracy: null,
      reviewedAt: null,
      mistakeCounts: null,
    });
  });

  it("derives the winner from color and result", () => {
    const cases: Array<{ color: string; result: string | null; winner: PlayerGame["winner"] }> = [
      { color: "white", result: "win", winner: "white" },
      { color: "white", result: "loss", winner: "black" },
      { color: "black", result: "win", winner: "black" },
      { color: "black", result: "loss", winner: "white" },
      { color: "white", result: "draw", winner: "draw" },
      { color: "black", result: null, winner: null },
    ];
    for (const { color, result, winner } of cases) {
      const game = myGamesRowToPlayerGame(
        baseRow({ color, result }) as unknown as MyGamesRow,
      );
      assert.equal(game?.winner, winner, `${color}/${result}`);
      assert.equal(game?.color, color);
      assert.equal(game?.playerResult, result);
    }
  });

  it("maps null played_at, names, ratings and opening to nulls", () => {
    const game = myGamesRowToPlayerGame(
      baseRow({ played_at: null, white: null, black: null, white_elo: null, opening: null, rated: null }) as unknown as MyGamesRow,
    );
    assert.equal(game?.playedAt, null);
    assert.equal(game?.year, null);
    assert.equal(game?.month, null);
    assert.equal(game?.whiteName, "?");
    assert.equal(game?.whiteRating, null);
    assert.equal(game?.opening, null);
    assert.equal(game?.rowId, "row-1");
    assert.equal(game?.rated, null);
  });

  it("maps review summary columns, preserving nulls", () => {
    const game = myGamesRowToPlayerGame(
      baseRow({
        user_accuracy: 82.5,
        opponent_accuracy: 77.25,
        reviewed_at: "2026-10-22T10:00:00.000Z",
      }) as unknown as MyGamesRow,
    );
    assert.equal(game?.userAccuracy, 82.5);
    assert.equal(game?.opponentAccuracy, 77.25);
    assert.equal(game?.reviewedAt, "2026-10-22T10:00:00.000Z");
  });

  it("maps valid mistake_counts into MistakeCounts", () => {
    const mistakeCounts = {
      opening: { inaccuracy: 1, mistake: 0, miss: 2, blunder: 0 },
      middlegame: { inaccuracy: 0, mistake: 1, miss: 0, blunder: 1 },
      endgame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
    };
    const game = myGamesRowToPlayerGame(
      baseRow({ mistake_counts: mistakeCounts }) as unknown as MyGamesRow,
    );
    assert.deepEqual(game?.mistakeCounts, mistakeCounts);
  });

  it("maps malformed mistake_counts to null without throwing", () => {
    const malformed = [
      "not-an-object",
      42,
      ["opening"],
      { opening: "nope" },
      { opening: null, middlegame: null, endgame: null },
      // Missing one tier in the opening phase.
      {
        opening: { inaccuracy: 1, mistake: 0, miss: 0 },
        middlegame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
        endgame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
      },
      // Negative and non-finite counts fail closed.
      {
        opening: { inaccuracy: -1, mistake: 0, miss: 0, blunder: 0 },
        middlegame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
        endgame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
      },
      {
        opening: { inaccuracy: Number.NaN, mistake: 0, miss: 0, blunder: 0 },
        middlegame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
        endgame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
      },
    ];
    for (const mistakeCounts of malformed) {
      const game = myGamesRowToPlayerGame(
        baseRow({ mistake_counts: mistakeCounts }) as unknown as MyGamesRow,
      );
      assert.equal(game?.mistakeCounts, null, JSON.stringify(mistakeCounts));
    }
    // Unknown extra keys are ignored, not rejected.
    const withExtras = myGamesRowToPlayerGame(
      baseRow({
        mistake_counts: {
          opening: { inaccuracy: 1, mistake: 0, miss: 0, blunder: 0, blunder2: 9 },
          middlegame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
          endgame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
          endgame2: { inaccuracy: 5, mistake: 5, miss: 5, blunder: 5 },
        },
      }) as unknown as MyGamesRow,
    );
    assert.deepEqual(withExtras?.mistakeCounts, {
      opening: { inaccuracy: 1, mistake: 0, miss: 0, blunder: 0 },
      middlegame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
      endgame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
    });
  });

  it("defaults null color to white and skips empty ids or pgn", () => {
    const nulled = myGamesRowToPlayerGame(baseRow({ color: null }) as unknown as MyGamesRow);
    assert.equal(nulled?.color, "white");
    assert.equal(nulled?.winner, "white");
    assert.equal(myGamesRowToPlayerGame(baseRow({ external_id: "" }) as unknown as MyGamesRow), null);
    assert.equal(myGamesRowToPlayerGame(baseRow({ pgn: "   " }) as unknown as MyGamesRow), null);
  });

  it("round-trips playerGameToRow back into an openable PlayerGame", () => {
    const source: PlayerGame = {
      id: "abc123",
      winner: "black",
      whiteName: "Magnus",
      whiteRating: 2800,
      blackName: "Hikaru",
      blackRating: 2790,
      year: 2026,
      month: 10,
      event: "Lichess",
      eco: "C50",
      opening: "Italian Game",
      pgn: '[White "Magnus"]\n\n1. e4 e5 *',
      moves: "e4 e5",
      timeClass: "blitz",
      color: "black",
      playerResult: "win",
      playedAt: 1_700_000_000_000,
    };
    const row = playerGameToRow("user-1", "lichess", source);
    assert.ok(row, "row must survive the forward mapping");
    const game = myGamesRowToPlayerGame({ ...row, id: "row-1", created_at: "" } as unknown as MyGamesRow);
    assert.ok(game, "game must survive the inverse mapping");
    assert.ok(game?.pgn && game.pgn.length > 0, "importPlayerGame needs a non-empty pgn");
    assert.ok(game?.color === "white" || game?.color === "black", "importPlayerGame needs a valid color");
    assert.equal(game?.playerResult, source.playerResult, "playerResult survives the round trip");
    assert.equal(game?.playedAt, source.playedAt, "playedAt survives the round trip");
  });
});

describe("loadMyGames", () => {
  it("returns the first page newest-first with no cursor when short", async () => {
    const { client, calls } = createFakeClient({
      store: [baseRow({ played_at: "2026-10-20T12:00:00.000Z" }), baseRow({ external_id: "game-2", played_at: "2026-10-19T12:00:00.000Z" })],
    });
    const result = await loadMyGames(client, { limit: 50 });
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.ok ? result.page.games.map((game) => game.id) : [],
      ["game-1", "game-2"],
    );
    assert.equal(result.ok && result.page.hasMore, false);
    assert.equal(result.ok && result.page.cursor, null);
    assert.deepEqual(calls.orders, [
      { column: "played_at", ascending: false, nullsFirst: false },
      { column: "id", ascending: true, nullsFirst: undefined },
    ]);
    assert.deepEqual(calls.ranges, [[0, 50]]);
  });

  it("over-fetches by one to detect more pages and cursors on the next offset", async () => {
    const { client, calls } = createFakeClient({
      store: [
        baseRow({ played_at: "2026-10-20T12:00:00.000Z" }),
        baseRow({ external_id: "game-2", played_at: "2026-10-19T12:00:00.000Z" }),
        baseRow({ external_id: "game-3", played_at: "2026-10-18T12:00:00.000Z" }),
      ],
    });
    const result = await loadMyGames(client, { limit: 2 });
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.ok ? result.page.games.map((game) => game.id) : [],
      ["game-1", "game-2"],
    );
    assert.equal(result.ok && result.page.hasMore, true);
    assert.equal(result.ok && result.page.cursor, "2");
    assert.deepEqual(calls.ranges, [[0, 2]], "queries the offset window limit+1");
  });

  it("walks the whole list page by page through the cursor", async () => {
    const store = [
      baseRow({ id: "row-1", external_id: "game-1", played_at: "2026-10-20T12:00:00.000Z" }),
      baseRow({ id: "row-2", external_id: "game-2", played_at: "2026-10-19T12:00:00.000Z" }),
      baseRow({ id: "row-3", external_id: "game-3", played_at: "2026-10-18T12:00:00.000Z" }),
    ];
    const client = createFakeClient({ store }).client;
    const first = await loadMyGames(client, { limit: 2 });
    assert.equal(first.ok, true);
    assert.deepEqual(
      first.ok ? first.page.games.map((game) => game.id) : [],
      ["game-1", "game-2"],
    );
    const before = first.ok ? first.page.cursor : null;
    assert.equal(before, "2");
    const second = await loadMyGames(client, { limit: 2, before });
    assert.equal(second.ok, true);
    assert.deepEqual(
      second.ok ? second.page.games.map((game) => game.id) : [],
      ["game-3"],
    );
    assert.equal(second.ok && second.page.hasMore, false);
    assert.equal(second.ok && second.page.cursor, null);
  });

  it("never strands rows after a null-timestamp row mid-list", async () => {
    const store = [
      baseRow({ id: "row-1", external_id: "game-1", played_at: "2026-10-20T12:00:00.000Z" }),
      baseRow({ id: "row-2", external_id: "game-2", played_at: null }),
      baseRow({ id: "row-3", external_id: "game-3", played_at: "2026-10-18T12:00:00.000Z" }),
    ];
    const client = createFakeClient({ store }).client;
    const first = await loadMyGames(client, { limit: 2 });
    assert.equal(first.ok, true);
    assert.deepEqual(
      first.ok ? first.page.games.map((game) => game.id) : [],
      ["game-1", "game-2"],
      "null-timestamp rows stay in the list",
    );
    assert.equal(first.ok && first.page.hasMore, true);
    const before = first.ok ? first.page.cursor : null;
    assert.ok(before !== null, "a full page with null timestamps still paginates");
    const second = await loadMyGames(client, { limit: 2, before });
    assert.equal(second.ok, true);
    assert.deepEqual(
      second.ok ? second.page.games.map((game) => game.id) : [],
      ["game-3"],
      "rows after the null row are still reachable",
    );
  });

  it("rejects an invalid cursor instead of querying", async () => {
    const { client, calls } = createFakeClient({ store: [] });
    assert.deepEqual(await loadMyGames(client, { limit: 50, before: "not-an-offset" }), {
      ok: false,
      error: "unavailable",
    });
    assert.deepEqual(calls.from, [], "no request on an invalid cursor");
    assert.deepEqual(calls.ranges, [], "no range query on an invalid cursor");
  });

  it("requires a signed-in user before any request", async () => {
    const { client, calls } = createFakeClient({ userId: null });
    const result = await loadMyGames(client);
    assert.deepEqual(result, { ok: false, error: "signed_out" });
    assert.deepEqual(calls.from, [], "no request without a user");
  });

  it("maps query errors to unavailable", async () => {
    const { client } = createFakeClient({ selectError: new Error("denied") });
    assert.deepEqual(await loadMyGames(client), { ok: false, error: "unavailable" });
  });
});

describe("loadCappedMyGames", () => {
  function bigStore(count: number): Row[] {
    const base = Date.parse("2026-10-20T12:00:00.000Z");
    return Array.from({ length: count }, (_, index) =>
      baseRow({
        id: `row-${index + 1}`,
        external_id: `game-${index + 1}`,
        played_at: new Date(base - index * 60_000).toISOString(),
      }),
    );
  }

  it("loads a 3,005-game library in ceil(3000/50) = 60 requests (cap applies)", async () => {
    const { client, calls } = createFakeClient({ store: bigStore(3005) });
    const result = await loadCappedMyGames(client, { limit: 50, maxGames: 3000 });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.games.length, 3000, "capped at 3000 games");
    assert.equal(result.ok && result.cancelled, false);
    assert.equal(calls.ranges.length, 60, "one request per page, no duplication");
  });

  it("stops paging once cancelled instead of loading every page", async () => {
    const { client, calls } = createFakeClient({ store: bigStore(500) });
    let pages = 0;
    const result = await loadCappedMyGames(client, {
      limit: 50,
      maxGames: 3000,
      isCancelled: () => {
        pages += 1;
        return pages >= 2;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.cancelled, true);
    assert.equal(calls.ranges.length, 2, "no requests after cancellation");
  });

  it("maps page errors to unavailable", async () => {
    const { client } = createFakeClient({ selectError: new Error("denied") });
    assert.deepEqual(await loadCappedMyGames(client, { limit: 50, maxGames: 3000 }), {
      ok: false,
      error: "unavailable",
    });
  });
});
