import { Chess, type Square } from "chess.js";
import { PUZZLE_CATALOG } from "./catalog";
import {
  PUZZLE_MODES,
  PUZZLE_THEMES,
  type Puzzle,
  type PuzzleHistoryEntry,
  type PuzzleMode,
  type PuzzleModeAttempt,
  type PuzzleProgress,
  type PuzzleTheme,
} from "./types";

export type CompiledPuzzle = Puzzle & {
  uci: string[];
  sans: string[];
  endFen: string;
};

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function emptyProgress(): PuzzleProgress {
  return {
    rating: 1200,
    solved: 0,
    failed: 0,
    streak: 0,
    bestStreak: 0,
    rushBest: 0,
    daily: "",
    xp: 0,
    history: [],
  };
}

export const XP_PER_LEVEL = 100;

export function puzzlePoints(puzzleRating: number, streak: number): number {
  const base = 12 + Math.round(Math.max(0, puzzleRating) / 40);
  return base + Math.max(1, streak) * 8;
}

export function levelFromXp(xp: number): { level: number; into: number; span: number } {
  const safe = Math.max(0, Math.floor(xp));
  return {
    level: Math.floor(safe / XP_PER_LEVEL) + 1,
    into: safe % XP_PER_LEVEL,
    span: XP_PER_LEVEL,
  };
}

export function isPuzzleTheme(value: string): value is PuzzleTheme {
  return (PUZZLE_THEMES as readonly string[]).includes(value);
}

export function isPuzzleMode(value: string): value is PuzzleMode {
  return (PUZZLE_MODES as readonly string[]).includes(value);
}

function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

export function compilePuzzle(puzzle: Puzzle): CompiledPuzzle {
  const chess = new Chess(puzzle.fen);
  if (chess.isCheck()) {
    throw new Error(`${puzzle.id} starts in check`);
  }
  const uci: string[] = [];
  const sans: string[] = [];
  for (const san of puzzle.moves) {
    const move = chess.move(san);
    if (!move) {
      throw new Error(`${puzzle.id} rejected ${san}`);
    }
    uci.push(`${move.from}${move.to}${move.promotion ?? ""}`);
    sans.push(move.san);
  }
  if (uci.length === 0 || uci.length % 2 === 0) {
    throw new Error(`${puzzle.id} line must end on the solver's move`);
  }
  return { ...puzzle, moves: sans, uci, sans, endFen: chess.fen() };
}

export const PUZZLES: CompiledPuzzle[] = PUZZLE_CATALOG.map(compilePuzzle);

export function materialFor(fen: string, color: "w" | "b"): number {
  const board = new Chess(fen).board();
  let score = 0;
  for (const row of board) {
    for (const piece of row) {
      if (!piece) {
        continue;
      }
      const value = PIECE_VALUE[piece.type] ?? 0;
      score += piece.color === color ? value : -value;
    }
  }
  return score;
}

export function dateKey(now: number): string {
  // UTC so the daily puzzle rolls over at the same instant for every timezone (SIG-853).
  const date = new Date(now);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

export function dailyPuzzle(puzzles: readonly CompiledPuzzle[], now: number): CompiledPuzzle {
  const key = dateKey(now);
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (Math.imul(hash, 33) + key.charCodeAt(index)) >>> 0;
  }
  return puzzles[hash % puzzles.length] ?? puzzles[0];
}

export function rate(user: number, puzzle: number, success: boolean): number {
  const expected = 1 / (1 + 10 ** ((puzzle - user) / 400));
  const score = success ? 1 : 0;
  const next = Math.round(user + 32 * (score - expected));
  return Math.min(3000, Math.max(100, next));
}

export function rankedPuzzles(
  puzzles: readonly CompiledPuzzle[],
  rating: number,
  exclude: ReadonlySet<string>,
  theme?: PuzzleTheme,
): CompiledPuzzle[] {
  const themed = theme ? puzzles.filter((puzzle) => puzzle.themes.includes(theme)) : [...puzzles];
  const fresh = themed.filter((puzzle) => !exclude.has(puzzle.id));
  const source = fresh.length > 0 ? fresh : themed;
  return [...source].sort(
    (a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating) || a.id.localeCompare(b.id),
  );
}

export function sessionTarget(startRating: number, solvedInSession: number, mode: PuzzleMode): number {
  if (mode === "rush") {
    return startRating - 100 + solvedInSession * 140;
  }
  if (mode === "streak") {
    return startRating - 150 + solvedInSession * 70;
  }
  return startRating;
}

export type JudgedMove =
  | { kind: "illegal" }
  | { kind: "correct" | "wrong"; fen: string; from: string; to: string; san: string; uci: string; mate: boolean };

export function judgeMove(
  fen: string,
  expected: string,
  from: string,
  to: string,
  acceptMate = false,
): JudgedMove {
  if (!isSquare(from) || !isSquare(to)) {
    return { kind: "illegal" };
  }
  const chess = new Chess(fen);
  const piece = chess.get(from);
  const promotionRank = piece?.color === "w" ? "8" : "1";
  const candidates: Array<string | undefined> =
    piece?.type === "p" && to[1] === promotionRank ? ["q", "r", "b", "n"] : [undefined];
  let played: { fen: string; from: string; to: string; san: string; uci: string; mate: boolean } | null =
    null;
  for (const promotion of candidates) {
    const probe = new Chess(fen);
    let move;
    try {
      move = probe.move({ from, to, promotion });
    } catch {
      continue;
    }
    if (!move) {
      continue;
    }
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const outcome = {
      fen: probe.fen(),
      from: move.from,
      to: move.to,
      san: move.san,
      uci,
      mate: probe.isCheckmate(),
    };
    if (uci === expected) {
      return { kind: "correct", ...outcome };
    }
    if (acceptMate && outcome.mate) {
      return { kind: "correct", ...outcome };
    }
    if (!played) {
      played = outcome;
    }
  }
  if (!played) {
    return { kind: "illegal" };
  }
  return { kind: "wrong", ...played };
}

export function playUci(fen: string, uci: string): { fen: string; from: string; to: string; san: string } {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (!isSquare(from) || !isSquare(to)) {
    throw new Error(`bad uci ${uci}`);
  }
  const chess = new Chess(fen);
  const move = chess.move({ from, to, promotion: uci[4] });
  if (!move) {
    throw new Error(`illegal uci ${uci}`);
  }
  return { fen: chess.fen(), from: move.from, to: move.to, san: move.san };
}

export function fenAtPly(fen: string, uci: readonly string[], ply: number): string {
  let current = fen;
  for (let index = 0; index < ply; index += 1) {
    current = playUci(current, uci[index] ?? "").fen;
  }
  return current;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeHistory(value: unknown): PuzzleHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: PuzzleHistoryEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.mode !== "string" || !isPuzzleMode(record.mode)) {
      continue;
    }
    if (typeof record.success !== "boolean") {
      continue;
    }
    entries.push({
      id: record.id,
      mode: record.mode,
      success: record.success,
      at: finiteNumber(record.at, 0),
      delta: finiteNumber(record.delta, 0),
    });
  }
  return entries.slice(0, 20);
}

export function normalizeProgress(value: unknown): PuzzleProgress {
  const empty = emptyProgress();
  if (!value || typeof value !== "object") {
    return empty;
  }
  const record = value as Record<string, unknown>;
  return {
    rating: Math.min(3000, Math.max(100, Math.round(finiteNumber(record.rating, empty.rating)))),
    solved: Math.max(0, Math.round(finiteNumber(record.solved, 0))),
    failed: Math.max(0, Math.round(finiteNumber(record.failed, 0))),
    streak: Math.max(0, Math.round(finiteNumber(record.streak, 0))),
    bestStreak: Math.max(0, Math.round(finiteNumber(record.bestStreak, 0))),
    rushBest: Math.max(0, Math.round(finiteNumber(record.rushBest, 0))),
    daily: typeof record.daily === "string" ? record.daily : "",
    xp:
      typeof record.xp === "number" && Number.isFinite(record.xp)
        ? Math.max(0, Math.round(record.xp))
        : Math.max(0, Math.round(finiteNumber(record.solved, 0))) * 40,
    history: normalizeHistory(record.history),
  };
}

export function applyResult(progress: PuzzleProgress, attempt: PuzzleModeAttempt): PuzzleProgress {
  if (attempt.mode === "daily" && progress.daily === dateKey(attempt.now)) {
    return progress;
  }
  const rated = attempt.mode === "rated";
  const rating = rated ? rate(progress.rating, attempt.puzzleRating, attempt.success) : progress.rating;
  const tracksStreak = attempt.mode === "rated" || attempt.mode === "streak";
  const streak = !tracksStreak ? progress.streak : attempt.success ? progress.streak + 1 : 0;
  const pointStreak = attempt.mode === "rush" ? Math.max(1, attempt.sessionScore) : Math.max(1, streak);
  const gained = attempt.success ? puzzlePoints(attempt.puzzleRating, pointStreak) : 0;
  const next: PuzzleProgress = {
    rating,
    solved: progress.solved + (attempt.success ? 1 : 0),
    failed: progress.failed + (attempt.success ? 0 : 1),
    streak,
    bestStreak: Math.max(progress.bestStreak, streak),
    rushBest: attempt.mode === "rush" ? Math.max(progress.rushBest, attempt.sessionScore) : progress.rushBest,
    xp: progress.xp + gained,
    daily: attempt.mode === "daily" ? dateKey(attempt.now) : progress.daily,
    history: [
      {
        id: attempt.id,
        mode: attempt.mode,
        success: attempt.success,
        at: attempt.now,
        delta: rating - progress.rating,
      },
      ...progress.history,
    ].slice(0, 20),
  };
  return next;
}
