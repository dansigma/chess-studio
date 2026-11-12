"use client";

import { useEffect } from "react";
import { useStudioStore } from "@/src/store/studio-store";
import { parseWorkspaceView, withWorkspaceView } from "./workspace-view-url";

// SIG-1273: keeps `workspaceView` and `?view=library|live` in sync. URL → store on
// mount and on back/forward; store → URL (pushState) on every change, so
// reload and history both land on the right view.
export function useWorkspaceViewUrl(): void {
  useEffect(() => {
    useStudioStore.getState().setWorkspaceView(parseWorkspaceView(window.location.search));

    const onPopState = () => {
      useStudioStore.getState().setWorkspaceView(parseWorkspaceView(window.location.search));
    };
    window.addEventListener("popstate", onPopState);

    const unsubscribe = useStudioStore.subscribe((state, previous) => {
      if (state.workspaceView === previous.workspaceView) {
        return;
      }
      if (parseWorkspaceView(window.location.search) === state.workspaceView) {
        return;
      }
      const search = withWorkspaceView(window.location.search, state.workspaceView);
      window.history.pushState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    });

    return () => {
      window.removeEventListener("popstate", onPopState);
      unsubscribe();
    };
  }, []);
}
