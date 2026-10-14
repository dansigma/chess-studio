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
import type { IDockviewHeaderActionsProps, IDockviewPanelProps, SerializedDockview } from "dockview-core";
import { BoardPanel } from "./BoardPanel";
import { EnginePanel } from "./EnginePanel";
import { EvalGraphPanel } from "./EvalGraphPanel";
import { ReviewPanel } from "./ReviewPanel";
import { ExplorerPanel } from "./ExplorerPanel";
import { FileGamesPanel } from "./FileGamesPanel";
import { GamesPanel } from "./GamesPanel";
import { NotationPanel } from "./NotationPanel";
import { PositionSearchPanel } from "./PositionSearchPanel";
import { RepertoirePanel } from "./RepertoirePanel";
import { PlayerExplorerPanel } from "./PlayerExplorerPanel";
import { PlayerGamesPanel } from "./PlayerGamesPanel";
import {
  BookOpen,
  ChartSpline,
  ClipboardCheck,
  Cpu,
  FileText,
  GitBranch,
  Library,
  ListOrdered,
  Plus,
  Search,
  UserSearch,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  persistDockLayout,
  selectActiveBoard,
  useStudioStore,
} from "@/src/store/studio-store";
import {
  boardIdFromPanelId,
  boardPanelId,
  closeBoardPanel,
  consumeProgrammaticBoardClose,
  explorerTitleForSource,
  firstBoardPanel,
  openBoardPanel,
  registerStudioDock,
  seedDefaultLayout,
} from "./dock-api";
import {
  currentDockLayoutEpoch,
  DOCK_LAYOUT_VERSION,
  isBoardPanelId,
  isExplorerPanelId,
  readStoredDockLayout,
  sanitizeDockLayout,
  setDockLayoutListener,
  takeQueuedDockLayout,
  type DockLayoutSnapshot,
} from "./dock-layout";
import { parseExplorerSource } from "./ExplorerPanel";
import { ChessboardIcon } from "./ui/ChessboardIcon";

const TAB_ICONS: Record<string, LucideIcon> = {
  engine: Cpu,
  evalGraph: ChartSpline,
  review: ClipboardCheck,
  notation: ListOrdered,
  repertoire: GitBranch,
  explorer: BookOpen,
  games: Library,
  fileGames: FileText,
  positionSearch: Search,
  "player-explorer": UserSearch,
  "player-games": Users,
};

function StudioTab(props: IDockviewPanelHeaderProps) {
  // SIG-907: board panels are `board:<boardId>`; match by prefix.
  // SIG-908: same for `explorer:<uid>` panels.
  const Icon =
    TAB_ICONS[props.api.id] ??
    (isBoardPanelId(props.api.id) ? ChessboardIcon : isExplorerPanelId(props.api.id) ? BookOpen : undefined);
  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
      {Icon ? <Icon aria-hidden="true" className="dv-tab-context-icon ml-0.5 shrink-0 transition-opacity" size={13} /> : null}
      <DockviewDefaultTab {...props} />
    </div>
  );
}

// SIG-915: browser-style "+" action on the board tab group — opens a new
// empty session as a tab in the same group. Rendered only when the group
// hosts at least one `board:*` panel; per-tab close is the default
// DockviewDefaultTab close action (handled by onDidRemovePanel → closeBoard).
function BoardGroupHeaderActions(props: IDockviewHeaderActionsProps) {
  const isBoardGroup = props.panels.some((panel) => isBoardPanelId(panel.id));
  if (!isBoardGroup) {
    return null;
  }
  function handleNewBoard(): void {
    useStudioStore.getState().newBoard();
    const state = useStudioStore.getState();
    const active = selectActiveBoard(state);
    openBoardPanel(active.id, active.title);
  }
  return (
    <div className="flex h-full items-center pr-1">
      <button
        type="button"
        title="New board (Ctrl+N)"
        aria-label="New board"
        onClick={handleNewBoard}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-studio-fg hover:bg-studio-hover-strong"
      >
        <Plus aria-hidden="true" size={15} />
      </button>
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

// SIG-907: board panels carry their session id in dockview params
// (`params: { boardId }` at addPanel time); the prop re-renders that session
// independent of the global active board.
function BoardDockPanel(props: IDockviewPanelProps<{ boardId?: string }>) {
  const boardId = props.params?.boardId;
  return <BoardPanel boardId={boardId} />;
}

// SIG-908: explorer panels carry their source in dockview params
// (`params: { explorerId, source }` at addPanel time). Dynamic `explorer:<uid>`
// panels fetch via the shared hook with their own source; the bare `explorer`
// id (no/wrong params) stays on the global store fields (sidebar-driven).
function ExplorerDockPanel(props: IDockviewPanelProps<{ explorerId?: string; source?: unknown }>) {
  const panelId = props.api.id;
  if (!isExplorerPanelId(panelId)) {
    return <ExplorerPanel />;
  }
  const source = parseExplorerSource(props.params?.source);
  return <ExplorerPanel source={source ?? undefined} panelId={panelId} />;
}

const components = {
  board: BoardDockPanel,
  engine: () => <EnginePanel />,
  evalGraph: () => <EvalGraphPanel />,
  review: () => <ReviewPanel />,
  notation: () => <NotationPanel />,
  repertoire: () => <RepertoirePanel />,
  explorer: ExplorerDockPanel,
  games: () => <GamesPanel />,
  fileGames: () => <FileGamesPanel />,
  positionSearch: () => <PositionSearchPanel />,
  playerExplorer: () => <PlayerExplorerPanel />,
  playerGames: () => <PlayerGamesPanel />,
};

function ensureReviewPanel(api: DockviewReadyEvent["api"]): void {
  if (api.getPanel("review")) {
    return;
  }
  // SIG-907: bare `board` id is retired; fall back to any `board:*` panel.
  const reference = api.getPanel("evalGraph") ?? api.getPanel("engine") ?? firstBoardPanel(api);
  api.addPanel({
    id: "review",
    component: "review",
    title: "Game Review",
    inactive: true,
    position: reference ? { referencePanel: reference.id } : undefined,
  });
}

function ensureRepertoirePanel(api: DockviewReadyEvent["api"]): void {
  if (api.getPanel("repertoire")) {
    return;
  }
  // SIG-907: bare `board` id is retired; fall back to any `board:*` panel.
  const reference = api.getPanel("notation") ?? api.getPanel("explorer") ?? firstBoardPanel(api);
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
  // SIG-907: per-board title signature so every `board:*` tab tracks its own
  // session (id+title only — moves must not re-run the title effect).
  const boardTitles = useStudioStore((state) =>
    state.boards.map((board) => `${board.id}:${board.title}`).join("|"),
  );
  const layoutNonce = useStudioStore((state) => state.layoutNonce);
  const playerKey = useStudioStore((state) => state.playerProfile?.id ?? null);
  const playerName = useStudioStore((state) => state.playerProfile?.displayName ?? null);
  const fileGamesTitle = useStudioStore((state) => {
    const database = state.files.databases.find((item) => item.id === state.activeFileDatabaseId);
    return database?.name ?? "Games";
  });
  // SIG-907: hydration gate — restore places verbatim until remote boards
  // settle, then prunes orphan `board:*` panels whose sessions never arrived.
  const boardsHydrated = useStudioStore((state) => state.boardsHydrated);
  const apiRef = useRef<DockviewApi | null>(null);
  const suppressSaves = useRef(0);
  const suppressTimers = useRef<number[]>([]);
  const saveTimer = useRef<number | null>(null);
  const layoutSubscription = useRef<{ dispose: () => void } | null>(null);
  // SIG-907: focus→active + remove→close subscriptions; disposed on
  // re-ready/unmount alongside the layout subscription.
  const panelSubscriptions = useRef<Array<{ dispose: () => void }>>([]);

  // SIG-907: seed needs the session id for the `board:<boardId>` panel id.
  function seedFor(api: DockviewApi): void {
    const state = useStudioStore.getState();
    const active = selectActiveBoard(state);
    seedDefaultLayout(api, active.title || "Board", active.id);
  }

  function disposePanelSubscriptions(): void {
    for (const sub of panelSubscriptions.current) {
      sub.dispose();
    }
    panelSubscriptions.current = [];
  }

  function runWithoutSave(fn: () => void): void {
    suppressSaves.current += 1;
    try {
      fn();
    } finally {
      // SIG-856: keep the id so the timer can be cleared on unmount instead
      // of decrementing the counter on a dead dock.
      const id = window.setTimeout(() => {
        suppressTimers.current = suppressTimers.current.filter((timer) => timer !== id);
        suppressSaves.current = Math.max(0, suppressSaves.current - 1);
      }, 0);
      suppressTimers.current.push(id);
    }
  }

  function placeSnapshot(api: DockviewApi, snapshot: DockLayoutSnapshot): boolean {
    try {
      // Single documented conversion point: sanitizeDockLayout already validated
      // grid.root/panels/activeGroup, so snapshot.dock is JSON-pure;
      // dockview-core exposes no public guard, fromJSON stays in try/catch
      // with a seedDefaultLayout fallback at the call site.
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

  // SIG-907: sync every `board:<boardId>` tab title from the boards list.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    for (const board of useStudioStore.getState().boards) {
      api.getPanel(boardPanelId(board.id))?.setTitle(board.title || "Board");
    }
  }, [boardTitles]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !playerKey || !playerName) {
      return;
    }
    ensurePlayerPanels(api, playerName);
  }, [playerKey, playerName]);

  // SIG-908: per-explorer tab titles. Dynamic `explorer:<uid>` panels own
  // their source in dock params (`persistExplorerSource` sets the title at
  // switch time); this effect re-syncs them when database names change plus
  // keeps the bare sidebar-driven panel tracking the global source.
  const explorerTitles = useStudioStore((state) =>
    `${state.databaseSource}|${state.files.databases.map((item) => `${item.id}:${item.name}`).join("|")}`,
  );
  useEffect(() => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    const state = useStudioStore.getState();
    for (const panel of api.panels) {
      if (!isExplorerPanelId(panel.id)) {
        continue;
      }
      const raw = (panel.api.getParameters() as { source?: unknown } | undefined)?.source;
      const source = parseExplorerSource(raw) ?? state.databaseSource;
      panel.setTitle(explorerTitleForSource(source, state.files.databases));
    }
    api.getPanel("explorer")?.setTitle(explorerTitleForSource(state.databaseSource, state.files.databases));
  }, [explorerTitles]);

  useEffect(() => {
    apiRef.current?.getPanel("fileGames")?.setTitle(fileGamesTitle);
  }, [fileGamesTitle]);

  // SIG-907: hydration-gated orphan prune. Restore places verbatim (remote
  // boards may not have hydrated yet); once boardsHydrated flips, close any
  // `board:*` panel whose session never arrived. Uses the programmatic path
  // so the remove→close handler skips the echo, then reseeds when pruning
  // emptied the dock so the store is never stranded without a board view.
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !boardsHydrated) {
      return;
    }
    const state = useStudioStore.getState();
    const known = new Set(state.boards.map((board) => board.id));
    let pruned = false;
    for (const panel of [...api.panels]) {
      const boardId = boardIdFromPanelId(panel.id);
      if (boardId && !known.has(boardId)) {
        closeBoardPanel(boardId);
        pruned = true;
      }
    }
    if (pruned && !firstBoardPanel(api)) {
      const next = useStudioStore.getState();
      const active = selectActiveBoard(next);
      runWithoutSave(() => {
        openBoardPanel(active.id, active.title || "Board");
      });
    }
  }, [boardsHydrated]);

  useEffect(() => {
    return () => {
      layoutSubscription.current?.dispose();
      disposePanelSubscriptions();
      apiRef.current = null;
      for (const timer of suppressTimers.current) {
        window.clearTimeout(timer);
      }
      suppressTimers.current = [];
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      setDockLayoutListener(null);
      registerStudioDock(null);
    };
  }, []);

  function onReady(event: DockviewReadyEvent) {
    layoutSubscription.current?.dispose();
    disposePanelSubscriptions();
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
          seedFor(api);
        }
        placePlayers(api);
        ensureRepertoirePanel(api);
        ensureReviewPanel(api);
      });
    });
    const saved = takeQueuedDockLayout() ?? readStoredDockLayout();
    runWithoutSave(() => {
      if (!saved || !placeSnapshot(api, saved)) {
        seedFor(api);
      }
      placePlayers(api);
      ensureRepertoirePanel(api);
      ensureReviewPanel(api);
    });
    // SIG-907: focus→active so notation/engine/explorer follow the focused
    // board panel. Guard on "different + exists" — setActiveBoard clears
    // enginePreview/threat/setupMode, so a redundant call on every tab
    // switch would drop overlays. Accept both user and api origins: opening
    // a board panel programmatically (sidebar activate-or-open) activates it.
    // Remove→close: a user-closed `board:*` panel closes its session; our
    // own closeBoardPanel closes are skipped via the programmatic set.
    // Closing the last board panel reseeds a fresh session panel so the
    // store is never stranded without a board view.
    panelSubscriptions.current = [
      api.onDidActivePanelChange(({ panel }) => {
        const boardId = panel ? boardIdFromPanelId(panel.id) : null;
        if (!boardId) {
          return;
        }
        const state = useStudioStore.getState();
        if (state.activeBoardId === boardId) {
          return;
        }
        if (!state.boards.some((board) => board.id === boardId)) {
          return;
        }
        state.setActiveBoard(boardId);
      }),
      api.onDidRemovePanel((panel) => {
        const boardId = boardIdFromPanelId(panel.id);
        if (!boardId) {
          return;
        }
        if (consumeProgrammaticBoardClose(boardId)) {
          return;
        }
        const state = useStudioStore.getState();
        if (!state.boards.some((board) => board.id === boardId)) {
          return;
        }
        state.closeBoard(boardId);
        // SIG-915: explicit neighbor focus — dockview auto-activation is not
        // guaranteed to pick the store-chosen previous-else-next neighbor, and
        // the focus handler would then flip active away from it. Focusing the
        // neighbor panel keeps dock and store in agreement (last-board reseed
        // included: closeBoard reseeds the store, openBoardPanel its panel).
        const next = useStudioStore.getState();
        const active = selectActiveBoard(next);
        runWithoutSave(() => {
          openBoardPanel(active.id, active.title || "Board");
        });
      }),
    ];
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
      rightHeaderActionsComponent={BoardGroupHeaderActions}
      onReady={onReady}
    />
  );
}
