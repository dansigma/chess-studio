// SIG-1334: coverage of an opponent's lines by the user's repertoire.
// Trees are built with `importSans` (main line = children[0] chain), the same
// shape repertoire boards carry.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importSans } from "@/src/chess/pgn.ts";
import type { GameTree } from "@/src/chess/tree.ts";
import type { PlayerGame } from "@/src/lib/player-types.ts";
import { lineCoverage, opponentGaps } from "./repertoire-coverage.ts";

function tree(line: string): GameTree {
  const imported = importSans(line.split(" ").filter(Boolean));
  assert.equal(imported.warnings.length, 0, `fixture failed to import: ${imported.warnings}`);
  return imported.tree;
}

function path(line: string): string[] {
  return line.split(" ").filter(Boolean);
}

// The user's White repertoire (answers an opponent playing Black) and the
// user's Black repertoire (answers an opponent playing White).
const WHITE_REP = tree("e4 e5 Nf3 Nc6 Bb5");
const BLACK_REP = tree("e4 e5 Nf3 Nc6 Bb5 a6");

describe("lineCoverage — opponent plays White (user's Black repertoire)", () => {
  const cover = (line: string) =>
    lineCoverage({ path: path(line), opponentColor: "white", repertoireTree: BLACK_REP });

  it("is covered when the repertoire answers every opponent move", () => {
    assert.deepEqual(cover("e4 e5 Nf3 Nc6"), { status: "covered" });
    assert.deepEqual(cover("e4 e5 Nf3 Nc6 Bb5 a6"), { status: "covered" });
  });

  it("is partial when the repertoire line ends before the opponent's move", () => {
    const result = cover("e4 e5 Nf3 Nc6 Bb5 a6 Ba4");
    assert.equal(result.status, "partial");
    assert.ok(result.status === "partial");
    assert.equal(result.reason, "line_ended");
    assert.equal(result.ply, 7);
    assert.equal(result.san, "Ba4");
    assert.equal(result.label, "4. Ba4");
    assert.deepEqual(result.repertoireMoves, []);
  });

  it("is partial when the line's own user-side move is not the repertoire's", () => {
    const result = cover("e4 c5 Nf3");
    assert.ok(result.status === "partial");
    assert.equal(result.reason, "user_deviation");
    assert.equal(result.ply, 2);
    assert.equal(result.san, "c5");
    assert.deepEqual(result.repertoireMoves, [{ uci: "e7e5", san: "e5" }]);
  });

  it("is a gap when the opponent plays a move the repertoire does not answer", () => {
    const result = cover("e4 e5 d4 exd4");
    assert.ok(result.status === "gap");
    assert.equal(result.ply, 3);
    assert.equal(result.san, "d4");
    assert.equal(result.label, "2. d4");
    assert.deepEqual(result.repertoireMoves, [{ uci: "g1f3", san: "Nf3" }]);
  });

  it("is a gap at ply 1 when the opponent's first move is not in the repertoire", () => {
    const result = cover("d4 d5");
    assert.ok(result.status === "gap");
    assert.equal(result.ply, 1);
    assert.equal(result.san, "d4");
    assert.equal(result.label, "1. d4");
    assert.deepEqual(result.repertoireMoves, [{ uci: "e2e4", san: "e4" }]);
  });
});

describe("lineCoverage — opponent plays Black (user's White repertoire)", () => {
  const cover = (line: string) =>
    lineCoverage({ path: path(line), opponentColor: "black", repertoireTree: WHITE_REP });

  it("is covered when the repertoire answers every opponent move", () => {
    assert.deepEqual(cover("e4 e5 Nf3 Nc6"), { status: "covered" });
    assert.deepEqual(cover("e4 e5 Nf3 Nc6 Bb5"), { status: "covered" });
  });

  it("is partial when the repertoire line ends before the opponent's move", () => {
    const result = cover("e4 e5 Nf3 Nc6 Bb5 a6");
    assert.ok(result.status === "partial");
    assert.equal(result.reason, "line_ended");
    assert.equal(result.ply, 6);
    assert.equal(result.san, "a6");
    assert.equal(result.label, "3…a6");
  });

  it("is partial when the line's own user-side move is not the repertoire's", () => {
    const result = cover("e4 e5 Bc4 Nf6");
    assert.ok(result.status === "partial");
    assert.equal(result.reason, "user_deviation");
    assert.equal(result.ply, 3);
    assert.equal(result.san, "Bc4");
    assert.deepEqual(result.repertoireMoves, [{ uci: "g1f3", san: "Nf3" }]);
  });

  it("is a gap when the opponent plays a move the repertoire does not answer", () => {
    const result = cover("e4 c5 Nf3");
    assert.ok(result.status === "gap");
    assert.equal(result.ply, 2);
    assert.equal(result.san, "c5");
    assert.equal(result.label, "1…c5");
    assert.deepEqual(result.repertoireMoves, [{ uci: "e7e5", san: "e5" }]);
  });
});

describe("lineCoverage — edge cases", () => {
  it("returns no_repertoire when the user has no tree for the color", () => {
    assert.deepEqual(
      lineCoverage({ path: path("e4 e5"), opponentColor: "white", repertoireTree: null }),
      { status: "no_repertoire" },
    );
    assert.deepEqual(
      lineCoverage({ path: path("e4 e5"), opponentColor: "black", repertoireTree: null }),
      { status: "no_repertoire" },
    );
  });

  it("reports a gap at the opponent's first move against an empty repertoire", () => {
    const empty = tree("");
    const asWhite = lineCoverage({ path: path("e4 e5"), opponentColor: "white", repertoireTree: empty });
    assert.ok(asWhite.status === "gap");
    assert.equal(asWhite.ply, 1);
    assert.equal(asWhite.san, "e4");
    const asBlack = lineCoverage({ path: path("e4 e5"), opponentColor: "black", repertoireTree: empty });
    assert.ok(asBlack.status === "gap");
    assert.equal(asBlack.ply, 2);
    assert.equal(asBlack.san, "e5");
    assert.equal(asBlack.label, "1…e5");
  });
});

let counter = 0;

function oppGame(color: "white" | "black", moves: string, playedAt: number | null): PlayerGame {
  counter += 1;
  return {
    id: `og${counter}`,
    winner: null,
    whiteName: "rival",
    whiteRating: 1500,
    blackName: "rival",
    blackRating: 1500,
    year: 2026,
    month: 10,
    event: null,
    eco: null,
    opening: null,
    moves,
    color,
    playerResult: null,
    playedAt,
  };
}

describe("opponentGaps", () => {
  const trees = { white: tree("e4 e5 Nf3 Nc6"), black: tree("e4 e5 Nf3 Nc6 Bb5") };

  it("groups opponent gaps, most frequent first, ties by recency", () => {
    const games = [
      // Start position, White (opponent) to move: 3 games, 2 distinct moves.
      oppGame("white", "d4 d5", 10),
      oppGame("white", "c4 e5", 20),
      oppGame("white", "d4 Nf6", 30),
      // After 1.e4 e5, White to move: 2 games.
      oppGame("white", "e4 e5 d4 exd4", 40),
      oppGame("white", "e4 e5 Bc4 Nf6", 50),
      // After 1.e4 e5 2.Nf3 Nc6, White to move: 1 game (older) ...
      oppGame("white", "e4 e5 Nf3 Nc6 d4", 60),
      // ... and a Black opponent after 1.e4: 1 game (newer) — wins the tie.
      oppGame("black", "e4 c5", 70),
      // Ignored: covered, user deviation, no moves.
      oppGame("white", "e4 e5 Nf3 Nc6", 80),
      oppGame("white", "e4 c5", 90),
      oppGame("white", "", 95),
    ];
    const rows = opponentGaps(games, trees);
    assert.deepEqual(
      rows.map((row) => [row.count, row.label]),
      [
        [3, "1. d4"],
        [2, "2. Bc4"],
        [1, "1…c5"],
        [1, "3. d4"],
      ],
    );
    assert.ok(rows.every((row) => row.kind === "opponent_gap"));
    assert.deepEqual(rows[0]?.playedMoves, [
      { san: "d4", count: 2 },
      { san: "c4", count: 1 },
    ]);
    assert.equal(rows[0]?.color, "white");
    assert.equal(rows[2]?.color, "black");
    assert.deepEqual(rows[0]?.repertoireMoves, [{ uci: "e2e4", san: "e4" }]);
    // Most recent example of the biggest group.
    assert.equal(rows[0]?.recentPlayedAt, 30);
    assert.equal(rows[0]?.recentEvent.playedSan, "d4");
    assert.equal(rows[0]?.gameIds.length, 3);
    assert.equal(rows[1]?.recentPlayedAt, 50);
  });

  it("uses the repertoire of the inverted color", () => {
    const onlyBlack = { white: null, black: tree("e4 e5") };
    // Opponent White -> user's Black tree: gap at 1.d4.
    assert.equal(opponentGaps([oppGame("white", "d4 d5", 1)], onlyBlack).length, 1);
    // Opponent Black -> user's White tree (null): skipped.
    assert.deepEqual(opponentGaps([oppGame("black", "e4 c5", 1)], onlyBlack), []);
  });

  it("returns nothing without repertoires or games", () => {
    assert.deepEqual(opponentGaps([oppGame("white", "d4 d5", 1)], { white: null, black: null }), []);
    assert.deepEqual(opponentGaps([], trees), []);
  });
});
