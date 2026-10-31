// SIG-1097: converts a saved mistake exercise into a puzzle for the
// "My mistakes" practice mode. Pure — no I/O, no store. The session queue
// (`mistakesQueue`) and the caught-up next-due lookup (`nextDueDate`) live
// here too so they are unit-testable without the React hook.
import { Chess } from "chess.js";
import type { MistakeExercise } from "@/src/chess/mistake-exercises";
import { dueExercises, type MistakeExercisesMap, type StoredExercise } from "@/src/lib/mistake-exercises-store";
import { compilePuzzle, type CompiledPuzzle } from "./engine";
import type { Puzzle } from "./types";

/** Fixed display rating for converted exercises; scoring is neutral anyway. */
export const MISTAKE_PUZZLE_RATING = 1500;

/**
 * Convert one exercise to a `Puzzle`, or null when the stored line cannot
 * become a legal solver-first line (illegal ply, empty or even length).
 * `id` is board-safe (`puzzleIdForExercise`); map back with
 * `exerciseKeyForPuzzle` for `recordAttempt`.
 */
export function exerciseToPuzzle(exercise: MistakeExercise): Puzzle | null {
  const line = exercise?.solutionUci;
  if (!line || line.length === 0 || line.length % 2 === 0) {
    return null;
  }
  let board: Chess;
  try {
    board = new Chess(exercise.fen);
  } catch {
    return null;
  }
  const sans: string[] = [];
  for (const uci of line) {
    let move;
    try {
      move = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return null;
    }
    if (!move) {
      return null;
    }
    sans.push(move.san);
  }
  if (sans.length === 0 || sans.length % 2 === 0) {
    return null;
  }
  return {
    id: puzzleIdForExercise(exercise.key),
    fen: exercise.fen,
    moves: sans,
    rating: MISTAKE_PUZZLE_RATING,
    themes: [],
  };
}

export type MistakesQueueEntry = { stored: StoredExercise; puzzle: CompiledPuzzle };

/**
 * Board-safe puzzle id for an exercise key. Real exercise keys are
 * `mx:<fenKey>` — the FEN fragment carries spaces and `/`, which break
 * `querySelector('#…-square-…')` inside react-chessboard's piece animation
 * (SyntaxError unmounts the board, so nothing can be solved). The suffix is
 * hex-encoded (`mx-h-…`) so the id only ever contains `[0-9a-f-]`; map back
 * with `exerciseKeyForPuzzle`.
 */
export function puzzleIdForExercise(key: string): string {
  const suffix = key.startsWith("mx:") ? key.slice(3) : key;
  return `mx-h-${toHex(suffix)}`;
}

/**
 * Map a board-safe puzzle id back to its exercise key for `recordAttempt`.
 * Accepts the current hex form (`mx-h-<hex>`) plus the legacy colon-stripped
 * form (`mx-first` → `mx:first`) from before the hex encoding.
 */
export function exerciseKeyForPuzzle(puzzleId: string): string {
  if (puzzleId.startsWith("mx-h-")) {
    try {
      const decoded = fromHex(puzzleId.slice(5));
      if (decoded.length > 0) {
        return `mx:${decoded}`;
      }
    } catch {
      // Corrupt id — fall through and return it unchanged.
    }
    return puzzleId;
  }
  if (puzzleId.startsWith("mx-") && /^[^\s/:]+$/.test(puzzleId.slice(3))) {
    return `mx:${puzzleId.slice(3)}`;
  }
  return puzzleId;
}

function toHex(text: string): string {
  return Array.from(new TextEncoder().encode(text), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Build the practice queue from the stored map: due entries first
 * (`dueExercises` order), converted and compiled, skipping nulls.
 * `exclude` holds already-seen exercise keys.
 */
export function mistakesQueue(
  map: MistakeExercisesMap,
  exclude: ReadonlySet<string> = new Set(),
  now: Date = new Date(),
): MistakesQueueEntry[] {
  const normalized = new Set<string>();
  for (const key of exclude) {
    // Callers track board-safe puzzle ids (`mx-…`); compare against the
    // exercise keys (`mx:…`) stored in the map.
    normalized.add(exerciseKeyForPuzzle(key));
    normalized.add(key);
  }
  const queue: MistakesQueueEntry[] = [];
  for (const stored of dueExercises(map, now)) {
    if (normalized.has(stored.exercise.key)) {
      continue;
    }
    const converted = exerciseToPuzzle(stored.exercise);
    if (!converted) {
      continue;
    }
    try {
      queue.push({ stored, puzzle: compilePuzzle(converted) });
    } catch {
      // Corrupt stored line (e.g. position in check) — skip, never crash.
    }
  }
  return queue;
}

/** Earliest `dueDate` over scheduled entries, or null when none/empty. */
export function nextDueDate(map: MistakeExercisesMap): string | null {
  let earliest: string | null = null;
  for (const entry of Object.values(map)) {
    const due = entry?.srs?.dueDate;
    if (typeof due !== "string" || due === "") {
      continue;
    }
    if (earliest === null || due < earliest) {
      earliest = due;
    }
  }
  return earliest;
}
