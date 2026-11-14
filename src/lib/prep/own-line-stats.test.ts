// SIG-1345: the user's own results in a dossier opening line.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlayerGame } from "@/src/lib/player-types";
import { ownLineStats } from "./own-line-stats.ts";

function game(id: string, overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id,
    winner: null,
    whiteName: "User",
    whiteRating: null,
    blackName: "Other",
    blackRating: null,
    year: 2024,
    month: 1,
    event: null,
    eco: null,
    opening: "Italian Game",
    color: "white",
    playerResult: "win",
    playedAt: Date.UTC(2024, 0, 1),
    moves: "e4 e5 Nf3",
    ...overrides,
  };
}

function reviewed(overrides: Partial<PlayerGame> = {}): PlayerGame {
  return game("reviewed", {
    reviewedAt: "2024-01-02",
    userAccuracy: 71,
    mistakeCounts: {
      opening: { inaccuracy: 1, mistake: 2, miss: 1, blunder: 0 },
      middlegame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 5 },
      endgame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
    },
    ...overrides,
  });
}

test("uses the opposite colour: the user's Black games match a White player's line", () => {
  const games = [
    game("b1", { color: "black", playerResult: "win", moves: "e4 e5 Nf3 Nc6" }),
    game("w1", { color: "white", playerResult: "loss", moves: "e4 e5 Nf3 Nc6" }),
  ];
  assert.deepEqual(ownLineStats(games, ["e4", "e5", "Nf3"], "black"), {
    games: 1,
    scorePct: 100,
    avgAccuracy: null,
    openingMistakes: null,
  });
  assert.equal(ownLineStats(games, ["e4", "e5", "Nf3"], "white")?.scorePct, 0);
});

test("matches by move prefix, not by opening name", () => {
  const games = [
    game("a", { opening: "Italian Game", moves: "e4 e5 Nf3" }),
    game("b", { opening: "Italian Game", moves: "e4 e5 Bc4" }),
    game("c", { opening: "Sicilian Defense", moves: "e4 c5 Nf3" }),
  ];
  assert.equal(ownLineStats(games, ["e4", "e5"], "white")?.games, 2);
  assert.equal(ownLineStats(games, ["e4", "c5"], "white")?.games, 1);
  // A longer line than the game's moves is not a prefix match.
  assert.equal(ownLineStats(games, ["e4", "e5", "Nf3", "Nc6"], "white"), null);
});

test("no game of that colour in the line yields null", () => {
  assert.equal(ownLineStats([], ["e4"], "white"), null);
  assert.equal(ownLineStats([game("x", { moves: "d4 d5" })], ["e4"], "white"), null);
  assert.equal(ownLineStats([game("x")], [], "white"), null);
});

test("score counts wins and draws, and null results as zero points", () => {
  const games = [
    game("w", { playerResult: "win" }),
    game("d", { playerResult: "draw" }),
    game("l", { playerResult: "loss" }),
    game("n", { playerResult: null }),
  ];
  assert.deepEqual(ownLineStats(games, ["e4", "e5", "Nf3"], "white"), {
    games: 4,
    scorePct: 38,
    avgAccuracy: null,
    openingMistakes: null,
  });
});

test("unreviewed games leave accuracy and opening mistakes null", () => {
  const stats = ownLineStats([game("a"), game("b", { playerResult: "draw" })], ["e4"], "white");
  assert.equal(stats?.games, 2);
  assert.equal(stats?.scorePct, 75);
  assert.equal(stats?.avgAccuracy, null);
  assert.equal(stats?.openingMistakes, null);
});

test("accuracy comes from reviewed games only (SIG-1345 review)", () => {
  // A game can carry `userAccuracy` without `reviewedAt`; it must not join the
  // average while its mistakes are excluded.
  const games = [reviewed({ id: "r1", userAccuracy: 70 }), game("plain", { userAccuracy: 95 })];
  const stats = ownLineStats(games, ["e4", "e5"], "white");
  assert.equal(stats?.games, 2);
  assert.equal(stats?.avgAccuracy, 70);
});

test("reviewed games average accuracy and sum only the opening-phase tiers", () => {
  const games = [
    reviewed({ id: "r1", userAccuracy: 70 }),
    reviewed({
      id: "r2",
      userAccuracy: 80,
      mistakeCounts: {
        opening: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 2 },
        middlegame: { inaccuracy: 9, mistake: 9, miss: 9, blunder: 9 },
        endgame: { inaccuracy: 9, mistake: 9, miss: 9, blunder: 9 },
      },
    }),
    game("plain"),
  ];
  assert.deepEqual(ownLineStats(games, ["e4", "e5"], "white"), {
    games: 3,
    scorePct: 100,
    avgAccuracy: 75,
    openingMistakes: 6,
  });
});

test("a reviewed game without counts shows zero opening mistakes, not null", () => {
  const stats = ownLineStats([reviewed({ mistakeCounts: null })], ["e4"], "white");
  assert.equal(stats?.avgAccuracy, 71);
  assert.equal(stats?.openingMistakes, 0);
});
