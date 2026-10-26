// SIG-1029: studio results depend on the caller's session and must never be
// shared through the process-wide games cache; lichess caching is unchanged.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import type { PlayerGame, PlayerHit } from "@/src/lib/player-types.ts";

function hit(id: string, source: PlayerHit["source"]): PlayerHit {
  return { id, source, username: id, displayName: id, subtitle: source };
}

const state = {
  viewer: "A",
  studioCalls: 0,
  lichessCalls: 0,
  studioCount: 1,
  failLichess: false,
  failChesscom: false,
  failStudio: false,
};

function game(id: string, playedAt: number): PlayerGame {
  return {
    id,
    winner: null,
    whiteName: "w",
    whiteRating: null,
    blackName: "b",
    blackRating: null,
    year: null,
    month: null,
    event: null,
    eco: null,
    opening: null,
    color: "white",
    playerResult: null,
    playedAt,
  };
}

mock.module("@/src/lib/players/studio.ts", {
  namedExports: {
    searchStudioDatabase: async () => {
      if (state.failStudio) {
        throw new Error("studio down");
      }
      return [hit("studio:club-night", "studio")];
    },
    studioGames: async () => {
      state.studioCalls += 1;
      if (state.studioCount > 1) {
        return Array.from({ length: state.studioCount }, (_, i) => game(`s${i}`, i));
      }
      return [game(`private-${state.viewer}`, 1)];
    },
  },
});
mock.module("@/src/lib/players/lichess.ts", {
  namedExports: {
    searchLichess: async () => {
      if (state.failLichess) {
        throw new Error("lichess down");
      }
      return [hit("lichess:hikaru", "lichess")];
    },
    lichessGames: async () => {
      state.lichessCalls += 1;
      return [game("li1", 1)];
    },
  },
});
mock.module("@/src/lib/players/chesscom.ts", {
  namedExports: {
    searchChesscom: async () => {
      if (state.failChesscom) {
        throw new Error("chesscom down");
      }
      return [hit("chesscom:hikaru", "chesscom")];
    },
    chesscomGames: async () => [],
  },
});
mock.module("@/src/lib/players/fide.ts", { namedExports: { searchFidePlayers: async () => [] } });

const { loadPlayerGames, searchPlayers } = await import("@/src/lib/players-server.ts");

test("studio games are never shared between sessions", async () => {
  state.viewer = "A";
  const a = await loadPlayerGames("studio", "Carlsen");
  state.viewer = "B";
  const b = await loadPlayerGames("studio", "Carlsen");
  assert.deepEqual(a.games.map((g) => g.id), ["private-A"]);
  assert.deepEqual(b.games.map((g) => g.id), ["private-B"]);
  assert.equal(state.studioCalls, 2);
});

test("studio results are capped at MAX_PLAYER_GAMES", async () => {
  state.studioCount = 150;
  const res = await loadPlayerGames("studio", "Capped");
  state.studioCount = 1;
  assert.equal(res.games.length, 80);
  assert.equal(res.truncated, true);
  assert.equal(res.notice, "Showing the 80 most recent Studio games.");
  assert.equal(res.games[0].id, "s149", "most recent kept");
});

test("lichess results are still cached", async () => {
  await loadPlayerGames("lichess", "Hikaru");
  const again = await loadPlayerGames("lichess", "hikaru", "Hikaru N");
  assert.equal(state.lichessCalls, 1);
  assert.equal(again.player.displayName, "Hikaru N");
});

test("searchPlayers merges all sources with no failures", async () => {
  state.failLichess = false;
  state.failChesscom = false;
  state.failStudio = false;
  const result = await searchPlayers("hikaru");
  assert.deepEqual(result.failedSources, []);
  assert.deepEqual(
    result.players.map((player) => player.id),
    ["studio:club-night", "chesscom:hikaru", "lichess:hikaru"],
  );
});

test("searchPlayers reports the one source that failed", async () => {
  state.failLichess = true;
  state.failChesscom = false;
  state.failStudio = false;
  try {
    const result = await searchPlayers("hikaru");
    assert.deepEqual(result.failedSources, ["lichess"]);
    assert.deepEqual(
      result.players.map((player) => player.id),
      ["studio:club-night", "chesscom:hikaru"],
    );
  } finally {
    state.failLichess = false;
  }
});

test("searchPlayers reports all three sources when every source fails", async () => {
  state.failLichess = true;
  state.failChesscom = true;
  state.failStudio = true;
  try {
    const result = await searchPlayers("hikaru");
    assert.deepEqual(result.players, []);
    assert.deepEqual(result.failedSources, ["lichess", "chesscom", "studio"]);
  } finally {
    state.failLichess = false;
    state.failChesscom = false;
    state.failStudio = false;
  }
});

test("searchPlayers returns empty without failures for short queries", async () => {
  const result = await searchPlayers("x");
  assert.deepEqual(result, { players: [], failedSources: [] });
});
