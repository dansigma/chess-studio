"use client";

import { useEffect } from "react";
import { useStudioStore } from "@/src/store/studio-store";
import { useLibraryStore } from "./library/library-store";
import { parseLibraryMode, parseWorkspaceView, withLibraryMode, withWorkspaceView } from "./workspace-view-url";

// SIG-1273: keeps `workspaceView` and `?view=library|live` in sync. URL → store on
// mount and on back/forward; store → URL (pushState) on every change, so
// reload and history both land on the right view.
export function useWorkspaceViewUrl(): void {
  useEffect(() => {
    const applyUrl = () => {
      useStudioStore.getState().setWorkspaceView(parseWorkspaceView(window.location.search));
      useLibraryStore.getState().setMode(parseLibraryMode(window.location.search));
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
      let search = withWorkspaceView(window.location.search, state.workspaceView);
      if (state.workspaceView === "library") {
        search = withLibraryMode(search, useLibraryStore.getState().mode);
      }
      window.history.pushState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    });

    // SIG-1318: Library mode (?mode=players) is pushed on change, like the view.
    const unsubscribeMode = useLibraryStore.subscribe((state, previous) => {
      if (state.mode === previous.mode) {
        return;
      }
      if (parseLibraryMode(window.location.search) === state.mode) {
        return;
      }
      const search = withLibraryMode(window.location.search, state.mode);
      if (search === window.location.search) {
        return;
      }
      window.history.pushState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    });

    return () => {
      window.removeEventListener("popstate", onPopState);
      unsubscribe();
      unsubscribeMode();
    };
  }, []);
}
