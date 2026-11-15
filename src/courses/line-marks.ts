// SIG-1367: the line editor's mini-board walks the mainline and stores the
// author's arrows/highlights on the selected move. This module keeps that
// walk and the PGN write-back pure so the board stays a thin view.
import type { BoardMarks } from "@/src/chess/marks";
import { exportPgn, importPgn } from "@/src/chess/pgn";
import { setNodeMarks, type GameTree, type Path } from "@/src/chess/tree";

export type LinePosition = {
  /** Half-moves from the start: 0 is the position before the first move. */
  ply: number;
  /** The move that leads to this position; null on the starting position. */
  san: string | null;
  fen: string;
  marks?: BoardMarks;
};

/** The mainline spine as board positions, starting with the initial one. */
export function linePositions(tree: GameTree): LinePosition[] {
  const positions: LinePosition[] = [
    { ply: 0, san: null, fen: tree.startFen, marks: tree.startMarks },
  ];
  let node = tree.children[0];
  while (node) {
    positions.push({ ply: positions.length, san: node.san, fen: node.fen, marks: node.marks });
    node = node.children[0];
  }
  return positions;
}

/** Mainline paths are all-zero prefixes; nested variations are never touched. */
function mainlinePath(ply: number): Path {
  return Array.from({ length: ply }, () => 0);
}

/**
 * Rewrites one mainline move's marks and returns the line's PGN. Comments,
 * headers, clocks and side variations survive the export; `ply` out of range
 * leaves the PGN untouched.
 */
export function setMarksOnMainlineMove(
  pgn: string,
  ply: number,
  marks: BoardMarks | undefined,
): string {
  const imported = importPgn(pgn);
  const lastPly = linePositions(imported.tree).length - 1;
  if (!Number.isInteger(ply) || ply < 0 || ply > lastPly) {
    return pgn;
  }
  return exportPgn(setNodeMarks(imported.tree, mainlinePath(ply), marks), imported.headers);
}
