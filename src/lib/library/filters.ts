// In-memory filter helpers shared by adapters that filter locally.
import type { GameTree, TreeNode } from "@/src/chess/tree";
import type { LibraryAnnotationsFilter, LibraryFilterState, LibraryGameItem, LibraryResult } from "./types";

export function normalizeResult(raw: string | null | undefined): LibraryResult {
  const value = (raw ?? "").trim();
  if (value === "1-0" || value === "0-1") {
    return value;
  }
  if (value === "1/2-1/2" || value === "½-½" || value === "1/2") {
    return "1/2-1/2";
  }
  return "*";
}

/** "1992.11.04" / "1992.??.??" / "????" → "yyyy[-mm[-dd]]" or null. */
export function normalizePgnDate(raw: string | null | undefined): string | null {
  const match = (raw ?? "").trim().match(/^(\d{4})(?:[.\-/](\d{2}|\?\?)(?:[.\-/](\d{2}|\?\?))?)?/);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  if (!month || month === "??") {
    return year;
  }
  if (!day || day === "??") {
    return `${year}-${month}`;
  }
  return `${year}-${month}-${day}`;
}

export function searchTokens(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesTextFilters(item: LibraryGameItem, filters: LibraryFilterState): boolean {
  const tokens = searchTokens(filters.query);
  if (tokens.length > 0) {
    const haystack = [item.white, item.black, item.event, item.opening, item.eco]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!tokens.every((token) => haystack.includes(token))) {
      return false;
    }
  }
  const opponent = filters.opponent.trim().toLowerCase();
  if (opponent) {
    const white = item.white.toLowerCase().includes(opponent);
    const black = item.black.toLowerCase().includes(opponent);
    const ok = filters.color === "white" ? black : filters.color === "black" ? white : white || black;
    if (!ok) {
      return false;
    }
  }
  return true;
}

export function matchesResult(item: LibraryGameItem, filter: LibraryFilterState["result"]): boolean {
  if (filter === "all") {
    return true;
  }
  return filter === "draw" ? item.result === "1/2-1/2" : item.result === filter;
}

const COMMAND = /\[%[^\]]*\]/g;

/** True when the comment holds text beyond `[%clk ...]`-style commands. */
export function hasCommentText(comment: string | undefined): boolean {
  return !!comment && comment.replace(COMMAND, "").trim().length > 0;
}

export type AnnotationInfo = { commented: boolean; annotated: boolean };

export function annotationInfo(tree: GameTree): AnnotationInfo {
  let commented = hasCommentText(tree.startComment);
  let other = false;
  const stack: TreeNode[][] = [tree.children];
  while (stack.length > 0) {
    const nodes = stack.pop()!;
    if (nodes.length > 1) {
      other = true; // siblings after the first are variations
    }
    for (const node of nodes) {
      if (hasCommentText(node.comment) || hasCommentText(node.commentBefore)) {
        commented = true;
      }
      if (node.nags && node.nags.length > 0) {
        other = true;
      }
      stack.push(node.children);
    }
  }
  return { commented, annotated: commented || other };
}

export function matchesAnnotations(info: AnnotationInfo, filter: LibraryAnnotationsFilter): boolean {
  if (filter === "all") {
    return true;
  }
  return filter === "commented" ? info.commented : info.annotated;
}
