"use client";

import { useEffect, useState } from "react";
import type { IDockviewHeaderActionsProps } from "dockview-core";
import { Maximize2, Minimize2, Plus } from "lucide-react";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { boardTitle, openBoardPanel } from "./dock-api";
import { isBoardPanelId } from "./dock-layout";

const actionClassName =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-studio-fg hover:bg-studio-hover-strong";

export function GroupHeaderActions({ api, containerApi, panels, activePanel, location }: IDockviewHeaderActionsProps) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [maximized, setMaximized] = useState(() => api.isMaximized());
  const isBoardGroup = panels.some((panel) => isBoardPanelId(panel.id));

  useEffect(() => {
    function syncMaximized() {
      setMaximized(api.isMaximized());
    }
    const subscription = containerApi.onDidMaximizedGroupChange(syncMaximized);
    syncMaximized();
    return () => subscription.dispose();
  }, [api, containerApi]);

  function handleNewBoard() {
    useStudioStore.getState().newBoard();
    const state = useStudioStore.getState();
    const active = selectActiveBoard(state);
    openBoardPanel(active.id, boardTitle(state.settings.locale, active.title));
  }

  function toggleMaximized() {
    if (api.isMaximized()) {
      containerApi.exitMaximizedGroup();
    } else if (activePanel) {
      containerApi.maximizeGroup(activePanel);
    } else {
      api.maximize();
    }
  }

  const label = tStudioChrome(locale, maximized ? "chrome.dock.restore" : "chrome.dock.maximize");
  const Icon = maximized ? Minimize2 : Maximize2;

  return (
    <div className="flex h-full items-center pr-1">
      {isBoardGroup ? (
        <button
          type="button"
          title={tPanels(locale, "panels.board.newBoardHint", { shortcut: "Ctrl+N" })}
          aria-label={tPanels(locale, "panels.board.newBoard")}
          onClick={handleNewBoard}
          className={actionClassName}
        >
          <Plus aria-hidden="true" size={15} />
        </button>
      ) : null}
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={toggleMaximized}
        disabled={location !== undefined && location.type !== "grid"}
        className={`${actionClassName} disabled:opacity-40`}
      >
        <Icon aria-hidden="true" size={15} />
      </button>
    </div>
  );
}
