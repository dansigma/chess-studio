"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTopBroadcasts, LiveRateLimitedError } from "@/src/lib/live/lichess-broadcast";
import type { BroadcastListItem } from "@/src/lib/live/types";
import { enqueueLiveRequest } from "./live-store";

export const BROADCAST_REFRESH_MS = 60_000;

export type BroadcastListData = {
  active: BroadcastListItem[];
  upcoming: BroadcastListItem[];
  past: BroadcastListItem[];
  /** Next past page to request; null when there is none (or the API cap was reached). */
  nextPage: number | null;
};

export type BroadcastListState = {
  data: BroadcastListData | null;
  /** Initial load failed (no data to show). */
  error: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
};

/** The queue rejects with an AbortError when it is stopped (leaving Live) or the caller aborts. */
function isAborted(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === "AbortError");
}

/** Appends `incoming` to `current`, skipping tournaments already listed. */
export function appendUnique(current: BroadcastListItem[], incoming: BroadcastListItem[]): BroadcastListItem[] {
  const seen = new Set(current.map((item) => item.tour.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.tour.id))];
}

/** Round to open for an item: `roundToLink` when present, else `round`; null when neither. */
export function roundIdForItem(item: BroadcastListItem): string | null {
  return item.roundToLink?.id ?? item.round?.id ?? null;
}

/**
 * Broadcast list for Live: page 1 on mount, refreshed every 60 s (skipped while the tab is hidden,
 * never two requests in flight, ~60 s backoff after a 429), plus "load more" for past pages.
 * Requests go through the shared Lichess queue of the live store (`enqueueLiveRequest`), so they never
 * run in parallel with the round snapshots and share its 429 pause.
 */
export function useBroadcastList(): BroadcastListState & { retry: () => void; loadMore: () => void } {
  const [state, setState] = useState<BroadcastListState>({
    data: null,
    error: false,
    loading: true,
    loadingMore: false,
    loadMoreError: false,
  });
  const inFlight = useRef(false);
  const backoffUntil = useRef(0);
  const nextPage = useRef<number | null>(null);
  const extraPast = useRef<BroadcastListItem[]>([]);
  const aborter = useRef<AbortController | null>(null);

  const refresh = useCallback(async (mode: "initial" | "manual" | "timer") => {
    if (inFlight.current) {
      return;
    }
    if (mode === "timer" && (document.hidden || Date.now() < backoffUntil.current)) {
      return;
    }
    inFlight.current = true;
    const controller = new AbortController();
    aborter.current = controller;
    try {
      const page = await enqueueLiveRequest((signal) => fetchTopBroadcasts(1, signal), { signal: controller.signal });
      if (!page) {
        return;
      }
      if (extraPast.current.length === 0) {
        nextPage.current = page.nextPage;
      }
      const past = appendUnique(page.past.currentPageResults, extraPast.current);
      setState((s) => ({
        ...s,
        loading: false,
        error: false,
        data: { active: page.active, upcoming: page.upcoming, past, nextPage: nextPage.current },
      }));
    } catch (error) {
      if (isAborted(error, controller.signal)) {
        return;
      }
      if (error instanceof LiveRateLimitedError) {
        backoffUntil.current = Date.now() + error.retryAfterMs;
      }
      // A failed background refresh keeps the list on screen; only the first load shows the error.
      setState((s) => (s.data ? s : { ...s, loading: false, error: true }));
    } finally {
      if (aborter.current === controller) {
        inFlight.current = false;
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    const page = nextPage.current;
    if (inFlight.current || page === null) {
      return;
    }
    inFlight.current = true;
    const controller = new AbortController();
    aborter.current = controller;
    setState((s) => ({ ...s, loadingMore: true, loadMoreError: false }));
    try {
      const result = await enqueueLiveRequest((signal) => fetchTopBroadcasts(page, signal), { signal: controller.signal });
      if (!result) {
        return;
      }
      extraPast.current = appendUnique(extraPast.current, result.past.currentPageResults);
      nextPage.current = result.nextPage;
      setState((s) =>
        s.data
          ? {
              ...s,
              loadingMore: false,
              data: {
                ...s.data,
                past: appendUnique(s.data.past, result.past.currentPageResults),
                nextPage: result.nextPage,
              },
            }
          : { ...s, loadingMore: false },
      );
    } catch (error) {
      if (isAborted(error, controller.signal)) {
        return;
      }
      if (error instanceof LiveRateLimitedError) {
        backoffUntil.current = Date.now() + error.retryAfterMs;
      }
      setState((s) => ({ ...s, loadingMore: false, loadMoreError: true }));
    } finally {
      if (aborter.current === controller) {
        inFlight.current = false;
      }
    }
  }, []);

  useEffect(() => {
    void refresh("initial");
    const timer = setInterval(() => void refresh("timer"), BROADCAST_REFRESH_MS);
    return () => {
      clearInterval(timer);
      aborter.current?.abort();
      inFlight.current = false;
    };
  }, [refresh]);

  const retry = useCallback(() => {
    if (inFlight.current) {
      return;
    }
    setState((s) => ({ ...s, loading: s.data === null, error: false }));
    void refresh("manual");
  }, [refresh]);
  const loadMoreStable = useCallback(() => void loadMore(), [loadMore]);
  return { ...state, retry, loadMore: loadMoreStable };
}
