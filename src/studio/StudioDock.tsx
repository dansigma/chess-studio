"use client";

import { useEffect, useRef } from "react";
import {
  DockviewDefaultTab,
  DockviewReact,
  themeVisualStudio,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
} from "dockview-react";
import type { SerializedDockview } from "dockview-core";
import { BoardPanel } from "./BoardPanel";
import { EnginePanel } from "./EnginePanel";
import { EvalGraphPanel } from "./EvalGraphPanel";
import { ExplorerPanel } from "./ExplorerPanel";
import { FileGamesPanel } from "./FileGamesPanel";
import { GamesPanel } from "./GamesPanel";
import { NotationPanel } from "./NotationPanel";
import { RepertoirePanel } from "./RepertoirePanel";
import { PlayerExplorerPanel } from "./PlayerExplorerPanel";
import { PlayerGamesPanel } from "./PlayerGamesPanel";
import {
  BookOpen,
  ChartSpline,
  Cpu,
  FileText,
  GitBranch,
  LayoutGrid,
  Library,
  ListOrdered,
  UserSearch,
  Users,
  type LucideIcon,
} from "lucide-react";
import { persistDockLayout, useStudioStore } from "@/src/store/studio-store";
import { registerStudioDock, seedDefaultLayout } from "./dock-api";
import {
  currentDockLayoutEpoch,
  DOCK_LAYOUT_VERSION,
  readStoredDockLayout,
  sanitizeDockLayout,
  setDockLayoutListener,
  takeQueuedDockLayout,
  type DockLayoutSnapshot,
} from "./dock-layout";

const TAB_ICONS: Record<string, LucideIcon> = {
  board: LayoutGrid,
  engine: Cpu,
  evalGraph: ChartSpline,
  notation: ListOrdered,
  repertoire: GitBranch,
  explorer: BookOpen,
  games: Library,
  fileGames: FileText,
  "player-explorer": UserSearch,
  "player-games": Users,
};

function StudioTab(props: IDockviewPanelHeaderProps) {
  const Icon = TAB_ICONS[props.api.id];
  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-hidden">
      {Icon ? <Icon aria-hidden="true" className="ml-0.5 shrink-0 opacity-70" size={13} /> : null}
      <DockviewDefaultTab {...props} />
    </div>
  );
}

const studioTheme = {
  ...themeVisualStudio,
  name: "xadrezDigital",
  gap: 8,
  dndOverlayMounting: "absolute" as const,
  dndPanelOverlay: "group" as const,
};

const components = {
  board: () => <BoardPanel />,
  engine: () => <EnginePanel />,
  evalGraph: () => <EvalGraphPanel />,
  notation: () => <NotationPanel />,
  repertoire: () => <RepertoirePanel />,
  explorer: () => <ExplorerPanel />,
  games: () => <GamesPanel />,
  fileGames: () => <FileGamesPanel />,
  playerExplorer: () => <PlayerExplorerPanel />,
  playerGames: () => <PlayerGamesPanel />,
};

function ensureRepertoirePanel(api: DockviewReadyEvent["api"]): void {
  if (api.getPanel("repertoire")) {
    return;
  }
  const reference = api.getPanel("notation") ?? api.getPanel("explorer") ?? api.getPanel("board");
  api.addPanel({
    id: "repertoire",
    component: "repertoire",
    title: "Repertoire",
    inactive: true,
    position: reference ? { referencePanel: reference.id } : undefined,
  });
}

function ensurePlayerPanels(api: DockviewReadyEvent["api"], title: string) {
  const explorer = api.getPanel("player-explorer");
  if (!explorer) {
    api.addPanel({
      id: "player-explorer",
      component: "playerExplorer",
      title,
      position: { referencePanel: "notation" },
    });
  } else {
    explorer.setTitle(title);
  }
  const games = api.getPanel("player-games");
  if (!games) {
    api.addPanel({
      id: "player-games",
      component: "playerGames",
      title: `${title} — games`,
      position: { referencePanel: "notation" },
    });
  } else {
    games.setTitle(`${title} — games`);
  }
  api.getPanel("player-games")?.api.setActive();
}

export function StudioDock() {
  const title = useStudioStore((state) => {
    const board =
      state.boards.find((item) => item.id === state.activeBoardId) ?? state.boards[0];
    return board.title;
  });
  const layoutNonce = useStudioStore((state) => state.layoutNonce);
  const playerKey = useStudioStore((state) => state.playerProfile?.id ?? null);
  const playerName = useStudioStore((state) => state.playerProfile?.displayName ?? null);
  const fileGamesTitle = useStudioStore((state) => {
    const database = state.files.databases.find((item) => item.id === state.activeFileDatabaseId);
    return database?.name ?? "Games";
  });
  const apiRef = useRef<DockviewApi | null>(null);
  const suppressSaves = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const layoutSubscription = useRef<{ dispose: () => void } | null>(null);

  function boardTitle(): string {
    return title || "Board";
  }

  function runWithoutSave(fn: () => void): void {
    suppressSaves.current += 1;
    try {
      fn();
    } finally {
      window.setTimeout(() => {
        suppressSaves.current = Math.max(0, suppressSaves.current - 1);
      }, 0);
    }
  }

  function placeSnapshot(api: DockviewApi, snapshot: DockLayoutSnapshot): boolean {
    try {
      api.fromJSON(snapshot.dock as unknown as SerializedDockview);
      return true;
    } catch {
      return false;
    }
  }

  function placePlayers(api: DockviewApi): void {
    const player = useStudioStore.getState().playerProfile;
    if (player) {
      ensurePlayerPanels(api, player.displayName);
    }
  }

  useEffect(() => {
    apiRef.current?.getPanel("board")?.setTitle(title || "Board");
  }, [title]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !playerKey || !playerName) {
      return;
    }
    ensurePlayerPanels(api, playerName);
  }, [playerKey, playerName]);

  useEffect(() => {
    apiRef.current?.getPanel("fileGames")?.setTitle(fileGamesTitle);
  }, [fileGamesTitle]);

  useEffect(() => {
    return () => {
      layoutSubscription.current?.dispose();
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      setDockLayoutListener(null);
      registerStudioDock(null);
    };
  }, []);

  function onReady(event: DockviewReadyEvent) {
    layoutSubscription.current?.dispose();
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const api = event.api;
    apiRef.current = api;
    registerStudioDock(api);
    setDockLayoutListener((snapshot) => {
      runWithoutSave(() => {
        if (!placeSnapshot(api, snapshot)) {
          seedDefaultLayout(api, boardTitle());
        }
        placePlayers(api);
        ensureRepertoirePanel(api);
      });
    });
    const saved = takeQueuedDockLayout() ?? readStoredDockLayout();
    runWithoutSave(() => {
      if (!saved || !placeSnapshot(api, saved)) {
        seedDefaultLayout(api, boardTitle());
      }
      placePlayers(api);
      ensureRepertoirePanel(api);
    });
    layoutSubscription.current = api.onDidLayoutChange(() => {
      if (suppressSaves.current > 0) {
        return;
      }
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      const epoch = currentDockLayoutEpoch();
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        if (epoch !== currentDockLayoutEpoch()) {
          return;
        }
        const snapshot = sanitizeDockLayout({
          version: DOCK_LAYOUT_VERSION,
          dock: api.toJSON(),
        });
        if (!snapshot) {
          return;
        }
        void persistDockLayout(snapshot, epoch).catch(() => undefined);
      }, 400);
    });
  }

  return (
    <DockviewReact
      key={`${layoutNonce}-${DOCK_LAYOUT_VERSION}`}
      className="h-full w-full"
      theme={studioTheme}
      components={components}
      defaultTabComponent={StudioTab}
      onReady={onReady}
    />
  );
}
