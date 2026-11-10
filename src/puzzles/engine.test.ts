import { localDayKey } from "./activity";
import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { PUZZLE_CATALOG } from "./catalog.ts";
import {
  applyResult,
  compilePuzzle,
  dailyPuzzle,
  dateKey,
  emptyProgress,
  fenAtPly,
  judgeMove,
  levelFromXp,
  materialFor,
  normalizeProgress,
  rankedPuzzles,
  rate,
} from "./engine.ts";
import { puzzleGoal, solvedPraise, squareAnchor } from "./feedback.ts";
import { THEME_CARDS, type PuzzleTheme } from "./types.ts";

// Engine tests compile the catalog directly: `PUZZLES` lives in the
// server-only `puzzle-data.ts` module (fetched by clients via /api/puzzles),
// so importing it here would drag the server boundary into the suite.
const PUZZLES = PUZZLE_CATALOG.map(compilePuzzle);

test("every puzzle is a legal line that ends with the solver", () => {
  assert.equal(PUZZLES.length, PUZZLE_CATALOG.length);
  const ids = new Set<string>();
  for (const puzzle of PUZZLES) {
    assert.equal(ids.has(puzzle.id), false, puzzle.id);
    ids.add(puzzle.id);
    assert.equal(puzzle.uci.length % 2, 1, puzzle.id);
    const end = new Chess(puzzle.endFen);
    const solver = new Chess(puzzle.fen).turn();
    if (puzzle.themes.includes("mate")) {
      assert.equal(end.isCheckmate(), true, puzzle.id);
    } else {
      assert.ok(materialFor(puzzle.endFen, solver) > materialFor(puzzle.fen, solver), puzzle.id);
    }
    if (puzzle.themes.includes("mateIn1")) {
      assert.equal(puzzle.uci.length, 1, puzzle.id);
    }
    if (puzzle.themes.includes("mateIn2")) {
      assert.equal(puzzle.uci.length, 3, puzzle.id);
    }
  }
});

test("theme cards each have a puzzle", () => {
  for (const card of THEME_CARDS) {
    assert.ok(
      PUZZLES.some((puzzle) => puzzle.themes.includes(card.id)),
      card.id,
    );
  }
});

test("a matching move is accepted and a different legal move is refused", () => {
  const puzzle = compilePuzzle(PUZZLE_CATALOG[0]);
  const from = puzzle.uci[0].slice(0, 2);
  const to = puzzle.uci[0].slice(2, 4);
  const correct = judgeMove(puzzle.fen, puzzle.uci[0], from, to);
  assert.equal(correct.kind, "correct");
  const wrong = judgeMove(puzzle.fen, puzzle.uci[0], "g1", "h1");
  assert.equal(wrong.kind, "wrong");
  assert.equal(judgeMove(puzzle.fen, puzzle.uci[0], "a1", "a3").kind, "illegal");
});

test("fenAtPly walks the solution", () => {
  const puzzle = PUZZLES.find((item) => item.id === "double-rook-back-rank");
  assert.ok(puzzle);
  assert.equal(fenAtPly(puzzle.fen, puzzle.uci, 0), new Chess(puzzle.fen).fen());
  assert.equal(fenAtPly(puzzle.fen, puzzle.uci, puzzle.uci.length), puzzle.endFen);
});

test("equal ratings move by 16 points", () => {
  assert.equal(rate(1200, 1200, true), 1216);
  assert.equal(rate(1200, 1200, false), 1184);
});

test("ranked puzzles prefer the closest unseen rating", () => {
  const ranked = rankedPuzzles(PUZZLES, 1220, new Set(["knight-fork-queen"]));
  assert.equal(ranked[0]?.id, "knight-fork-queen-d7");
  assert.equal(ranked.some((puzzle) => puzzle.id === "knight-fork-queen"), false);
});

test("rated success updates rating and streak", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  const next = applyResult(emptyProgress(), {
    id: "queen-corridor",
    mode: "rated",
    success: true,
    puzzleRating: 1200,
    sessionScore: 1,
    now,
    themes: [],
    ms: null,
  });
  assert.equal(next.rating, 1216);
  assert.equal(next.solved, 1);
  assert.equal(next.streak, 1);
  assert.equal(next.history[0]?.delta, 16);
  // 20 base x 1.2 first try; no timing, so no speed bonus.
  assert.equal(next.xp, 24);
  const missed = applyResult(next, {
    id: "back-rank-rook",
    mode: "rated",
    success: false,
    puzzleRating: 1200,
    sessionScore: 1,
    now,
    themes: [],
    ms: null,
  });
  assert.equal(missed.streak, 0);
  assert.equal(missed.bestStreak, 1);
  assert.equal(missed.failed, 1);
});

test("the daily puzzle is stable and counts once", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  const later = new Date(2026, 8, 28, 18).getTime();
  assert.equal(dailyPuzzle(PUZZLES, now)?.id, dailyPuzzle(PUZZLES, later)?.id);
  const once = applyResult(emptyProgress(), {
    id: "queen-corridor",
    mode: "daily",
    success: true,
    puzzleRating: 750,
    sessionScore: 1,
    now,
    themes: [],
    ms: null,
  });
  const twice = applyResult(once, {
    id: "queen-corridor",
    mode: "daily",
    success: true,
    puzzleRating: 750,
    sessionScore: 1,
    now: later,
    themes: [],
    ms: null,
  });
  assert.equal(twice.solved, 1);
  assert.equal(twice.rating, 1200);
  assert.equal(twice.daily, "2026-09-28");
});

test("the daily puzzle returns null for an empty catalog", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  assert.equal(dailyPuzzle([], now), null);
});

test("dateKey uses the UTC calendar day", () => {
  assert.equal(dateKey(Date.parse("2026-06-15T12:00:00Z")), "2026-06-15");
  assert.equal(dateKey(Date.parse("2026-01-02T01:00:00Z")), "2026-01-02");
});

test("rush keeps the best score and leaves the rating alone", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  const next = applyResult(emptyProgress(), {
    id: "rook-roll",
    mode: "rush",
    success: true,
    puzzleRating: 880,
    sessionScore: 4,
    now,
    themes: [],
    ms: null,
  });
  assert.equal(next.rating, 1200);
  assert.equal(next.rushBest, 4);
  assert.equal(next.streak, 0);
});

test("levels grow: 100, 130, 169 xp and levelFromXp reports xp to the next level", () => {
  assert.deepEqual(levelFromXp(0), { level: 1, into: 0, span: 100, toNext: 100 });
  assert.deepEqual(levelFromXp(100), { level: 2, into: 0, span: 130, toNext: 130 });
  assert.deepEqual(levelFromXp(140), { level: 2, into: 40, span: 130, toNext: 90 });
  assert.equal(levelFromXp(230).level, 3);
});

test("a failed puzzle does not award points", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  const missed = applyResult(emptyProgress(), {
    id: "back-rank-rook",
    mode: "rated",
    success: false,
    puzzleRating: 800,
    sessionScore: 0,
    now,
    themes: [],
    ms: null,
  });
  assert.equal(missed.xp, 0);
});

test("rated success and failure record per-motif stats", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  const afterFork = applyResult(emptyProgress(), {
    id: "knight-fork-queen",
    mode: "rated",
    success: true,
    puzzleRating: 1200,
    sessionScore: 1,
    now,
    themes: ["fork"],
    ms: 8000,
  });
  assert.deepEqual(afterFork.motifs.fork, {
    attempts: 1,
    solved: 1,
    timedAttempts: 1,
    totalMs: 8000,
    recent: "1",
  });
  const afterPin = applyResult(afterFork, {
    id: "queenside-pin",
    mode: "rated",
    success: false,
    puzzleRating: 1200,
    sessionScore: 1,
    now,
    themes: ["pin"],
    ms: null,
  });
  assert.deepEqual(afterPin.motifs.pin, {
    attempts: 1,
    solved: 0,
    timedAttempts: 0,
    totalMs: 0,
    recent: "0",
  });
  // The fork entry is untouched by the pin attempt.
  assert.deepEqual(afterPin.motifs.fork, afterFork.motifs.fork);
});

test("motif recording covers streak, rush and daily but skips mistakes mode", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  for (const mode of ["streak", "rush", "daily"] as const) {
    const next = applyResult(emptyProgress(), {
      id: `${mode}-puzzle`,
      mode,
      success: true,
      puzzleRating: 1200,
      sessionScore: 1,
      now,
      themes: ["fork"],
      ms: 1000,
    });
    assert.equal(next.motifs.fork?.attempts, 1, mode);
  }
  const other = applyResult(emptyProgress(), {
    id: "mistakes-puzzle",
    mode: "mistakes",
    success: true,
    puzzleRating: 1200,
    sessionScore: 1,
    now,
    themes: ["fork"],
    ms: 1000,
  });
  assert.deepEqual({ ...other, days: {} }, emptyProgress());
  assert.deepEqual(other.motifs, {});
});

test("mistakes attempts change only today's activity counter", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  const populated = applyResult(emptyProgress(), {
    id: "rated-1",
    mode: "rated",
    success: true,
    puzzleRating: 1500,
    sessionScore: 2,
    now,
    themes: ["fork"],
    ms: 500,
  });
  for (const success of [true, false]) {
    const next = applyResult(populated, {
      id: "mx:abc",
      mode: "mistakes",
      success,
      puzzleRating: 1500,
      sessionScore: 3,
      now: now + 1000,
      themes: [],
      ms: 2000,
    });
    assert.deepEqual({ ...next, days: {} }, { ...populated, days: {} });
    const key = localDayKey(now + 1000);
    assert.equal(next.days[key].solved + next.days[key].failed, populated.days[key].solved + populated.days[key].failed + 1);
    assert.equal(next.days[key].xp, populated.days[key].xp, "mistakes award no xp");
  }
});

test("repeated daily on the same day records no motif stats", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  const later = new Date(2026, 8, 28, 18).getTime();
  const once = applyResult(emptyProgress(), {
    id: "queen-corridor",
    mode: "daily",
    success: true,
    puzzleRating: 750,
    sessionScore: 1,
    now,
    themes: ["fork"],
    ms: 5000,
  });
  assert.equal(once.motifs.fork?.attempts, 1);
  const twice = applyResult(once, {
    id: "queen-corridor",
    mode: "daily",
    success: true,
    puzzleRating: 750,
    sessionScore: 1,
    now: later,
    themes: ["fork"],
    ms: 5000,
  });
  assert.deepEqual(twice.motifs, once.motifs);
});

test("motif recent caps at ten and multi-theme puzzles record each theme once", () => {
  const now = new Date(2026, 8, 28, 12).getTime();
  let progress = emptyProgress();
  for (let index = 0; index < 12; index += 1) {
    progress = applyResult(progress, {
      id: `fork-${index}`,
      mode: "rated",
      success: index % 2 === 0,
      puzzleRating: 1200,
      sessionScore: 1,
      now: now + index,
      themes: ["fork", "fork"],
      ms: null,
    });
  }
  assert.equal(progress.motifs.fork?.attempts, 12);
  assert.equal(progress.motifs.fork?.recent, "1010101010");
  const multi = applyResult(emptyProgress(), {
    id: "mate-fork",
    mode: "rated",
    success: true,
    puzzleRating: 1200,
    sessionScore: 1,
    now,
    themes: ["mate", "fork"],
    ms: 2000,
  });
  assert.equal(multi.motifs.mate?.attempts, 1);
  assert.equal(multi.motifs.fork?.attempts, 1);
  assert.equal(multi.motifs.fork?.totalMs, 2000);
});

// SIG-1250: a timestamp-sized stored total (the first-puzzle `Date.now() - 0`
// bug) repairs to zeroed time fields on normalize; attempts, solved and the
// recent trend stay untouched so the motif shows "—" until its next attempt.
test("normalizeProgress repairs timestamp-sized motif totals", () => {
  const raw = {
    ...emptyProgress(),
    motifs: {
      promotion: { attempts: 10, solved: 6, timedAttempts: 10, totalMs: 3_586_534_000_000, recent: "1111100000" },
      fork: { attempts: 12, solved: 9, timedAttempts: 12, totalMs: 96_000, recent: "1111111111" },
    },
  };
  const repaired = normalizeProgress(raw);
  assert.deepEqual(repaired.motifs.promotion, {
    attempts: 10,
    solved: 6,
    timedAttempts: 0,
    totalMs: 0,
    recent: "1111100000",
  });
  assert.deepEqual(repaired.motifs.fork, { attempts: 12, solved: 9, timedAttempts: 12, totalMs: 96_000, recent: "1111111111" });
});

test("normalizeProgress motif repair keeps honest totals and is idempotent", () => {
  const justBelow = {
    ...emptyProgress(),
    motifs: {
      fork: { attempts: 3, solved: 2, timedAttempts: 3, totalMs: 999_999_999_999, recent: "110" },
    },
  };
  assert.equal(normalizeProgress(justBelow).motifs.fork?.totalMs, 999_999_999_999);
  const corrupt = {
    ...emptyProgress(),
    motifs: {
      fork: { attempts: 36, solved: 20, timedAttempts: 36, totalMs: 1_793_479_702_000, recent: "1010101010" },
    },
  };
  const once = normalizeProgress(corrupt);
  assert.deepEqual(once.motifs.fork, { attempts: 36, solved: 20, timedAttempts: 0, totalMs: 0, recent: "1010101010" });
  assert.deepEqual(normalizeProgress(once), once);
  assert.deepEqual(normalizeProgress(normalizeProgress(justBelow)), normalizeProgress(justBelow));
});

test("coach lines and the award anchor follow the side to move", () => {
  assert.match(puzzleGoal(["mateIn1", "mate"], "en"), /Mate in one/);
  assert.match(solvedPraise(3, "en"), /1-2-3/);
  assert.match(puzzleGoal(["mateIn1", "mate"], "pt-br"), /Mate em um/);
  assert.match(solvedPraise(3, "pt-br"), /1-2-3/);
  const white = squareAnchor("a1", "white");
  const black = squareAnchor("a1", "black");
  assert.ok(white && black);
  assert.ok(white.y > 0.8);
  assert.ok(black.y < 0.2);
  assert.equal(squareAnchor("z9", "white"), null);
});

test("theme filters are real puzzle themes", () => {
  const theme: PuzzleTheme = "fork";
  const ranked = rankedPuzzles(PUZZLES, 1200, new Set(), theme);
  assert.ok(ranked.length >= 2);
  assert.ok(ranked.every((puzzle) => puzzle.themes.includes(theme)));
});

test("an alternate move that mates is accepted in mate puzzles", () => {
  const puzzle = PUZZLES.find((item) => item.id === "queen-corridor");
  assert.ok(puzzle);
  const altMate = judgeMove(puzzle.fen, puzzle.uci[0], "f7", "e8", true);
  assert.ok(altMate.kind === "correct");
  assert.equal(altMate.mate, true);
  const withoutFlag = judgeMove(puzzle.fen, puzzle.uci[0], "f7", "e8");
  assert.equal(withoutFlag.kind, "wrong");
  const notMate = judgeMove(puzzle.fen, puzzle.uci[0], "f7", "f4", true);
  assert.equal(notMate.kind, "wrong");
});

test("promotion is resolved from the move, not the expected string", () => {
  const puzzle = PUZZLES.find((item) => item.id === "promote-f");
  assert.ok(puzzle);
  const promoted = judgeMove(puzzle.fen, "f7f8r", "f7", "f8", false);
  assert.ok(promoted.kind === "correct");
  assert.equal(promoted.uci, "f7f8r");
  const promotedWithFlag = judgeMove(puzzle.fen, "f7f8r", "f7", "f8", true);
  assert.equal(promotedWithFlag.kind, "correct");
  assert.equal(promotedWithFlag.uci, "f7f8r");
});

// SIG-1268: Recent reads themes, time and puzzle rating from the entry.
const historyAttempt = {
  id: "p-1",
  mode: "rated" as const,
  success: true,
  puzzleRating: 1350,
  sessionScore: 1,
  now: 1_760_000_000_000,
  themes: ["fork", "pin"] as ("fork" | "pin")[],
  ms: 4200,
};

test("applyResult saves themes, time and puzzle rating in history", () => {
  const entry = applyResult(emptyProgress(), historyAttempt).history[0];
  assert.deepEqual(entry?.themes, ["fork", "pin"]);
  assert.equal(entry?.ms, 4200);
  assert.equal(entry?.puzzleRating, 1350);
});

test("applyResult omits a null time and unknown themes from history", () => {
  const entry = applyResult(emptyProgress(), {
    ...historyAttempt,
    ms: null,
    themes: ["nope"] as never,
  }).history[0];
  assert.equal("ms" in (entry ?? {}), false);
  assert.equal("themes" in (entry ?? {}), false);
});

test("applyResult never stores an absurd duration in history", () => {
  const entry = applyResult(emptyProgress(), { ...historyAttempt, ms: 1.79e12 }).history[0];
  assert.equal("ms" in (entry ?? {}), false);
});

test("normalizeProgress keeps older history entries untouched", () => {
  const old = { id: "x", mode: "rated", success: false, at: 5, delta: -8 };
  const loaded = normalizeProgress({ ...emptyProgress(), history: [old] });
  assert.deepEqual(loaded.history, [old]);
});

test("normalizeProgress keeps valid history extras across a JSON round trip", () => {
  const saved = applyResult(emptyProgress(), historyAttempt);
  const loaded = normalizeProgress(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(loaded.history, saved.history);
});

test("normalizeProgress ignores invalid history extras and keeps the entry", () => {
  const base = { id: "x", mode: "rated", success: true, at: 5, delta: 3 };
  const cases: Record<string, unknown>[] = [
    { ms: 1.79e12 },
    { ms: -1 },
    { ms: Number.NaN },
    { ms: "900" },
    { ms: 3_600_001 },
    { puzzleRating: 0 },
    { puzzleRating: 99_999 },
    { puzzleRating: "1200" },
    { puzzleRating: Number.POSITIVE_INFINITY },
    { themes: "fork" },
    { themes: [1, null, "nope"] },
  ];
  for (const extra of cases) {
    const loaded = normalizeProgress({ ...emptyProgress(), history: [{ ...base, ...extra }] });
    assert.deepEqual(loaded.history, [base], JSON.stringify(extra));
  }
});

test("normalizeProgress filters unknown themes and keeps the valid ones", () => {
  const loaded = normalizeProgress({
    ...emptyProgress(),
    history: [{ id: "x", mode: "rated", success: true, at: 5, delta: 3, themes: ["nope", "fork", "fork", "pin"], ms: 0 }],
  });
  assert.deepEqual(loaded.history[0]?.themes, ["fork", "pin"]);
  assert.equal(loaded.history[0]?.ms, 0);
});
