// SIG-1041: turns a finished game review into one exercise per serious mistake
// of the user's side. Pure — no engine, no I/O, no store. Slices 2-4 (persist,
// practice, explain) consume `MistakeExercise` without changing this module.
import { Chess } from "chess.js";
import { computeMoveFacts, type MoveFacts } from "./facts/index.ts";
import type { GamePhase } from "./phases.ts";
import type { ReviewRow } from "./review-engine.ts";
import type { ReviewSide } from "./review-report.ts";
import { fenKey } from "./tree.ts";

export type MistakeMotif =
  | "mate"
  | "fork"
  | "win-material"
  | "capture"
  | "sacrifice"
  | "check"
  | "defense"
  | "positional";

export type MistakeExercise = {
  key: string;
  fen: string;
  solutionUci: string[];
  bestPv: string[];
  playedUci: string;
  label: "miss" | "mistake" | "blunder";
  phase: GamePhase;
  lossCp: number;
  beforePawns: number;
  afterPawns: number;
  motif: MistakeMotif;
  createdAt: string;
};

/** Labels that produce exercises; `forced` rows are excluded even with these labels. */
function isMistakeLabel(label: ReviewRow["label"]): label is MistakeExercise["label"] {
  return label === "miss" || label === "mistake" || label === "blunder";
}

/** Tactic tag for the engine's best move; first match wins (precedence order). */
export function motifOf(facts: MoveFacts): MistakeMotif {
  if (facts.mate) {
    return "mate";
  }
  const created = new Set(facts.threats.created.map((threat) => threat.kind));
  if (created.has("fork")) {
    return "fork";
  }
  if (created.has("hanging-capture") || created.has("winning-capture") || created.has("mate-in-1")) {
    return "win-material";
  }
  if (facts.capture) {
    return "capture";
  }
  if (facts.sacrifice) {
    return "sacrifice";
  }
  if (facts.check) {
    return "check";
  }
  if (facts.threats.neutralized.length > 0) {
    return "defense";
  }
  return "positional";
}

/**
 * Legal prefix of a UCI line from `fen`, stopping at the first illegal move.
 * Null when the FEN itself is broken.
 */
function legalPrefix(fen: string, line: string[]): string[] | null {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return null;
  }
  const moves: string[] = [];
  for (const uci of line) {
    try {
      const move = board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      });
      if (!move) {
        break;
      }
      moves.push(uci);
    } catch {
      break;
    }
  }
  return moves;
}

export function extractMistakeExercises(input: {
  fens: string[];
  rows: ReviewRow[];
  userSide: ReviewSide;
  now?: Date | string;
}): MistakeExercise[] {
  const createdAt =
    input.now instanceof Date ? input.now.toISOString() : (input.now ?? new Date().toISOString());
  const byKey = new Map<string, MistakeExercise>();
  for (const row of input.rows) {
    if (row.side !== input.userSide) {
      continue;
    }
    if (!isMistakeLabel(row.label)) {
      continue;
    }
    if (row.forced) {
      continue;
    }
    const line = row.bestPv;
    if (!line || line.length === 0 || line[0] === row.playedUci) {
      continue;
    }
    const fen = input.fens[row.index];
    if (typeof fen !== "string" || fen.trim() === "") {
      continue;
    }
    const legal = legalPrefix(fen, line);
    if (!legal || legal.length === 0) {
      continue;
    }
    // Solver-first lines must end on the solver's move (odd length); the
    // puzzle engine rejects even lengths, so an even prefix drops its last ply.
    let solution = legal.slice(0, 3);
    if (solution.length % 2 === 0) {
      solution = solution.slice(0, -1);
    }
    if (solution.length === 0) {
      continue;
    }
    const best = computeMoveFacts(fen, solution[0], line);
    if (!best) {
      continue;
    }
    const exercise: MistakeExercise = {
      key: `mx:${fenKey(fen)}`,
      fen,
      solutionUci: solution,
      bestPv: legal,
      playedUci: row.playedUci,
      label: row.label,
      phase: row.phase,
      lossCp: row.lossCp,
      beforePawns: row.beforePawns,
      afterPawns: row.afterPawns,
      motif: motifOf(best),
      createdAt,
    };
    const existing = byKey.get(exercise.key);
    if (!existing || exercise.lossCp > existing.lossCp) {
      byKey.set(exercise.key, exercise);
    }
  }
  return [...byKey.values()];
}
