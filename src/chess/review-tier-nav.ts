// SIG-1219: click-to-jump on the report card's classification counts. Pure, so
// the cycling rule is unit-tested without the DOM.
import type { ReviewLabel } from "./review.ts";
import { pathsEqual, type Path } from "./tree.ts";

export type TierMove = { path: Path; side: "w" | "b"; label: ReviewLabel | null };

/** Paths of one side's moves with `label`, in game order (input is in game order). */
export function tierPaths(rows: ReadonlyArray<TierMove>, side: "w" | "b", label: ReviewLabel): Path[] {
  return rows.filter((row) => row.side === side && row.label === label).map((row) => row.path);
}

/**
 * The move a click on a count goes to: the first one when the board is not on
 * one of them, otherwise the next in game order, wrapping around at the end.
 */
export function nextTierPath(paths: ReadonlyArray<Path>, current: Path | null): Path | null {
  if (paths.length === 0) {
    return null;
  }
  const at = current ? paths.findIndex((path) => pathsEqual(path, current)) : -1;
  return paths[(at + 1) % paths.length];
}
