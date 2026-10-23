// SIG-1090: unit tests for the batch review queue. A deterministic
// FEN-keyed fake engine replaces the real lease engine (no worker, no
// explorer); PGNs are distinct short lines so every game's fens differ.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import {
  createReviewQueue,
  queueGameInput,
  summaryFromRows,
  userMistakeCounts,
  type ReviewQueueGame,
} from "./review-queue.ts";
import {
  buildReviewReport,
  type ReportHeaders,
} from "@/src/chess/review-report.ts";
import type { AnalyzeOptions, PositionEval, ReviewEngine, ReviewRow } from "@/src/chess/review-engine.ts";
import { getCachedReview } from "@/src/studio/review/review-cache.ts";

function pgnFor(moves: string, tag: string): string {
  return `[Event "${tag}"]\n[Site "e2e"]\n[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n\n${moves} *`;
}

function gameFor(id: string, moves: string, color: "white" | "black" = "white"): ReviewQueueGame {
  return {
    id,
    externalId: `ext-${id}`,
    pgn: pgnFor(moves, id),
    color,
    whiteName: "Alice",
    blackName: "Bob",
    whiteRating: 1500,
    blackRating: 1400,
    eco: null,
    opening: null,
  };
}

/** Scores every position flat; FENs in `dead` resolve null (engine silence). */
function fakeEngine(dead: Set<string> = new Set(), value = 0.2, seen: string[] = []): ReviewEngine {
  return {
    async analyze(fen: string, options: AnalyzeOptions): Promise<PositionEval | null> {
      seen.push(fen);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (dead.has(fen)) {
        return null;
      }
      return {
        depth: options.depth,
        lines: [{ whitePawns: value, uci: null }],
      };
    },
  };
}

function fensOf(pgn: string): string[] {
  const game = new Chess();
  const fens = [game.fen()];
  const sans = pgn
    .split("\n\n")[1]
    ?.split(/\s+/)
    .filter((token) => token && !/^\d+\.+$/.test(token) && token !== "*");
  for (const san of sans ?? []) {
    game.move(san);
    fens.push(game.fen());
  }
  return fens;
}

describe("review-queue", () => {
  it("reviews games in order with accuracy matching buildReviewReport", async () => {
    const games = [
      gameFor("g1", "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6"),
      gameFor("g2", "1. d4 d5 2. c4 e6 3. Nc3 Nf6"),
      gameFor("g3", "1. e4 c5 2. Nf3 d6 3. d4 cxd4", "black"),
    ];
    const engine = fakeEngine();
    const done: Array<{ summary: unknown; id: string }> = [];
    const queue = createReviewQueue({
      games,
      preset: "fast",
      engineBuild: "lite",
      threads: 1,
      engine,
      onGameDone: (summary, game) => {
        done.push({ summary, id: game.id });
      },
    });
    await queue.start();
    assert.equal(done.length, 3);
    assert.deepEqual(done.map((entry) => entry.id), ["g1", "g2", "g3"]);
    for (const entry of done) {
      assert.ok(entry.summary != null, `expected a summary for ${entry.id}`);
    }
    // Accuracy equals a direct buildReviewReport over the cached rows.
    const g1 = games[0];
    const input = queueGameInput(g1.pgn, g1, "fast", "lite");
    const cached = getCachedReview(input.cacheKey);
    assert.ok(cached && cached.length > 0, "finished rows are cached under the interactive key");
    const report = buildReviewReport(cached, input.headers);
    const summary = done[0].summary as { userAccuracy: number | null; opponentAccuracy: number | null };
    assert.equal(summary.userAccuracy, report.white.accuracy);
    assert.equal(summary.opponentAccuracy, report.black.accuracy);
  });

  it("skips a failing game and continues with the rest", async () => {
    const games = [gameFor("f1", "1. e4 e5 2. Nf3 Nc6"), gameFor("f2", "1. d4 d5 2. c4 e6"), gameFor("f3", "1. e4 c5 2. Nf3 d6")];
    const dead = new Set(fensOf(games[1].pgn));
    const engine = fakeEngine(dead);
    const done: Array<{ summary: unknown; id: string }> = [];
    const queue = createReviewQueue({
      games,
      preset: "fast",
      engineBuild: "lite",
      threads: 1,
      engine,
      onGameDone: (summary, game) => {
        done.push({ summary, id: game.id });
      },
    });
    await queue.start();
    assert.equal(done.length, 3);
    assert.equal(done[1].summary, null);
    assert.ok(done[0].summary != null && done[2].summary != null);
  });

  it("stops on cancel without starting further games", async () => {
    const games = [gameFor("c1", "1. e4 e5 2. Nf3 Nc6"), gameFor("c2", "1. d4 d5 2. c4 e6")];
    const seen: string[] = [];
    const engine = fakeEngine(new Set(), 0.2, seen);
    let calls = 0;
    const queue = createReviewQueue({
      games,
      preset: "fast",
      engineBuild: "lite",
      threads: 1,
      engine,
      onGameDone: () => {
        calls += 1;
        queue.cancel();
      },
    });
    await queue.start();
    assert.equal(calls, 1);
    // Skip the shared start position: every game begins there, and game 1
    // already analysed it. Only game-2-specific positions must be untouched.
    const second = fensOf(games[1].pgn).slice(1);
    assert.ok(second.every((fen) => !seen.includes(fen)), "second game never analysed");
  });

  it("counts the user's mistakes per phase and derives headers from the row", () => {
    const rows = [
      { side: "w", phase: "opening", label: "inaccuracy", forced: false },
      { side: "w", phase: "opening", label: "blunder", forced: false },
      { side: "w", phase: "middlegame", label: "miss", forced: false },
      { side: "b", phase: "opening", label: "blunder", forced: false },
      { side: "w", phase: "endgame", label: "best", forced: false },
      { side: "w", phase: "endgame", label: "mistake", forced: true },
    ] as ReviewRow[];
    assert.deepEqual(userMistakeCounts(rows, "w"), {
      opening: { inaccuracy: 1, mistake: 0, miss: 0, blunder: 1 },
      middlegame: { inaccuracy: 0, mistake: 0, miss: 1, blunder: 0 },
      endgame: { inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
    });
    const headers = { White: "Alice", Black: "Bob", WhiteElo: "1500", BlackElo: "1400" } as ReportHeaders;
    const summary = summaryFromRows(gameFor("h1", "1. e4 e5"), rows, headers, () => 0);
    assert.equal(summary.id, "h1");
    assert.equal(summary.reviewedAt, new Date(0).toISOString());
    assert.deepEqual(summary.mistakeCounts.opening, { inaccuracy: 1, mistake: 0, miss: 0, blunder: 1 });
  });
});
