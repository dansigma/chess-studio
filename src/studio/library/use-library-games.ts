"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { queryLibrary } from "@/src/lib/library/query";
import type {
  LibraryFilterState,
  LibraryGameItem,
  LibraryQueryResult,
  LibrarySourceId,
} from "@/src/lib/library/types";
import { useLibraryStore } from "./library-store";

export const LIBRARY_PAGE_SIZE = 50;

export type LibraryGamesState = {
  items: LibraryGameItem[];
  total: number | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  sourceErrors: Partial<Record<LibrarySourceId, string>>;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
};

type Query = (
  filters: LibraryFilterState,
  cursor: string | null,
  limit: number,
  signal: AbortSignal,
) => Promise<LibraryQueryResult>;

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * SIG-1274: runs `queryLibrary` whenever the store filters change. The previous
 * request is aborted, and the old rows stay in `items` until the new page lands.
 * `query` is injectable for tests.
 */
export function useLibraryGames(query: Query = queryLibrary): LibraryGamesState {
  const filters = useLibraryStore((s) => s.filters);
  const [items, setItems] = useState<LibraryGameItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceErrors, setSourceErrors] = useState<LibraryGamesState["sourceErrors"]>({});
  const [reloadToken, setReloadToken] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    // Starting a request is the one synchronous state change this effect needs.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    query(filters, null, LIBRARY_PAGE_SIZE, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        setItems(result.items);
        setTotal(result.total);
        setNextCursor(result.nextCursor);
        setSourceErrors(result.sourceErrors);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbort(cause)) {
          return;
        }
        // Old rows stay; the error replaces them in the view only if there are none.
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      });
    return () => controller.abort();
  }, [filters, reloadToken, query]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loading || loadingMore) {
      return;
    }
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setLoadingMore(true);
    query(filters, nextCursor, LIBRARY_PAGE_SIZE, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        setItems((current) => {
          const seen = new Set(current.map((item) => item.key));
          return [...current, ...result.items.filter((item) => !seen.has(item.key))];
        });
        setTotal(result.total);
        setNextCursor(result.nextCursor);
        setSourceErrors(result.sourceErrors);
        setLoadingMore(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbort(cause)) {
          return;
        }
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoadingMore(false);
      });
  }, [filters, nextCursor, loading, loadingMore, query]);

  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

  return {
    items,
    total,
    loading,
    loadingMore,
    error,
    sourceErrors,
    hasMore: nextCursor !== null,
    loadMore,
    retry,
  };
}
