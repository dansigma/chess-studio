"use client";

import { useEffect, useState } from "react";
import { overviewFromItems, type LibraryOverview } from "@/src/lib/library/overview";
import { queryLibrary } from "@/src/lib/library/query";
import type { LibraryFilterState, LibraryGameItem, LibraryQueryResult } from "@/src/lib/library/types";

/** Games read per request while summarizing the filtered set. */
export const FILTERED_OVERVIEW_PAGE_SIZE = 500;
/** The summary stops after this many games and says so. */
export const FILTERED_OVERVIEW_MAX_GAMES = 5000;

export type FilteredOverviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; overview: LibraryOverview; capped: boolean };

type Query = (
  filters: LibraryFilterState,
  cursor: string | null,
  limit: number,
  signal: AbortSignal,
) => Promise<LibraryQueryResult>;

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Reads every game matching `filters` (up to the cap) through the same query as the table. */
export async function collectFilteredOverview(
  filters: LibraryFilterState,
  signal: AbortSignal,
  query: Query = queryLibrary,
): Promise<{ overview: LibraryOverview; capped: boolean }> {
  const items: LibraryGameItem[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let sourcesOk = false;
  do {
    const page: LibraryQueryResult = await query(filters, cursor, FILTERED_OVERVIEW_PAGE_SIZE, signal);
    if (page.items.length > 0 || Object.keys(page.sourceErrors).length < filters.sources.length) {
      sourcesOk = true;
    }
    for (const item of page.items) {
      if (!seen.has(item.key)) {
        seen.add(item.key);
        items.push(item);
      }
    }
    cursor = page.nextCursor;
  } while (cursor !== null && items.length < FILTERED_OVERVIEW_MAX_GAMES);
  if (!sourcesOk && filters.sources.length > 0) {
    throw new Error("Every source failed");
  }
  return { overview: overviewFromItems(items.slice(0, FILTERED_OVERVIEW_MAX_GAMES)), capped: cursor !== null };
}

/**
 * Summary of the games that match the current search and filters (the Library's
 * "filter summary"). Idle when `enabled` is false; refetches on every filter
 * change and aborts the previous run.
 */
export function useFilteredOverview(
  filters: LibraryFilterState,
  enabled: boolean,
  query: Query = queryLibrary,
): FilteredOverviewState {
  const [state, setState] = useState<FilteredOverviewState>({ kind: "idle" });

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ kind: "loading" });
    collectFilteredOverview(filters, controller.signal, query)
      .then((result) => {
        if (!controller.signal.aborted) {
          setState({ kind: "ready", ...result });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && !isAbort(cause)) {
          setState({ kind: "failed" });
        }
      });
    return () => controller.abort();
  }, [filters, enabled, query]);

  return state;
}
