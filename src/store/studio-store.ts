import { create } from "zustand";
import { currentDockLayoutEpoch, type DockLayoutSnapshot } from "@/src/studio/dock-layout";
import { recentSans } from "@/src/chess/pgn";
import { saveLocalBookmarks } from "@/src/lib/player-bookmarks";
import { purgeUserLocalCaches } from "@/src/lib/local-cache";
import { resetCourseProgressState } from "@/src/courses/store";
import { EMPTY_FILES, saveLocalFiles } from "@/src/lib/user-files";
// SIG-857 Phase C: slice modules own types, selectors, board helpers, and
// settings defaults. The store composes them into the single create() below
// so all 30+ existing `@/src/store/studio-store` import paths keep working.
import { emptyBoard } from "./slices/board-helpers";
import { createFilesSlice } from "./slices/files";
import { createBoardsSlice } from "./slices/boards";
import { createEngineSlice } from "./slices/engine";
import { DEFAULT_SETTINGS, createSettingsSlice } from "./slices/settings";
import { createBoardEditSlice } from "./slices/board-edit";
import { createDockSlice } from "./slices/dock";
import {
  forgetRemoteDockSync as _forgetRemoteDockSync,
  persistBoardRecord,
  persistDockLayoutRecord,
  persistSettingsRecord,
  loadRemoteSettingsForUser,
  syncRemoteDockLayout as _syncRemoteDockLayout,
} from "@/src/lib/studio-persistence";
import type {
  BoardSession,
  SessionResetPayload,
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
} from "./slices/selectors";
export { DEFAULT_SETTINGS, SETTINGS_KEY, loadLocalSettings } from "./slices/settings";
export { emptyBoard, newId, withActive, analysisFen } from "./slices/board-helpers";

export const useStudioStore = create<StudioState>((set, get) => ({
  // Board navigation/move state lives in slices/boards.ts and engine state in
  // slices/engine.ts; the third StateCreator arg (store api) is unused by
  // those slices, so pass a placeholder to avoid a self-reference to
  // useStudioStore inside its own initializer.
  ...createEngineSlice(set, get, undefined as never),
  ...createBoardsSlice(set, get, undefined as never),
  // SIG-917: files/bookmarks initial state + actions live in slices/files.ts.
  ...createFilesSlice(set, get, undefined as never),
  // SIG-944: settings actions live in slices/settings.ts; the store keeps only
  // the `settings` field below.
  ...createSettingsSlice(set, get, undefined as never),
  // SIG-944: board-edit/import/setup actions live in slices/board-edit.ts.
  ...createBoardEditSlice(set, get, undefined as never),
  // SIG-944: dock layout state/actions live in slices/dock.ts.
  ...createDockSlice(set, get, undefined as never),
  setActivity: (activity) =>
    set((state) => ({
      activity,
      settings: { ...state.settings, sidebarCollapsed: false },
    })),
  setDatabaseSource: (databaseSource) => set({ databaseSource }),
  activity: "boards",
  databaseSource: "masters",
  settings: DEFAULT_SETTINGS,
  user: null,
  explorer: null,
  explorerLoading: false,
  explorerError: null,
  explorerRetry: 0,
  statusMessage: null,
  aboutOpen: false,
  notationEditor: null,
  playerProfile: null,
  playerGames: [],
  playerGamesLoading: false,
  playerGamesNotice: null,
  playerColorFilter: "all",
  playerResultFilter: "all",
  setExplorer: (explorer) => set({ explorer }),
  setExplorerLoading: (explorerLoading) => set({ explorerLoading }),
  setExplorerError: (explorerError) => set({ explorerError }),
  retryExplorer: () => set((state) => ({ explorerRetry: state.explorerRetry + 1 })),
  setStatus: (statusMessage) => set({ statusMessage }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
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
    if (previousId !== null && previousId !== nextId) {
      get().resetSessionState();
    }
  },
  resetSessionState: () => {
    // SIG-886: the course/puzzle local caches are per-account data — purge
    // them with the files/bookmarks so the next account never reads the
    // previous user's rows. Anonymous trial data is safe: this reset only
    // runs on an account change with a previous user, never on anon login.
    purgeUserLocalCaches();
    resetCourseProgressState();
    saveLocalFiles(EMPTY_FILES);
    saveLocalBookmarks([]);
    const board = emptyBoard();
    const sessionReset = {
      boards: [board],
      // intentional: initializer seeds "" and resolves via the boards[0] fallback; the reset assigns the id directly like the post-create block — same single empty board either way
      activeBoardId: board.id,
      // SIG-907: the reset board is the whole session, so it is hydrated.
      boardsHydrated: true,
      activity: "boards",
      databaseSource: "masters",
      explorer: null,
      explorerLoading: false,
      explorerError: null,
      explorerRetry: 0,
      statusMessage: null,
      aboutOpen: false,
      notationEditor: null,
      enginePreview: null,
      engineEval: null,
      evalByFen: {},
      threat: null,
      showThreat: false,
      insightMarks: null,
      playerProfile: null,
      playerGames: [],
      playerGamesLoading: false,
      playerGamesNotice: null,
      playerColorFilter: "all",
      playerResultFilter: "all",
      files: EMPTY_FILES,
      filesQuery: "",
      activeFileDatabaseId: null,
      activeFileGameId: null,
      bookmarks: [],
      setupMode: false,
      training: false,
      trainingStart: null,
      drillDueOnly: false,
      repertoireProgress: {},
    } satisfies SessionResetPayload;
    set(sessionReset);
  },
}));

const initial = useStudioStore.getState();
if (!initial.activeBoardId && initial.boards[0]) {
  useStudioStore.setState({ activeBoardId: initial.boards[0].id });
}

export function boardPreview(board: BoardSession): string {
  return recentSans(board.tree, board.path) || "starting position";
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
