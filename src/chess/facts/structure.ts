import { analyze, fileOf, opposite, parseFen, relativeRank, squareName, step, type Analysis } from "./board";
import { computeFileFacts } from "./lines";
import { computePawnFacts } from "./pawns";
import type { CentreLock, Color, PawnBreak, StructureChange } from "./types";

const FILES = "abcdefgh";

function isPawn(analysis: Analysis, index: number, side: Color): boolean {
  const piece = analysis.board[index];
  return piece?.type === "p" && piece.color === side;
}

/** Geometric pawn advances for both sides, independent of turn and king safety. */
export function computeBreaks(analysis: Analysis): PawnBreak[] {
  const breaks: PawnBreak[] = [];
  analysis.board.forEach((piece, from) => {
    if (piece?.type !== "p") return;
    const side = piece.color;
    const forward = side === "w" ? 1 : -1;
    const enemy = opposite(side);
    const maxAdvance = relativeRank(from, side) === 1 ? 2 : 1;
    for (let distance = 1; distance <= maxAdvance; distance++) {
      const to = step(from, 0, forward * distance);
      if (to < 0 || analysis.board[to]) break;
      if ([-1, 1].some((df) => [-1, 1].some((dr) => isPawn(analysis, step(to, df, dr), enemy)))) {
        breaks.push({ side, from: squareName(from), to: squareName(to) });
      }
    }
  });
  return breaks;
}

export function computeCentreLock(analysis: Analysis): CentreLock {
  const rams: string[] = [];
  const pawnBalance = Array<number>(8).fill(0);
  let tension = 0;
  analysis.board.forEach((piece, index) => {
    if (piece?.type !== "p") return;
    const file = fileOf(index);
    pawnBalance[file] += piece.color === "w" ? 1 : -1;
    if (piece.color !== "w") return;
    if (file >= 2 && file <= 5 && isPawn(analysis, step(index, 0, 1), "b")) {
      rams.push(squareName(index));
    }
    // Count each contact once by looking from the white pawn.
    tension += analysis.attacks[index].filter((to) => isPawn(analysis, to, "b")).length;
  });
  return { rams, asymmetricFiles: pawnBalance.filter((balance) => balance !== 0).length, tension };
}

function pawnConditions(analysis: Analysis) {
  const conditions = new Map<string, { change: StructureChange; count: number }>();
  for (const { kind, color, square } of computePawnFacts(analysis)) {
    if (kind === "backward") continue;
    const file = square[0];
    const key = `${kind}:${color}:${file}`;
    const count = (conditions.get(key)?.count ?? 0) + 1;
    conditions.set(key, { change: { kind: `pawn-${kind}`, side: color, file }, count });
  }
  return conditions;
}

export function compareStructure(before: Analysis, after: Analysis): StructureChange[] {
  const oldFiles = new Map(computeFileFacts(before).map((fact) => [fact.file, fact]));
  const newFiles = new Map(computeFileFacts(after).map((fact) => [fact.file, fact]));
  const changes: StructureChange[] = [];
  for (const file of FILES) {
    const was = oldFiles.get(file);
    const now = newFiles.get(file);
    if (was?.openness === now?.openness && was?.halfOpenFor === now?.halfOpenFor) continue;
    if (!now) {
      changes.push({ kind: "file-closed", file });
    } else if (now.halfOpenFor) {
      changes.push({ kind: "file-half-opened", file, for: now.halfOpenFor });
    } else {
      changes.push({ kind: "file-opened", file });
    }
  }

  // A pawn condition is reported once per side and file, even for doubled pawns.
  const oldConditions = pawnConditions(before);
  for (const [key, { change, count }] of pawnConditions(after)) {
    if (count > (oldConditions.get(key)?.count ?? 0)) changes.push(change);
  }
  return changes;
}

export function structureChanges(fenBefore: string, fenAfter: string): StructureChange[] {
  const before = parseFen(fenBefore);
  const after = parseFen(fenAfter);
  if (!before || !after) return [];
  return compareStructure(analyze(before.board), analyze(after.board));
}
