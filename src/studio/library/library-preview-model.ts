import { positionKey } from "@/src/chess/zobrist";
import { flattenMainLine, type GameTree, type Path } from "@/src/chess/tree";
import { displayDate, displayEvent } from "../notation-format";

/**
 * SIG-1279: path of the main-line position matching `fen`, compared by
 * `positionKey` (clocks ignored). Falls back to the start position.
 */
export function startPathForPosition(tree: GameTree, fen: string | null | undefined): Path {
  if (!fen) {
    return [];
  }
  const target = positionKey(fen);
  if (positionKey(tree.startFen) === target) {
    return [];
  }
  const line = flattenMainLine(tree);
  const index = line.findIndex((node) => positionKey(node.fen) === target);
  return index < 0 ? [] : Array<number>(index + 1).fill(0);
}

/** Full moves in the main line (a trailing single White move counts). */
export function mainLineMoveCount(tree: GameTree): number {
  return Math.ceil(flattenMainLine(tree).length / 2);
}

/** PGN-derived header fields, in the Studio's display form. */
export function previewHeaderExtras(headers: Record<string, string>): { event: string | null; date: string | null } {
  return { event: displayEvent(headers.Event), date: displayDate(headers.Date) };
}
