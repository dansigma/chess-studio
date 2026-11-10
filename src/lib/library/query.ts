// queryLibrary: queries the selected sources in parallel, merges by the
// current sort and returns one page plus an opaque cursor.
// Cursor = base64 JSON of one offset per source; each source is asked for
// `limit` items from its own offset, the merged head is returned, and each
// offset advances by the number of items that source contributed.
import { getLibrarySource } from "./sources";
import { compareLibraryItems } from "./sort";
import type {
  LibraryFilterState,
  LibraryGameItem,
  LibraryPage,
  LibraryQueryResult,
  LibrarySourceId,
} from "./types";

type Offsets = Partial<Record<LibrarySourceId, number>>;

export function encodeLibraryCursor(offsets: Offsets): string {
  const bytes = new TextEncoder().encode(JSON.stringify(offsets));
  return btoa(String.fromCharCode(...bytes));
}

export function decodeLibraryCursor(cursor: string | null): Offsets {
  if (!cursor) {
    return {};
  }
  try {
    const bytes = Uint8Array.from(atob(cursor), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: Offsets = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
        out[id as LibrarySourceId] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error && reason.message ? reason.message : "Source failed";
}

export async function queryLibrary(
  filters: LibraryFilterState,
  cursor: string | null,
  limit: number,
  signal: AbortSignal,
): Promise<LibraryQueryResult> {
  const sourceErrors: LibraryQueryResult["sourceErrors"] = {};
  if (limit <= 0) {
    return { items: [], nextCursor: null, total: null, sourceErrors };
  }
  const offsets = decodeLibraryCursor(cursor);
  const ids = [...new Set(filters.sources)];

  const settled = await Promise.all(
    ids.map(async (id) => {
      const adapter = getLibrarySource(id);
      if (!adapter) {
        return { id, error: "Unknown source" } as const;
      }
      try {
        const page = await adapter.list(filters, String(offsets[id] ?? 0), limit, signal);
        return { id, page } as const;
      } catch (reason) {
        return { id, error: errorMessage(reason) } as const;
      }
    }),
  );
  signal.throwIfAborted();

  const pages: { id: LibrarySourceId; page: LibraryPage }[] = [];
  for (const entry of settled) {
    if ("error" in entry) {
      sourceErrors[entry.id] = entry.error;
    } else {
      pages.push({ id: entry.id, page: entry.page });
    }
  }

  const all: LibraryGameItem[] = pages
    .flatMap(({ page }) => page.items)
    .sort((a, b) => compareLibraryItems(filters.sort, a, b));
  const items = all.slice(0, limit);

  const contributed = new Map<LibrarySourceId, number>();
  for (const item of items) {
    contributed.set(item.sourceId, (contributed.get(item.sourceId) ?? 0) + 1);
  }
  const next: Offsets = { ...offsets };
  let hasMore = false;
  let total: number | null = pages.length > 0 ? 0 : null;
  for (const { id, page } of pages) {
    const used = contributed.get(id) ?? 0;
    next[id] = (offsets[id] ?? 0) + used;
    if (used < page.items.length || page.nextCursor !== null) {
      hasMore = true;
    }
    total = total === null || page.total === null ? null : total + page.total;
  }
  return {
    items,
    nextCursor: hasMore ? encodeLibraryCursor(next) : null,
    total,
    sourceErrors,
  };
}
