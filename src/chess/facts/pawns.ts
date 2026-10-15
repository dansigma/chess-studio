import {
  fileOf,
  opposite,
  relativeRank,
  squareName,
  type Analysis,
} from "./board";
import type { Color, OutpostFact, PawnFact, WeakSquareFact } from "./types";

type PawnRef = { index: number; file: number; rank: number };

function pawnsOf(analysis: Analysis, color: Color): PawnRef[] {
  const out: PawnRef[] = [];
  for (let i = 0; i < 64; i++) {
    const piece = analysis.board[i];
    if (piece?.type === "p" && piece.color === color) {
      out.push({ index: i, file: fileOf(i), rank: relativeRank(i, color) });
    }
  }
  return out;
}

export function computePawnFacts(analysis: Analysis): PawnFact[] {
  const facts: PawnFact[] = [];
  const byColor: Record<Color, PawnRef[]> = {
    w: pawnsOf(analysis, "w"),
    b: pawnsOf(analysis, "b"),
  };
  for (const color of ["w", "b"] as const) {
    const own = byColor[color];
    const enemy = byColor[opposite(color)];
    for (const pawn of own) {
      const neighbours = own.filter((other) => Math.abs(other.file - pawn.file) === 1);
      const sameFile = own.filter((other) => other !== pawn && other.file === pawn.file);
      const square = squareName(pawn.index);
      const isolated = neighbours.length === 0;
      if (isolated) {
        facts.push({ kind: "isolated", color, square, with: [] });
      }
      if (sameFile.length > 0) {
        facts.push({
          kind: "doubled",
          color,
          square,
          with: sameFile.map((other) => squareName(other.index)),
        });
      }
      // Enemy ranks are counted from their own side, so "ahead of this pawn"
      // means a higher rank from `color`'s point of view: 7 - theirs.
      const passed = !enemy.some(
        (other) => Math.abs(other.file - pawn.file) <= 1 && 7 - other.rank > pawn.rank,
      );
      if (passed) {
        facts.push({ kind: "passed", color, square, with: [] });
      }
      if (!isolated && neighbours.every((other) => other.rank > pawn.rank)) {
        const stopFile = pawn.file;
        const stopRank = pawn.rank + 1;
        // Enemy pawns attack the stop square from files next to it, from a
        // square one rank "above" it (their pawns move toward our side).
        const attacked = enemy.some(
          (other) => Math.abs(other.file - stopFile) === 1 && 7 - other.rank === stopRank + 1,
        );
        if (attacked) {
          facts.push({ kind: "backward", color, square, with: [] });
        }
      }
    }
  }
  return facts;
}

/**
 * Squares in `side`'s half of the board (ranks 3-5 from its side) that none
 * of its pawns can ever attack, and where the opponent already has a piece or
 * an attacker. A pawn on an adjacent file can still challenge a square only
 * while it is behind it.
 */
export function computeWeakSquares(analysis: Analysis): WeakSquareFact[] {
  const facts: WeakSquareFact[] = [];
  for (const side of ["w", "b"] as const) {
    const own = pawnsOf(analysis, side);
    const enemy = opposite(side);
    for (let i = 0; i < 64; i++) {
      const rank = relativeRank(i, side);
      if (rank < 2 || rank > 4) {
        continue;
      }
      const occupant = analysis.board[i];
      if (occupant?.type === "p" && occupant.color === side) {
        continue;
      }
      const challengeable = own.some(
        (pawn) => Math.abs(pawn.file - fileOf(i)) === 1 && pawn.rank < rank,
      );
      if (challengeable) {
        continue;
      }
      const pressured = occupant?.color === enemy || (analysis.attackedBy[enemy][i]?.length ?? 0) > 0;
      if (pressured) {
        facts.push({ side, square: squareName(i) });
      }
    }
  }
  return facts;
}

/** Knights and bishops on ranks 4-6 backed by a pawn and immune to enemy pawns. */
export function computeOutposts(analysis: Analysis): OutpostFact[] {
  const facts: OutpostFact[] = [];
  for (const color of ["w", "b"] as const) {
    const enemyPawns = pawnsOf(analysis, opposite(color));
    for (let i = 0; i < 64; i++) {
      const piece = analysis.board[i];
      if (piece?.color !== color || (piece.type !== "n" && piece.type !== "b")) {
        continue;
      }
      const rank = relativeRank(i, color);
      if (rank < 3 || rank > 5) {
        continue;
      }
      const supported = (analysis.attackedBy[color][i] ?? []).some(
        (from) => analysis.board[from]?.type === "p",
      );
      const challengeable = enemyPawns.some(
        (pawn) => Math.abs(pawn.file - fileOf(i)) === 1 && 7 - pawn.rank > rank,
      );
      if (supported && !challengeable) {
        facts.push({ color, square: squareName(i), occupant: piece.type });
      }
    }
  }
  return facts;
}

