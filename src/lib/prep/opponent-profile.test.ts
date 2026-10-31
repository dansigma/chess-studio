// SIG-1100: fixture tests for the opponent-profile pure core. Every assertion
// is hand-computed from the 12-game fixture below (see plan
// `.artifacts/plans/issue-SIG-1100.md` Phase 1).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOpponentProfile } from "./opponent-profile.ts";
import type { PlayerGame } from "@/src/lib/player-types.ts";

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0, 0);

let counter = 0;

function fixtureGame(
  overrides: Partial<PlayerGame> & Pick<PlayerGame, "color" | "playerResult">,
): PlayerGame {
  counter += 1;
  return {
    id: `g${counter}`,
    winner: null,
    whiteName: "rival",
    whiteRating: 1500,
    blackName: "opp",
    blackRating: 1500,
    year: 2026,
    month: 10,
    event: "Lichess",
    eco: null,
    opening: null,
    playedAt: NOW,
    timeClass: "blitz",
    rated: true,
    ...overrides,
  };
}

function moves(color: PlayerGame["color"], line: string, result: PlayerGame["playerResult"]): PlayerGame {
  return fixtureGame({ color, moves: line, playerResult: result });
}

// 7 White games (w4 exercises the PGN-fallback path) + 5 Black games
// (b5 has no moves and counts in `gamesAnalyzed` only).
const GAMES: PlayerGame[] = [
  moves("white", "e4 e5 Nf3", "win"),
  moves("white", "e4 e5 Bc4", "draw"),
  moves("white", "e4 c5 Nf3", "loss"),
  fixtureGame({
    color: "white",
    playerResult: "win",
    pgn: '[White "rival"]\n[Black "opp"]\n\n1. d4 d5 2. c4 *',
  }),
  moves("white", "d4 Nf6 c4", "win"),
  moves("white", "e4 e5 Nf3 Nc6", "draw"),
  moves("white", "c4 e5", "loss"),
  moves("black", "e4 c5", "win"),
  moves("black", "e4 e5", "draw"),
  moves("black", "d4 d5", "loss"),
  moves("black", "d4 d5", "win"),
  fixtureGame({ color: "black", playerResult: "loss" }),
];

describe("buildOpponentProfile", () => {
  it("counts every supplied game in gamesAnalyzed, even move-less ones", () => {
    const profile = buildOpponentProfile(GAMES, NOW);
    assert.equal(profile.gamesAnalyzed, 12);
  });

  it("builds the White tree over the opponent's White games only", () => {
    const profile = buildOpponentProfile(GAMES, NOW);
    const root = profile.white;
    assert.equal(root.games, 7);
    assert.equal(root.wins, 3);
    assert.equal(root.draws, 2);
    assert.equal(root.losses, 2);
    // (3 + 2 / 2) / 7 = 4 / 7 = 57.14 -> 57.
    assert.equal(root.scorePct, 57);
    assert.equal(root.avgAccuracy, null);
    assert.deepEqual(
      root.children.map((c) => c.san),
      ["e4", "d4", "c4"],
    );
    const e4 = root.children.find((c) => c.san === "e4");
    assert.ok(e4);
    assert.equal(e4.games, 4);
    // (1 + 2 / 2) / 4 = 2 / 4 = 50.
    assert.equal(e4.scorePct, 50);
    assert.equal(e4.children.find((c) => c.san === "e5")?.games, 3);
    const d4 = root.children.find((c) => c.san === "d4");
    assert.ok(d4);
    assert.equal(d4.games, 2);
    assert.equal(d4.scorePct, 100);
    assert.deepEqual(root.trend.m1, { games: 7, scorePct: 57 });
  });

  it("builds the Black tree excluding the move-less game", () => {
    const profile = buildOpponentProfile(GAMES, NOW);
    const root = profile.black;
    assert.equal(root.games, 4);
    assert.equal(root.wins, 2);
    assert.equal(root.draws, 1);
    assert.equal(root.losses, 1);
    // (2 + 1 / 2) / 4 = 2.5 / 4 = 62.5 -> 63.
    assert.equal(root.scorePct, 63);
    // d4 x2 and e4 x2 tie on games; children sort alphabetically.
    assert.deepEqual(
      root.children.map((c) => c.san),
      ["d4", "e4"],
    );
  });

  it("aggregates most-played first moves and replies to 1.e4/1.d4", () => {
    const profile = buildOpponentProfile(GAMES, NOW);
    assert.deepEqual(profile.mostPlayed.white, [
      { san: "e4", games: 4 },
      { san: "d4", games: 2 },
      { san: "c4", games: 1 },
    ]);
    assert.deepEqual(profile.mostPlayed.black, [
      { san: "d5", games: 2 },
      { san: "c5", games: 1 },
      { san: "e5", games: 1 },
    ]);
  });
});
