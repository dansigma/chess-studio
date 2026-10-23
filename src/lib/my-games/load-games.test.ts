// SIG-1089: unit tests for the my_games loader. The fake client casts to
// `SupabaseClient<Database>` (structural hand-rolled chain, same grain as
// `linked-accounts.test.ts`); assertions run against the recorded calls.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types.ts";
import type { PlayerGame } from "@/src/lib/player-types.ts";
import { playerGameToRow } from "./game-row.ts";
import { loadMyGames, myGamesRowToPlayerGame, type MyGamesRow } from "./load-games.ts";

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
    ...overrides,
  };
}

function createFakeClient(options: {
  userId?: string | null;
  rows?: Row[];
  selectError?: unknown;
  authError?: unknown;
} = {}): {
  client: SupabaseClient<Database>;
  calls: { from: string[]; lt: Array<[string, string]>; limit: Array<number | undefined> };
} {
  const calls = { from: [] as string[], lt: [] as Array<[string, string]>, limit: [] as Array<number | undefined> };
  const rows = options.rows ?? [];
  const failSelect = options.selectError ?? null;
  const failAuth = options.authError ?? null;
  const query = {
    lt(col: string, val: string) {
      calls.lt.push([col, val]);
      return query;
    },
    limit(n?: number) {
      calls.limit.push(n);
      return Promise.resolve({ data: failSelect ? null : rows, error: failSelect });
    },
    order() {
      return query;
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
      color: "white",
      playerResult: "win",
      playedAt: Date.parse("2026-10-20T12:00:00.000Z"),
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
      baseRow({ played_at: null, white: null, black: null, white_elo: null, opening: null }) as unknown as MyGamesRow,
    );
    assert.equal(game?.playedAt, null);
    assert.equal(game?.year, null);
    assert.equal(game?.month, null);
    assert.equal(game?.whiteName, "?");
    assert.equal(game?.whiteRating, null);
    assert.equal(game?.opening, null);
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
    const { client } = createFakeClient({
      rows: [baseRow({ played_at: "2026-10-20T12:00:00.000Z" }), baseRow({ external_id: "game-2", played_at: "2026-10-19T12:00:00.000Z" })],
    });
    const result = await loadMyGames(client, { limit: 50 });
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.ok ? result.page.games.map((game) => game.id) : [],
      ["game-1", "game-2"],
    );
    assert.equal(result.ok && result.page.hasMore, false);
    assert.equal(result.ok && result.page.cursor, null);
  });

  it("over-fetches by one to detect more pages and cursors on the last played_at", async () => {
    const { client, calls } = createFakeClient({
      rows: [
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
    assert.equal(result.ok && result.page.cursor, "2026-10-19T12:00:00.000Z");
    assert.deepEqual(calls.limit, [3], "queries limit+1");
  });

  it("passes before as a played_at upper bound", async () => {
    const { client, calls } = createFakeClient({ rows: [] });
    await loadMyGames(client, { limit: 50, before: "2026-10-19T12:00:00.000Z" });
    assert.deepEqual(calls.lt, [["played_at", "2026-10-19T12:00:00.000Z"]]);
  });

  it("treats an all-null-timestamp page as terminal", async () => {
    const { client } = createFakeClient({
      rows: [baseRow({ played_at: null }), baseRow({ external_id: "game-2", played_at: null })],
    });
    const result = await loadMyGames(client, { limit: 1 });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.page.games.length, 1);
    assert.equal(result.ok && result.page.hasMore, false);
    assert.equal(result.ok && result.page.cursor, null);
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
