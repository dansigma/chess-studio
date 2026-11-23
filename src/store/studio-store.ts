import { create } from "zustand";
import { currentDockLayoutEpoch, type DockLayoutSnapshot } from "@/src/studio/dock-layout";
import { recentSans } from "@/src/chess/pgn";
import { pathsEqual } from "@/src/chess/tree";
import { tSidebar } from "@/src/i18n/studio-sidebar-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { saveLocalBookmarks } from "@/src/lib/player-bookmarks";
import { clearGuestBoards } from "@/src/lib/guest-boards";
import { purgeUserLocalCaches } from "@/src/lib/local-cache";
import { resetCourseProgressState } from "@/src/courses/store";
import { clearLocalFiles, EMPTY_FILES } from "@/src/lib/user-files";
// SIG-857 Phase C: slice modules own types, selectors, board helpers, and
// settings defaults. The store composes them into the single create() below
// so all 30+ existing `@/src/store/studio-store` import paths keep working.
import { pruneBoardHistories } from "./slices/board-history";
import { emptyBoard } from "./slices/board-helpers";
import { createFilesSlice, unblockLocalWrites } from "./slices/files";
import { createBoardsSlice } from "./slices/boards";
import { INACTIVE_RETRY, createRetrySlice } from "./slices/retry";
import { createEngineSlice } from "./slices/engine";
import { DEFAULT_SETTINGS, createSettingsSlice } from "./slices/settings";
import { createBoardEditSlice } from "./slices/board-edit";
import { createRepertoireActionsSlice } from "./slices/repertoire-actions";
import { createDockSlice } from "./slices/dock";
import {
  forgetRemoteDockSync as _forgetRemoteDockSync,
  persistBoardRecord,
  persistDockLayoutRecord,
  persistSettingsRecord,
  loadRemoteSettingsForUser,
  syncRemoteDockLayout as _syncRemoteDockLayout,
  forgetRemoteLayoutsSync as _forgetRemoteLayoutsSync,
  syncRemoteSavedLayouts as _syncRemoteSavedLayouts,
} from "@/src/lib/studio-persistence";
import type {
  BoardSession,
  SessionResetPayload,
  SettingsDialogState,
  StudioSettings,
  StudioState,
} from "./slices/types";

export type { BoardTheme } from "@/src/chess/board-themes";
export type { PieceSet } from "@/src/chess/piece-sets";
export type { MoveNotation } from "@/src/chess/move-notation";
export type { ColorScheme } from "@/src/studio/color-scheme";
export type { GameTree, Path } from "@/src/chess/tree";
export type { MarkColor } from "@/src/chess/marks";
export type {
  PlayerColorFilter,
  PlayerGame,
  PlayerHit,
  PlayerResultFilter,
} from "@/src/lib/player-types";
export type { PlayerBookmark } from "@/src/lib/player-bookmarks";
export type { EngineBuild } from "@/src/engine/stockfish-client";
export type { ExplorerResponse, ExplorerSource } from "@/src/lib/explorer-types";
export type { ExplorerFilters } from "@/src/lib/explorer-filters";
export { DEFAULT_EXPLORER_FILTERS, readExplorerFilters } from "@/src/lib/explorer-filters";
export type {
  FileDatabase,
  FileGame,
  FilesLibrary,
} from "@/src/lib/user-files";
export type {
  ActivityView,
  BoardOrientation,
  BoardSession,
  CachedEval,
  EngineEval,
  EnginePreview,
  SessionDataKey,
  SessionResetPayload,
  SettingsDialogSection,
  SettingsDialogState,
  StudioSettings,
  StudioState,
  UserInfo,
} from "./slices/types";
export {
  selectActiveBoard,
  selectActiveBoardId,
  selectActivePathKey,
  selectBoard,
  selectDirtyCount,
  selectRepertoireBoard,
} from "./slices/selectors";
export { DEFAULT_SETTINGS, SETTINGS_KEY, loadLocalSettings } from "./slices/settings";
export { emptyBoard, newId, withActive, analysisFen } from "./slices/board-helpers";

let sessionFilesClear: Promise<boolean> | undefined;

export async function clearSessionFilesBeforeSignOut(): Promise<void> {
  const previousClear = sessionFilesClear;
  if (!(await previousClear) && sessionFilesClear === previousClear) {
    sessionFilesClear = clearLocalFiles();
  }
  await sessionFilesClear;
}

const CLOSED_SETTINGS_DIALOG: SettingsDialogState = { open: false, section: null };

function withWorkspaceView(
  state: StudioState,
  workspaceView: StudioState["workspaceView"],
): Partial<StudioState> {
  if (state.workspaceView === workspaceView) return {};
  return { workspaceView, settings: { ...state.settings, sidebarCollapsed: true } };
}

export const useStudioStore = create<StudioState>((set, get) => ({
  // Board navigation/move state lives in slices/boards.ts and engine state in
  // slices/engine.ts; the third StateCreator arg (store api) is unused by
  // those slices, so pass a placeholder to avoid a self-reference to
  // useStudioStore inside its own initializer.
  ...createEngineSlice(set, get, undefined as never),
  ...createBoardsSlice(set, get, undefined as never),
  // SIG-1209: Game Review retry session lives in slices/retry.ts.
  ...createRetrySlice(set, get, undefined as never),
  // SIG-917: files/bookmarks initial state + actions live in slices/files.ts.
  ...createFilesSlice(set, get, undefined as never),
  // SIG-944: settings actions live in slices/settings.ts; the store keeps only
  // the `settings` field below.
  ...createSettingsSlice(set, get, undefined as never),
  // SIG-944: board-edit/import/setup actions live in slices/board-edit.ts.
  ...createBoardEditSlice(set, get, undefined as never),
  // SIG-1094: deviation one-click fixes live in slices/repertoire-actions.ts.
  ...createRepertoireActionsSlice(set, get, undefined as never),
  // SIG-944: dock layout state/actions live in slices/dock.ts.
  ...createDockSlice(set, get, undefined as never),
  setActivity: (activity) =>
    set((state) => ({
      activity,
      settings: { ...state.settings, sidebarCollapsed: false },
    })),
  // SIG-1317: any real change of the center view closes the side panel (it
  // belongs to the Studio). Re-selecting the current view is a no-op.
  setWorkspaceView: (workspaceView) =>
    set((state) => withWorkspaceView(state, workspaceView)),
  toggleLibrary: () =>
    set((state) =>
      withWorkspaceView(state, state.workspaceView === "library" ? "studio" : "library"),
    ),
  toggleLive: () =>
    set((state) =>
      withWorkspaceView(state, state.workspaceView === "live" ? "studio" : "live"),
    ),
  setDatabaseSource: (databaseSource) => set({ databaseSource }),
  activity: "boards",
  workspaceView: "studio",
  databaseSource: "masters",
  settings: DEFAULT_SETTINGS,
  user: null,
  explorer: null,
  explorerLoading: false,
  explorerGamesLoading: false,
  explorerError: null,
  explorerRetry: 0,
  statusMessage: null,
  aboutOpen: false,
  shortcutsOpen: false,
  saveAsOpen: false,
  addToDatabaseOpen: false,
  settingsDialog: CLOSED_SETTINGS_DIALOG,
  notationEditor: null,
  playerProfile: null,
  playerGames: [],
  playerGamesLoading: false,
  playerGamesNotice: null,
  playerColorFilter: "all",
  playerResultFilter: "all",
  setExplorer: (explorer) => set({ explorer }),
  setExplorerGamesLoading: (explorerGamesLoading) => set({ explorerGamesLoading }),
  setExplorerLoading: (explorerLoading) => set({ explorerLoading }),
  setExplorerError: (explorerError) => set({ explorerError }),
  retryExplorer: () => set((state) => ({ explorerRetry: state.explorerRetry + 1 })),
  setStatus: (statusMessage) => set({ statusMessage }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setAddToDatabaseOpen: (addToDatabaseOpen) => set({ addToDatabaseOpen }),
  setSaveAsOpen: (saveAsOpen) => set({ saveAsOpen }),
  openSettings: (section) => set({ settingsDialog: { open: true, section: section ?? null } }),
  closeSettings: () => set({ settingsDialog: CLOSED_SETTINGS_DIALOG }),
  setNotationEditor: (notationEditor) => set({ notationEditor }),
  openPlayerView: (player, color = "all") => {
    const current = get().playerProfile;
    if (current?.id === player.id) {
      set({
        playerColorFilter: color,
        playerResultFilter: "all",
      });
      return;
    }
    set({
      playerProfile: player,
      playerColorFilter: color,
      playerResultFilter: "all",
      playerGames: [],
      playerGamesLoading: true,
      playerGamesNotice: null,
    });
  },
  setPlayerGames: (playerGames, notice) =>
    set({
      playerGames,
      playerGamesLoading: false,
      playerGamesNotice: notice ?? null,
    }),
  setPlayerGamesLoading: (playerGamesLoading) => set({ playerGamesLoading }),
  setPlayerColorFilter: (playerColorFilter) => set({ playerColorFilter }),
  setPlayerResultFilter: (playerResultFilter) => set({ playerResultFilter }),
  setUser: (user) => {
    const previousId = get().user?.id ?? null;
    const nextId = user?.id ?? null;
    set({ user });
    if (nextId !== null && nextId !== previousId) {
      sessionFilesClear = undefined;
    }
    if (previousId !== null && previousId !== nextId) {
      return get().resetSessionState();
    }
    // The browser auth listener may have already reset the signed-out session.
    if (nextId === null) return sessionFilesClear;
  },
  resetSessionState: () => {
    // SIG-886: the course/puzzle local caches are per-account data — purge
    // them with the files/bookmarks so the next account never reads the
    // previous user's rows. Anonymous trial data is safe: this reset only
    // runs on an account change with a previous user, never on anon login.
    // SIG-1092: guest boards are local-only — drop them too so the guest
    // snapshot never leaks into the next account (sign-in carries the live
    // in-memory boards; the shell clears the snapshot again on user set).
    purgeUserLocalCaches();
    get().hydrateSavedLayouts([]);
    clearGuestBoards();
    resetCourseProgressState();
    // Always clear again: a save may have landed after an earlier pre-sign-out
    // clear. A signed-out reset is remembered so sign-out can await it.
    const filesClear = clearLocalFiles();
    // The previous account's snapshot is gone; the new session may write again.
    unblockLocalWrites();
    if (!get().user) {
      sessionFilesClear = filesClear;
    }
    saveLocalBookmarks([]);
    const board = emptyBoard();
    const sessionReset = {
      boards: [board],
      // intentional: initializer seeds "" and resolves via the boards[0] fallback; the reset assigns the id directly like the post-create block — same single empty board either way
      activeBoardId: board.id,
      // SIG-907: the reset board is the whole session, so it is hydrated.
      boardsHydrated: true,
      activity: "boards",
      workspaceView: "studio",
      databaseSource: "masters",
      explorer: null,
      explorerLoading: false,
      explorerGamesLoading: false,
      explorerError: null,
      explorerRetry: 0,
      statusMessage: null,
      // SIG-1384: signing out drops any pending cut undo with the session.
      pendingCutUndo: null,
      boardHistories: new Map(),
      aboutOpen: false,
      shortcutsOpen: false,
      saveAsOpen: false,
      addToDatabaseOpen: false,
      settingsDialog: CLOSED_SETTINGS_DIALOG,
      notationEditor: null,
      enginePreview: null,
      engineEval: null,
      evalByFen: {},
      threat: null,
      showThreat: false,
      insightMarks: null,
      explorerHover: null,
      playerProfile: null,
      playerGames: [],
      playerGamesLoading: false,
      playerGamesNotice: null,
      playerColorFilter: "all",
      playerResultFilter: "all",
      files: EMPTY_FILES,
      filesHydrated: true,
      filesQuery: "",
      activeFileDatabaseId: null,
      activeFileGameId: null,
      bookmarks: [],
      setupMode: false,
      training: false,
      trainingStart: null,
      trainingCatalogPositions: undefined,
      dueDrill: null,
      trainingMiss: null,
      trainingUserColor: "w",
      drillDueOnly: false,
      repertoireProgress: {},
      mistakeExercises: {},
      // SIG-1187: a signed-out session never carries a pending chooser.
      variationChoice: null,
      pendingVariationMerge: null,
      // SIG-1209: a signed-out session never carries a retry.
      retry: INACTIVE_RETRY,
    } satisfies SessionResetPayload;
    get().exitRetry({ restorePath: false });
    set(sessionReset);
    return filesClear;
  },
}));

// SIG-1209: safety net for board changes that bypass the explicit exits (a PGN
// import, a file open, a remote board hydrate): a retry only lives while its
// board is the active one and still sits on the retry position.
useStudioStore.subscribe((state) => {
  const retry = state.retry;
  if (!retry.active) {
    return;
  }
  const board = state.boards.find((item) => item.id === retry.boardId);
  if (!board || state.activeBoardId !== board.id || !pathsEqual(board.path, retry.parentPath)) {
    state.exitRetry({ restorePath: false });
  }
});

useStudioStore.subscribe((state, previous) => {
  if (state.boards === previous.boards || state.boardHistories.size === 0) return;
  const boardHistories = pruneBoardHistories(state);
  if (boardHistories !== state.boardHistories) useStudioStore.setState({ boardHistories });
});

// SIG-1384: the Desfazer toast only lives while the active board still holds
// the tree the cut produced. Board replacement, a switch or a close drops
// the toast. Navigation alone keeps the same tree and the toast alive.
useStudioStore.subscribe((state) => {
  const pending = state.pendingCutUndo;
  if (!pending) {
    return;
  }
  const board = state.boards.find((item) => item.id === pending.boardId);
  if (!board || state.activeBoardId !== pending.boardId || board.tree !== pending.cutTree) {
    state.dismissCutUndo();
  }
});

const initial = useStudioStore.getState();
if (!initial.activeBoardId && initial.boards[0]) {
  useStudioStore.setState({ activeBoardId: initial.boards[0].id });
}

export function boardPreview(board: BoardSession, locale: SiteLocale = "en"): string {
  return recentSans(board.tree, board.path) || tSidebar(locale, "sidebar.boards.startingPosition");
}

// SIG-917: remote persistence lives in lib/studio-persistence.ts (store-free,
// parameterized by explicit user id). These same-name wrappers read the user
// from the store so all existing consumer imports keep working unchanged.
export async function persistBoard(board: BoardSession): Promise<string | null> {
  return persistBoardRecord(board, useStudioStore.getState().user?.id ?? null);
}

export async function persistSettings(settings: StudioSettings): Promise<void> {
  return persistSettingsRecord(settings, useStudioStore.getState().user?.id ?? null);
}

export async function loadRemoteSettings(): Promise<Partial<StudioSettings> | null> {
  return loadRemoteSettingsForUser(useStudioStore.getState().user?.id ?? null);
}

export function forgetRemoteDockSync(): void {
  return _forgetRemoteDockSync();
}

export function syncRemoteDockLayout(userId: string): Promise<void> {
  return _syncRemoteDockLayout(userId);
}

export function forgetRemoteLayoutsSync(): void {
  return _forgetRemoteLayoutsSync();
}

// SIG-1316: pull the account's saved layouts into the store.
export async function syncRemoteSavedLayouts(userId: string): Promise<void> {
  const layouts = await _syncRemoteSavedLayouts(userId);
  if (layouts && useStudioStore.getState().user?.id === userId) {
    useStudioStore.getState().hydrateSavedLayouts(layouts);
  }
}

export async function persistDockLayout(
  snapshot: DockLayoutSnapshot | null,
  epoch = currentDockLayoutEpoch(),
): Promise<void> {
  return persistDockLayoutRecord(
    snapshot,
    epoch,
    useStudioStore.getState().user?.id ?? null,
  );
}
