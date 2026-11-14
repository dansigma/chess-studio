"use client";

import { useEffect } from "react";
import { useStudioStore } from "@/src/store/studio-store";
import { useLibraryStore } from "./library/library-store";
import { useDossierStore } from "./library/dossier/dossier-store";
import {
  parseLibraryMode,
  parseLibraryPlayer,
  parseWorkspaceView,
  withLibraryMode,
  withLibraryPlayer,
  withWorkspaceView,
} from "./workspace-view-url";

/** The URL for the current view, mode and dossier state, starting from `search`. */
function searchForState(search: string): string {
  const view = useStudioStore.getState().workspaceView;
  let next = withWorkspaceView(search, view);
  if (view === "library") {
    next = withLibraryMode(next, useLibraryStore.getState().mode);
    const dossier = useDossierStore.getState();
    next = withLibraryPlayer(next, dossier.player, dossier.filters.color);
  }
  return next;
}

// SIG-1273: keeps `workspaceView` and `?view=library|live` in sync. URL → store on
// mount and on back/forward; store → URL (pushState) on every change, so
// reload and history both land on the right view.
// SIG-1318: the Library mode is kept in the URL the same way.
// SIG-1346: so is the open player dossier (pushed on player changes, replaced
// when only the side filter changes) and it is dropped when the dossier closes,
// the mode leaves Players or the view leaves the Library.
export function useWorkspaceViewUrl(): void {
  useEffect(() => {
    const write = (search: string, kind: "push" | "replace") => {
      if (search === window.location.search) {
        return;
      }
      const url = `${window.location.pathname}${search}${window.location.hash}`;
      if (kind === "push") {
        window.history.pushState(window.history.state, "", url);
      } else {
        window.history.replaceState(window.history.state, "", url);
      }
    };

    const applyUrl = () => {
      const search = window.location.search;
      useStudioStore.getState().setWorkspaceView(parseWorkspaceView(search));
      useLibraryStore.getState().setMode(parseLibraryMode(search));

      // SIG-1346: inside Players the address bar is the source of truth, so an
      // entry without a valid player closes any open dossier and Back/Forward
      // land on what the URL says. Other views leave the in-memory dossier
      // alone (it is not part of their URL).
      const dossier = useDossierStore.getState();
      const fromUrl = parseLibraryPlayer(search);
      if (parseWorkspaceView(search) === "library" && parseLibraryMode(search) === "players") {
        if (fromUrl === null) {
          if (dossier.player !== null) {
            dossier.closePlayer();
          }
        } else if (dossier.player?.id !== fromUrl.player.id) {
          dossier.openPlayer(fromUrl.player, fromUrl.color);
        } else if (dossier.filters.color !== fromUrl.color) {
          dossier.setFilters({ ...dossier.filters, color: fromUrl.color });
        }
      }

      // An invalid or out-of-place player is removed instead of kept in the URL.
      write(withLibraryPlayer(search, fromUrl?.player ?? null, fromUrl?.color ?? "all"), "replace");
    };
    applyUrl();

    const onPopState = applyUrl;
    window.addEventListener("popstate", onPopState);

    const unsubscribe = useStudioStore.subscribe((state, previous) => {
      if (state.workspaceView === previous.workspaceView) {
        return;
      }
      if (parseWorkspaceView(window.location.search) === state.workspaceView) {
        return;
      }
      write(searchForState(window.location.search), "push");
    });

    // SIG-1318: Library mode (?mode=players) is pushed on change, like the view.
    const unsubscribeMode = useLibraryStore.subscribe((state, previous) => {
      if (state.mode === previous.mode) {
        return;
      }
      if (parseLibraryMode(window.location.search) === state.mode) {
        return;
      }
      write(searchForState(window.location.search), "push");
    });

    // SIG-1346: opening or closing a player pushes a history entry; changing
    // only the color replaces the entry for the current player.
    const unsubscribePlayer = useDossierStore.subscribe((state, previous) => {
      const id = state.player?.id ?? null;
      const previousId = previous.player?.id ?? null;
      const color = state.filters.color;
      if (id === previousId && color === previous.filters.color) {
        return;
      }
      // The URL just drove this change (mount or popstate): do not write it back.
      const fromUrl = parseLibraryPlayer(window.location.search);
      if ((fromUrl?.player.id ?? null) === id && (fromUrl?.color ?? "all") === color) {
        return;
      }
      write(searchForState(window.location.search), id === previousId ? "replace" : "push");
    });

    return () => {
      window.removeEventListener("popstate", onPopState);
      unsubscribe();
      unsubscribeMode();
      unsubscribePlayer();
    };
  }, []);
}
