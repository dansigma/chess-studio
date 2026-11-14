// SIG-1341: pure main-openings aggregate for the Library player dossier.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerGame } from "@/src/lib/player-types.ts";
import { dossierOpenings } from "./dossier-openings.ts";

function game(overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id: "g1",
    winner: null,
    whiteName: "Player",
    whiteRating: null,
    blackName: "Other",
    blackRating: null,
    year: null,
    month: null,
    event: null,
    eco: null,
    opening: null,
    color: "white",
    playerResult: null,
    playedAt: null,
    ...overrides,
  };
}

function byKey(rows: ReturnType<typeof dossierOpenings>) {
  return new Map(rows.map((row) => [row.key, row]));
}

describe("dossierOpenings", () => {
  it("groups by name, then ECO, then the first two moves", () => {
    const white: PlayerGame[] = [
      game({ id: "i1", opening: "Italian Game", eco: "C50", year: 2020, playerResult: "win", moves: "e4 e5 Nf3" }),
      game({
        id: "i2",
        opening: "italian game",
        eco: "c50",
        playedAt: Date.UTC(2023, 5, 1),
        playerResult: "draw",
        moves: "e4 e5 Bc4",
      }),
      game({ id: "i3", opening: "Italian Game", year: 2022, playerResult: null, moves: "e4 e5 Nf3 Nc6" }),
      game({ id: "e1", eco: " c65 ", playedAt: Date.UTC(2024, 0, 1), playerResult: "win", moves: "d4 d5 c4" }),
      game({ id: "e2", opening: "   ", eco: "C65", playedAt: Date.UTC(2024, 6, 1), playerResult: "loss", moves: "d4 d5 e3" }),
      game({ id: "m1", year: 2019, playerResult: "loss", moves: "c4 e5 Nf3" }),
      game({ id: "m2", moves: "c4 e5 Nc6", year: 2018, playerResult: "draw" }),
      // No name, no ECO, no moves: skipped, but still counts in the share denominator.
      game({ id: "none" }),
      game({ id: "black1", color: "black", opening: "French Defense", playerResult: "win" }),
    ];

    const rows = dossierOpenings(white, "white");
    assert.deepEqual(
      rows.map((row) => row.key),
      ["italian game", "C65", "c4 e5"],
    );

    const italian = byKey(rows).get("italian game");
    assert.ok(italian);
    assert.equal(italian.opening, "Italian Game");
    assert.equal(italian.eco, "C50");
    assert.equal(italian.games, 3);
    // 3 of 8 white games (the black game and the empty-key game do not inflate it).
    assert.equal(italian.sharePct, 38);
    assert.equal(italian.wins, 1);
    assert.equal(italian.draws, 1);
    assert.equal(italian.losses, 0);
    // (1 + 0.5) / 3 = 50; the null result counts as a game with 0 points.
    assert.equal(italian.scorePct, 50);
    // Latest `year` wins, else the UTC year of `playedAt`.
    assert.equal(italian.lastYear, 2023);
    assert.deepEqual(italian.line, ["e4", "e5", "Nf3"]);

    const eco = byKey(rows).get("C65");
    assert.ok(eco);
    assert.equal(eco.opening, null);
    assert.equal(eco.eco, "C65");
    assert.equal(eco.games, 2);
    assert.equal(eco.sharePct, 25);
    assert.equal(eco.scorePct, 50);
    assert.equal(eco.lastYear, 2024);
    assert.deepEqual(eco.line, ["d4", "d5"]);

    const moves = byKey(rows).get("c4 e5");
    assert.ok(moves);
    assert.equal(moves.opening, null);
    assert.equal(moves.eco, null);
    assert.equal(moves.games, 2);
    assert.equal(moves.sharePct, 25);
    // (0 + 0.5) / 2 = 25.
    assert.equal(moves.scorePct, 25);
    assert.equal(moves.lastYear, 2019);
    assert.deepEqual(moves.line, ["c4", "e5"]);
  });

  it("chooses the most frequent spelling, ties alphabetically", () => {
    const rows = dossierOpenings(
      [
        game({ id: "a", opening: "Sicilian Defense" }),
        game({ id: "b", opening: "sicilian defense" }),
        game({ id: "c", opening: "Sicilian Defense" }),
        game({ id: "d", opening: "Ruy Lopez" }),
        game({ id: "e", opening: "Ruy Lopez" }),
        game({ id: "f", opening: "Dutch Defense" }),
        game({ id: "g", opening: "dutch defense" }),
      ],
      "white",
    );
    assert.equal(byKey(rows).get("sicilian defense")?.opening, "Sicilian Defense");
    assert.equal(byKey(rows).get("ruy lopez")?.opening, "Ruy Lopez");
    assert.equal(byKey(rows).get("dutch defense")?.opening, "Dutch Defense");
  });

  it("keeps the longest prefix shared by 60% of the group and caps it at 12 plies", () => {
    const long = "a b c d e f g h i j k l m n";
    const rows = dossierOpenings(
      [
        game({ id: "l1", opening: "Long", moves: long }),
        game({ id: "l2", opening: "Long", moves: long }),
        game({ id: "s1", opening: "Split", moves: "e4 e5" }),
        game({ id: "s2", opening: "Split", moves: "d4 d5" }),
        game({ id: "s3", opening: "Split", moves: "c4 c5" }),
        game({ id: "h1", opening: "Half", moves: "e4 e5 Nf3" }),
        game({ id: "h2", opening: "Half", moves: "e4 c5 Nc6" }),
        game({ id: "n1", opening: "No Moves" }),
      ],
      "white",
    );
    const map = byKey(rows);
    assert.deepEqual(map.get("long")?.line, long.split(" ").slice(0, 12));
    // 1/3 each is below 60%, but the line keeps its first ply (alphabetical tie-break).
    assert.deepEqual(map.get("split")?.line, ["c4"]);
    // e4 is in both games; the second move is only in one, so the line stops there.
    assert.deepEqual(map.get("half")?.line, ["e4"]);
    assert.deepEqual(map.get("no moves")?.line, []);
  });

  it("drops groups under minGames but keeps the share computed before the filter", () => {
    const games = [
      game({ id: "a1", opening: "Alpha" }),
      game({ id: "a2", opening: "Alpha" }),
      game({ id: "a3", opening: "Alpha" }),
      game({ id: "b1", opening: "Beta" }),
      game({ id: "b2", opening: "Beta" }),
    ];
    assert.deepEqual(
      dossierOpenings(games, "white", { minGames: 3 }).map((row) => [row.key, row.sharePct]),
      [["alpha", 60]],
    );
    assert.deepEqual(
      dossierOpenings(games, "white", { minGames: 1 }).map((row) => row.key),
      ["alpha", "beta"],
    );
    assert.deepEqual(dossierOpenings(games, "black"), []);
  });

  it("sorts by games desc, then key asc", () => {
    const rows = dossierOpenings(
      [
        game({ id: "z1", opening: "Zeta" }),
        game({ id: "z2", opening: "Zeta" }),
        game({ id: "a1", opening: "Alpha" }),
        game({ id: "b1", opening: "Beta" }),
      ],
      "white",
    );
    assert.deepEqual(
      rows.map((row) => row.key),
      ["zeta", "alpha", "beta"],
    );
  });
});
