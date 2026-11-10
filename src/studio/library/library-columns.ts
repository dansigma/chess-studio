import type { LibrarySortKey } from "@/src/lib/library/types";
import type { LibraryStringKey } from "@/src/i18n/library-strings";

export type LibraryColumn = {
  key: Exclude<LibrarySortKey, "date">;
  label: LibraryStringKey;
  /** CSS grid track. */
  width: string;
  /** Hidden when the panel is narrower than `NARROW_PANEL_WIDTH`. */
  optional: boolean;
  /** Direction applied when the column is first clicked. */
  firstDirection: "asc" | "desc";
  align?: "right";
};

/** SIG-1277: below this panel width Elo and Event columns are hidden. */
export const NARROW_PANEL_WIDTH = 520;

export const LIBRARY_COLUMNS: LibraryColumn[] = [
  { key: "white", label: "library.col.white", width: "minmax(0,1.6fr)", optional: false, firstDirection: "asc" },
  { key: "whiteElo", label: "library.col.whiteElo", width: "44px", optional: true, firstDirection: "desc", align: "right" },
  { key: "black", label: "library.col.black", width: "minmax(0,1.6fr)", optional: false, firstDirection: "asc" },
  { key: "blackElo", label: "library.col.blackElo", width: "44px", optional: true, firstDirection: "desc", align: "right" },
  { key: "result", label: "library.col.result", width: "44px", optional: false, firstDirection: "asc" },
  { key: "eco", label: "library.col.eco", width: "40px", optional: false, firstDirection: "asc" },
  { key: "plyCount", label: "library.col.plyCount", width: "48px", optional: false, firstDirection: "desc", align: "right" },
  { key: "event", label: "library.col.event", width: "minmax(0,1.2fr)", optional: true, firstDirection: "asc" },
];

export function visibleColumns(panelWidth: number): LibraryColumn[] {
  return panelWidth < NARROW_PANEL_WIDTH ? LIBRARY_COLUMNS.filter((c) => !c.optional) : LIBRARY_COLUMNS;
}

export function nextSort(
  current: { key: LibrarySortKey; direction: "asc" | "desc" },
  column: LibraryColumn,
): { key: LibrarySortKey; direction: "asc" | "desc" } {
  if (current.key === column.key) {
    return { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key: column.key, direction: column.firstDirection };
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
