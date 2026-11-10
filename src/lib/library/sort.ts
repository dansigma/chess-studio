import type { LibraryGameItem, LibraryResult, LibrarySortKey } from "./types";

const RESULT_RANK: Record<LibraryResult, number> = {
  "1-0": 0,
  "1/2-1/2": 1,
  "0-1": 2,
  "*": 3,
};

function sortValue(item: LibraryGameItem, key: LibrarySortKey): string | number | null {
  switch (key) {
    case "white":
      return item.white;
    case "whiteElo":
      return item.whiteElo;
    case "black":
      return item.black;
    case "blackElo":
      return item.blackElo;
    case "result":
      return RESULT_RANK[item.result];
    case "eco":
      return item.eco;
    case "plyCount":
      return item.plyCount;
    case "event":
      return item.event;
    case "date":
      return item.date;
  }
}

function compareValues(a: string | number, b: string | number, key: LibrarySortKey): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  const left = String(a);
  const right = String(b);
  if (key === "white" || key === "black" || key === "event") {
    return left.localeCompare(right, undefined, { sensitivity: "base" });
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Comparator for the current sort: nulls last in both directions, ties by `key`. */
export function compareLibraryItems(
  sort: { key: LibrarySortKey; direction: "asc" | "desc" },
  a: LibraryGameItem,
  b: LibraryGameItem,
): number {
  const left = sortValue(a, sort.key);
  const right = sortValue(b, sort.key);
  if (left === null && right !== null) {
    return 1;
  }
  if (left !== null && right === null) {
    return -1;
  }
  if (left !== null && right !== null) {
    const base = compareValues(left, right, sort.key);
    if (base !== 0) {
      return sort.direction === "asc" ? base : -base;
    }
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
