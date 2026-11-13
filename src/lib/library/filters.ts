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

// SIG-1326: player, Elo, ECO and period matchers (pure, shared by every source).

/** Min/max with the bounds swapped when typed backwards. */
export function normalizedEloRange(filters: Pick<LibraryFilterState, "eloMin" | "eloMax">): {
  min: number | null;
  max: number | null;
} {
  const { eloMin, eloMax } = filters;
  if (eloMin !== null && eloMax !== null && eloMin > eloMax) {
    return { min: eloMax, max: eloMin };
  }
  return { min: eloMin, max: eloMax };
}

/** Same swap for the year bounds. */
export function normalizedYearRange(filters: Pick<LibraryFilterState, "yearFrom" | "yearTo">): {
  from: number | null;
  to: number | null;
} {
  const { yearFrom, yearTo } = filters;
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
    return { from: yearTo, to: yearFrom };
  }
  return { from: yearFrom, to: yearTo };
}

/** The player's name on the chosen side; either side for "both". Case-insensitive substring. */
export function matchesPlayer(
  item: Pick<LibraryGameItem, "white" | "black">,
  player: string,
  color: LibraryFilterState["playerColor"],
): boolean {
  const needle = player.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const white = item.white.toLowerCase().includes(needle);
  const black = item.black.toLowerCase().includes(needle);
  return color === "white" ? white : color === "black" ? black : white || black;
}

/** Average rating of both players inside the range; games missing a rating never match an active range. */
export function matchesEloRange(
  item: Pick<LibraryGameItem, "whiteElo" | "blackElo">,
  filters: Pick<LibraryFilterState, "eloMin" | "eloMax">,
): boolean {
  const { min, max } = normalizedEloRange(filters);
  if (min === null && max === null) {
    return true;
  }
  if (item.whiteElo === null || item.blackElo === null) {
    return false;
  }
  const average = (item.whiteElo + item.blackElo) / 2;
  return (min === null || average >= min) && (max === null || average <= max);
}

/** ECO starts with the code or prefix, case-insensitive. */
export function matchesEco(item: Pick<LibraryGameItem, "eco">, eco: string): boolean {
  const prefix = eco.trim().toLowerCase();
  if (!prefix) {
    return true;
  }
  return (item.eco ?? "").toLowerCase().startsWith(prefix);
}

/** Year of "yyyy[-mm[-dd]]", or null. */
export function itemYear(date: string | null): number | null {
  const match = date?.match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

/** Game year inside [yearFrom, yearTo]; undated games never match an active range. */
export function matchesYearRange(
  item: Pick<LibraryGameItem, "date">,
  filters: Pick<LibraryFilterState, "yearFrom" | "yearTo">,
): boolean {
  const { from, to } = normalizedYearRange(filters);
  if (from === null && to === null) {
    return true;
  }
  const year = itemYear(item.date);
  if (year === null) {
    return false;
  }
  return (from === null || year >= from) && (to === null || year <= to);
}

/** All SIG-1326 filters at once. */
export function matchesAdvancedFilters(item: LibraryGameItem, filters: LibraryFilterState): boolean {
  return (
    matchesPlayer(item, filters.player, filters.playerColor) &&
    matchesEloRange(item, filters) &&
    matchesEco(item, filters.eco) &&
    matchesYearRange(item, filters)
  );
}
