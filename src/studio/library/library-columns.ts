import type { LibrarySortKey } from "@/src/lib/library/types";
import type { LibraryStringKey } from "@/src/i18n/library-strings";

/** Display-only columns (Opening, Source) use keys outside the sort contract. */
export type LibraryColumnKey = LibrarySortKey | "opening" | "source";

export type LibraryColumn = {
  key: LibraryColumnKey;
  label: LibraryStringKey;
  /** CSS grid track. */
  width: string;
  /** Hidden when the panel is narrower than `NARROW_PANEL_WIDTH`. */
  optional: boolean;
  /** Hidden when the panel is narrower than `WIDE_PANEL_WIDTH` (Opening). */
  wide?: boolean;
  /** Shown only when more than one source is selected (Source). */
  multiSource?: boolean;
  /** False for display-only columns, whose header is plain text. */
  sortable: boolean;
  /** Direction applied when the column is first clicked. */
  firstDirection: "asc" | "desc";
  align?: "right";
};

/** SIG-1277: below this panel width Elo and Event columns are hidden. */
export const NARROW_PANEL_WIDTH = 520;
/** SIG-1336: below this panel width the Opening column is hidden. */
export const WIDE_PANEL_WIDTH = 760;

export const LIBRARY_COLUMNS: LibraryColumn[] = [
  { key: "white", label: "library.col.white", width: "minmax(0,1.6fr)", optional: false, sortable: true, firstDirection: "asc" },
  { key: "whiteElo", label: "library.col.whiteElo", width: "44px", optional: true, sortable: true, firstDirection: "desc", align: "right" },
  { key: "black", label: "library.col.black", width: "minmax(0,1.6fr)", optional: false, sortable: true, firstDirection: "asc" },
  { key: "blackElo", label: "library.col.blackElo", width: "44px", optional: true, sortable: true, firstDirection: "desc", align: "right" },
  { key: "result", label: "library.col.result", width: "44px", optional: false, sortable: true, firstDirection: "asc" },
  { key: "date", label: "library.col.date", width: "64px", optional: false, sortable: true, firstDirection: "desc", align: "right" },
  { key: "eco", label: "library.col.eco", width: "40px", optional: false, sortable: true, firstDirection: "asc" },
  { key: "opening", label: "library.col.opening", width: "minmax(0,1.4fr)", optional: false, wide: true, sortable: false, firstDirection: "asc" },
  { key: "plyCount", label: "library.col.plyCount", width: "48px", optional: false, sortable: true, firstDirection: "desc", align: "right" },
  { key: "event", label: "library.col.event", width: "minmax(0,1.2fr)", optional: true, sortable: true, firstDirection: "asc" },
  { key: "source", label: "library.col.source", width: "80px", optional: false, multiSource: true, sortable: false, firstDirection: "asc" },
];

export function visibleColumns(panelWidth: number, multiSource = false): LibraryColumn[] {
  return LIBRARY_COLUMNS.filter((column) => {
    if (column.multiSource && !multiSource) {
      return false;
    }
    if (column.wide && panelWidth < WIDE_PANEL_WIDTH) {
      return false;
    }
    return !(column.optional && panelWidth < NARROW_PANEL_WIDTH);
  });
}

const DEFAULT_SORT = { key: "date", direction: "desc" } as const;

/**
 * Three-state header cycle: a column's first direction, then the opposite,
 * then back to the default sort (date, newest first).
 */
export function nextSort(
  current: { key: LibrarySortKey; direction: "asc" | "desc" },
  column: LibraryColumn,
): { key: LibrarySortKey; direction: "asc" | "desc" } {
  if (!column.sortable) {
    return current;
  }
  const key = column.key as LibrarySortKey;
  if (current.key !== key) {
    return { key, direction: column.firstDirection };
  }
  if (current.direction === column.firstDirection) {
    return { key, direction: column.firstDirection === "asc" ? "desc" : "asc" };
  }
  return { ...DEFAULT_SORT };
}

/** Index to select after an arrow/Home/End key, or null when the key is not a move. */
export function moveSelection(key: string, current: number, count: number, page = 10): number | null {
  if (count === 0) {
    return null;
  }
  switch (key) {
    case "ArrowDown":
      return Math.min(count - 1, current < 0 ? 0 : current + 1);
    case "ArrowUp":
      return Math.max(0, current < 0 ? 0 : current - 1);
    case "PageDown":
      return Math.min(count - 1, Math.max(0, current) + page);
    case "PageUp":
      return Math.max(0, Math.max(0, current) - page);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
