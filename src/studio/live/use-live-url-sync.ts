"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_LIVE_URL_STATE, parseWorkspaceView } from "@/src/studio/workspace-view-url";
import { liveSearch, parseLiveUrlState, useLiveStore } from "./live-store";

/**
 * The single place where the Live URL and `useLiveStore` meet (SIG-1291).
 * - On mount and on every `popstate`: URL → store (`applyLiveUrlState`).
 * - On every store change of the selection: store → URL (`liveSearch`). Opening a round from the list
 *   pushes one history entry (so Back returns to the list); every other change replaces the entry.
 * - On unmount (leaving the Live view): `leaveLive()` aborts the stream and drops the live data.
 * `ready` turns true once the URL has been applied. `goBack()` returns to the list the way the browser Back button does.
 */
export function useLiveUrlSync(): { goBack: () => void; ready: boolean } {
  const pushed = useRef(false);
  // False until the URL is in the store, so a deep link never mounts the list (and its request) first.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const store = useLiveStore;
    const apply = () => store.getState().applyLiveUrlState(parseLiveUrlState(window.location.search));
    apply();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot flag after syncing the external URL into the store
    setReady(true);
    const onPopState = () => {
      if (parseWorkspaceView(window.location.search) !== "live") {
        return; // navigating away from Live: the view unmounts, nothing to apply
      }
      const url = parseLiveUrlState(window.location.search);
      if (url.round === null) {
        pushed.current = false;
      }
      store.getState().applyLiveUrlState(url);
    };
    window.addEventListener("popstate", onPopState);
    const unsubscribe = store.subscribe((s, prev) => {
      if (
        s.tableRoundId === prev.tableRoundId &&
        s.openBoards === prev.openBoards &&
        s.focusedGame === prev.focusedGame
      ) {
        return;
      }
      if (parseWorkspaceView(window.location.search) !== "live") {
        return;
      }
      const search = liveSearch(window.location.search, s);
      if (search === window.location.search) {
        return;
      }
      const url = `${window.location.pathname}${search}${window.location.hash}`;
      if (prev.tableRoundId === null && s.tableRoundId !== null) {
        window.history.pushState(window.history.state, "", url);
        pushed.current = true;
      } else {
        window.history.replaceState(window.history.state, "", url);
      }
    });
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPopState);
      store.getState().leaveLive();
    };
  }, []);

  const goBack = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back(); // popstate returns to the list entry
      return;
    }
    useLiveStore.getState().applyLiveUrlState(EMPTY_LIVE_URL_STATE);
  }, []);

  return { goBack, ready };
}
