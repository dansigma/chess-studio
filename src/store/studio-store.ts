import { Chess } from "chess.js";
import { create } from "zustand";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { toJson } from "@/src/lib/supabase/database.types";
import {
  bumpDockLayoutEpoch,
  clearStoredDockLayout,
  currentDockLayoutEpoch,
  publishDockLayout,
  readStoredDockLayout,
  sanitizeDockLayout,
  writeStoredDockLayout,
  type DockLayoutSnapshot,
} from "@/src/studio/dock-layout";
import {
  START_FEN,
  createEmptyTree,
  deleteAfter,
  deleteVariation,
  getFenAt,
  getMarksAt,
  getNodeAt,
  makeMainline,
  mainlinePathForFen,
  playMove,
  promoteVariation,
  setNodeComment,
  setNodeCommentBefore,
  setNodeMarks,
  setNodeNags,
} from "@/src/chess/tree";
import { exportPgn, importPgn, importSans, openListedFileGame, openablePgn, recentSans, titleFromHeaders, type GameHeaders } from "@/src/chess/pgn";
import { toggleNag } from "@/src/chess/nags";
import { playMoveSound, shouldPlayMoveSound } from "@/src/chess/move-sound";
import {
  emptyMarks,
  marksAreEmpty,
  toggleArrowMark,
  toggleSquareMark,
} from "@/src/chess/marks";
import {
  bookmarkKey,
  deleteRemoteBookmark,
  loadLocalBookmarks,
  loadRemoteBookmarks,
  mergeBookmarks,
  persistRemoteBookmark,
  removeBookmark,
  saveLocalBookmarks,
  upsertBookmark,
} from "@/src/lib/player-bookmarks";
import {
  clampDepth,
  clampLines,
  clampThreads,
} from "@/src/engine/stockfish-client";
import { fileDatabaseId } from "@/src/lib/explorer-types";
import { dropFilesExplorerIndex } from "@/src/lib/files-explorer";
import { purgeUserLocalCaches } from "@/src/lib/local-cache";
import { resetCourseProgressState } from "@/src/courses/store";
import { isLegalSetupFen } from "@/src/chess/setup-fen";
import { applyNullMoveFen, NULL_MOVE_SAN, NULL_MOVE_UCI } from "@/src/chess/null-move";
import { isBoardTheme } from "@/src/chess/board-themes";
import { isPieceSet } from "@/src/chess/piece-sets";
import {
  EMPTY_FILES,
  deleteRemoteDatabase,
  libraryFromPgn,
  loadLocalFiles,
  persistRemoteDatabase,
  saveLocalFiles,
  type FileFolder,
} from "@/src/lib/user-files";
// SIG-857 Phase C: slice modules own types, selectors, board helpers, and
// settings defaults. The store composes them into the single create() below
// so all 30+ existing `@/src/store/studio-store` import paths keep working.
import { emptyBoard, newId, withActive, analysisFen } from "./slices/board-helpers";
import { createBoardsSlice } from "./slices/boards";
import { createEngineSlice } from "./slices/engine";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  loadLocalSettings,
} from "./slices/settings";
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
  layoutNonce: 0,
  playerProfile: null,
  playerGames: [],
  playerGamesLoading: false,
  playerGamesNotice: null,
  playerColorFilter: "all",
  playerResultFilter: "all",
  files: loadLocalFiles(),
  filesQuery: "",
  activeFileDatabaseId: null,
  activeFileGameId: null,
  bookmarks: loadLocalBookmarks(),
  setupMode: false,
  flip: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        orientation: board.orientation === "white" ? "black" : "white",
        dirty: true,
      })),
    }));
  },
  toggleCoordinates: () => {
    set((state) => ({
      settings: {
        ...state.settings,
        showCoordinates: !state.settings.showCoordinates,
      },
    }));
  },
  toggleMoveSound: () => {
    set((state) => ({
      settings: {
        ...state.settings,
        moveSound: !state.settings.moveSound,
      },
    }));
  },
  toggleEvalBar: () => {
    set((state) => ({
      settings: {
        ...state.settings,
        showEvalBar: !state.settings.showEvalBar,
      },
    }));
  },
  toggleGamePreview: () => {
    set((state) => {
      const enabled = !state.settings.gamePreviewEnabled;
      return {
        settings: { ...state.settings, gamePreviewEnabled: enabled },
        boards: enabled
          ? state.boards
          : state.boards.map((board) => (board.preview ? { ...board, preview: false } : board)),
      };
    });
  },
  pinPreviewBoard: (id) => {
    set((state) => ({
      boards: state.boards.map((board) =>
        board.id === id && board.preview ? { ...board, preview: false } : board,
      ),
    }));
  },
  setBoardTheme: (boardTheme) => {
    set((state) => ({ settings: { ...state.settings, boardTheme } }));
  },
  setPieceSet: (pieceSet) => {
    set((state) => ({ settings: { ...state.settings, pieceSet } }));
  },
  setMoveNotation: (moveNotation) => {
    set((state) => ({ settings: { ...state.settings, moveNotation } }));
  },
  setColorScheme: (colorScheme) => {
    set((state) => ({ settings: { ...state.settings, colorScheme } }));
  },
  setEngineDepth: (engineDepth) => {
    set((state) => ({
      settings: { ...state.settings, engineDepth: clampDepth(engineDepth) },
    }));
  },
  setMultiPv: (multiPv) => {
    set((state) => ({
      settings: { ...state.settings, multiPv: clampLines(multiPv) },
    }));
  },
  setEngineThreads: (engineThreads) => {
    set((state) => ({
      settings: { ...state.settings, engineThreads: clampThreads(engineThreads) },
    }));
  },
  setEngineBuild: (engineBuild) => {
    set((state) => ({ settings: { ...state.settings, engineBuild } }));
  },
  setActivity: (activity) =>
    set((state) => ({
      activity,
      settings: { ...state.settings, sidebarCollapsed: false },
    })),
  toggleSidebar: () =>
    set((state) => ({
      settings: {
        ...state.settings,
        sidebarCollapsed: !state.settings.sidebarCollapsed,
      },
    })),
  setDatabaseSource: (databaseSource) => set({ databaseSource }),
  setExplorerFilters: (patch) =>
    set((state) => ({
      settings: {
        ...state.settings,
        explorerFilters: { ...state.settings.explorerFilters, ...patch },
      },
    })),
  importPgnText: (pgn, title) => {
    const imported = openablePgn(pgn);
    if (!imported) {
      set({ statusMessage: "Could not open that PGN." });
      return;
    }
    set((state) => ({
      statusMessage: null,
      training: false,
      trainingStart: null,
      threat: null,
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        title: title ?? imported.title,
        tree: imported.tree,
        path: imported.path,
        headers: imported.headers,
        dirty: true,
      })),
    }));
  },
  openListedGame: (args) => {
    const sans = args.moves?.trim() ? args.moves.trim().split(/\s+/).filter(Boolean) : [];
    const imported =
      sans.length > 0 ? importSans(sans, args.headers ?? {}) : importPgn(args.pgn ?? "");
    const headers = args.headers ? { ...imported.headers, ...args.headers } : imported.headers;
    set((state) => {
      const atFen = args.atFen ?? analysisFen(state);
      const content = {
        title: args.title,
        tree: imported.tree,
        path: mainlinePathForFen(imported.tree, atFen),
        headers,
        dirty: false,
      };
      const previewMode = state.settings.gamePreviewEnabled;
      if (previewMode) {
        const existing = state.boards.find((board) => board.preview);
        if (existing) {
          return {
            enginePreview: null,
            threat: null,
            setupMode: false,
            training: false,
            trainingStart: null,
            activeBoardId: existing.id,
            boards: state.boards.map((board) =>
              board.id === existing.id ? { ...board, ...content, preview: true } : board,
            ),
          };
        }
        const board: BoardSession = {
          ...emptyBoard(content.title),
          ...content,
          preview: true,
          dirty: false,
        };
        return {
          enginePreview: null,
          threat: null,
          setupMode: false,
          training: false,
          trainingStart: null,
          boards: [...state.boards, board],
          activeBoardId: board.id,
        };
      }
      const board: BoardSession = {
        ...emptyBoard(content.title),
        ...content,
        preview: false,
        dirty: false,
      };
      return {
        enginePreview: null,
        threat: null,
        setupMode: false,
        training: false,
        trainingStart: null,
        boards: [...state.boards, board],
        activeBoardId: board.id,
      };
    });
  },
  importPlayerGame: (game) => {
    const headers: GameHeaders = {
      Event: game.event ?? "?",
      White: game.whiteName,
      Black: game.blackName,
      Result:
        game.winner === "white"
          ? "1-0"
          : game.winner === "black"
            ? "0-1"
            : game.winner === "draw"
              ? "1/2-1/2"
              : "*",
    };
    if (game.whiteRating) {
      headers.WhiteElo = String(game.whiteRating);
    }
    if (game.blackRating) {
      headers.BlackElo = String(game.blackRating);
    }
    if (game.eco) {
      headers.ECO = game.eco;
    }
    if (game.opening) {
      headers.Opening = game.opening;
    }
    if (game.year) {
      headers.Date = `${game.year}.${game.month ? String(game.month).padStart(2, "0") : "??"}.??`;
    }
    get().openListedGame({
      title: `${game.whiteName} vs ${game.blackName}`,
      pgn: game.pgn,
      moves: game.moves,
      headers,
    });
  },
  exportActivePgn: () => {
    const board = get().active();
    return exportPgn(board.tree, board.headers);
  },
  pruneAfter: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        tree: deleteAfter(board.tree, board.path),
        dirty: true,
      })),
    }));
  },
  promoteVariation: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const next = promoteVariation(board.tree, board.path);
        return { ...board, tree: next.tree, path: next.path, dirty: true };
      }),
    }));
  },
  makeMainline: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const next = makeMainline(board.tree, board.path);
        return { ...board, tree: next.tree, path: next.path, dirty: true };
      }),
    }));
  },
  deleteVariation: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const next = deleteVariation(board.tree, board.path);
        return { ...board, tree: next.tree, path: next.path, dirty: true };
      }),
    }));
  },
  setMoveComment: (comment) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        tree: setNodeComment(board.tree, board.path, comment),
        dirty: true,
      })),
    }));
  },
  setMoveCommentBefore: (comment) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        if (board.path.length === 0) {
          return board;
        }
        return {
          ...board,
          tree: setNodeCommentBefore(board.tree, board.path, comment),
          dirty: true,
        };
      }),
    }));
  },
  insertNullMove: () => {
    if (get().setupMode || get().training) {
      return false;
    }
    const board = get().active();
    const previous = board.path;
    try {
      const nextFen = applyNullMoveFen(getFenAt(board.tree, board.path));
      const next = playMove(board.tree, board.path, {
        san: NULL_MOVE_SAN,
        uci: NULL_MOVE_UCI,
        fen: nextFen,
        from: "",
        to: "",
      });
      set((state) => ({
        threat: null,
        boards: withActive(state.boards, state.activeBoardId, (active) => ({
          ...active,
          tree: next.tree,
          path: next.path,
          dirty: true,
        })),
      }));
      soundForAdvance(previous);
      return true;
    } catch {
      set({ statusMessage: "Could not insert null move" });
      return false;
    }
  },
  clearBoardMarks: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        if (marksAreEmpty(getMarksAt(board.tree, board.path))) {
          return board;
        }
        return {
          ...board,
          tree: setNodeMarks(board.tree, board.path, undefined),
          dirty: true,
        };
      }),
    }));
  },
  toggleMoveNag: (nag, path) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const target = path ?? board.path;
        const node = getNodeAt(board.tree, target);
        if (!node) {
          return board;
        }
        return {
          ...board,
          path: target,
          tree: setNodeNags(board.tree, target, toggleNag(node.nags, nag)),
          dirty: true,
        };
      }),
    }));
  },
  clearMoveNags: (path) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const target = path ?? board.path;
        if (!getNodeAt(board.tree, target)) {
          return board;
        }
        return {
          ...board,
          path: target,
          tree: setNodeNags(board.tree, target, undefined),
          dirty: true,
        };
      }),
    }));
  },
  toggleBoardSquareMark: (square, color) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const current = getMarksAt(board.tree, board.path) ?? emptyMarks();
        return {
          ...board,
          tree: setNodeMarks(board.tree, board.path, toggleSquareMark(current, square, color)),
          dirty: true,
        };
      }),
    }));
  },
  toggleBoardArrowMark: (from, to, color) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const current = getMarksAt(board.tree, board.path) ?? emptyMarks();
        return {
          ...board,
          tree: setNodeMarks(board.tree, board.path, toggleArrowMark(current, from, to, color)),
          dirty: true,
        };
      }),
    }));
  },
  setHeaders: (headers) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        headers,
        title: titleFromHeaders(headers),
        dirty: true,
      })),
    }));
  },
  renameActive: (title) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        title,
        dirty: true,
      })),
    }));
  },
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
  setFilesQuery: (filesQuery) => set({ filesQuery }),
  createFileFolder: (name) => {
    const folder: FileFolder = {
      id: newId(),
      name: (name ?? "New folder").trim() || "New folder",
    };
    set((state) => {
      const files = { ...state.files, folders: [...state.files.folders, folder] };
      saveLocalFiles(files);
      return { files, activity: "files", settings: { ...state.settings, sidebarCollapsed: false } };
    });
  },
  importFileDatabase: (name, pgn, folderId = null, options) => {
    const database = libraryFromPgn(name.trim() || "Database", pgn, folderId);
    const focusFiles = options?.focusFiles !== false;
    set((state) => {
      const files = {
        ...state.files,
        databases: [...state.files.databases, database],
      };
      saveLocalFiles(files);
      return {
        files,
        activeFileDatabaseId: database.id,
        activeFileGameId: null,
        ...(focusFiles
          ? {
              activity: "files" as const,
              settings: { ...state.settings, sidebarCollapsed: false },
            }
          : {}),
        statusMessage:
          database.games.length === 0
            ? "No games found in that PGN"
            : `Imported ${database.games.length} game${database.games.length === 1 ? "" : "s"}`,
      };
    });
    const user = get().user;
    if (user) {
      void persistRemoteDatabase(database, user.id).then(({ remoteId, indexError }) => {
        if (indexError) {
          set({ statusMessage: "Games imported, but the position index could not be saved." });
        }
        if (!remoteId) {
          return;
        }
        set((state) => {
          const files = {
            ...state.files,
            databases: state.files.databases.map((item) =>
              item.id === database.id ? { ...item, remoteId } : item,
            ),
          };
          saveLocalFiles(files);
          return { files };
        });
      });
    }
  },
  showFileDatabase: (id) => set({ activeFileDatabaseId: id }),
  openPgnSource: (name, pgn) => {
    get().importFileDatabase(name, pgn, null, { focusFiles: false });
    get().importPgnText(pgn, name);
    if (get().statusMessage === "Could not open that PGN.") {
      return;
    }
    const database = get().files.databases.find((item) => item.id === get().activeFileDatabaseId);
    const count = database?.games.length ?? 0;
    if (count > 0) {
      set({ statusMessage: `Opened ${count} game${count === 1 ? "" : "s"}` });
    }
  },
  openFileGame: (game) => {
    const database = get().files.databases.find((item) =>
      item.games.some((entry) => entry.id === game.id),
    );
    const combined = database && database.games.length > 1;
    const pgn = combined ? database.games.map((entry) => entry.pgn).join("\n\n") : game.pgn;
    const imported = openListedFileGame(pgn, game.pgn);
    if (!imported) {
      set({ statusMessage: "Could not open that PGN." });
      return;
    }
    const path = imported.path;
    set((state) => ({
      statusMessage: null,
      training: false,
      trainingStart: null,
      threat: null,
      activeFileDatabaseId: database?.id ?? state.activeFileDatabaseId,
      activeFileGameId: game.id,
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        title: combined ? database.name : (game.title || imported.title),
        tree: imported.tree,
        path,
        headers: imported.headers,
        dirty: true,
      })),
    }));
  },
  deleteFileFolder: (id) => {
    set((state) => {
      const files = {
        folders: state.files.folders.filter((folder) => folder.id !== id),
        databases: state.files.databases.map((database) =>
          database.folderId === id ? { ...database, folderId: null } : database,
        ),
      };
      saveLocalFiles(files);
      return { files };
    });
  },
  deleteFileDatabase: (id) => {
    const target = get().files.databases.find((item) => item.id === id);
    dropFilesExplorerIndex(id);
    set((state) => {
      const files = {
        ...state.files,
        databases: state.files.databases.filter((item) => item.id !== id),
      };
      saveLocalFiles(files);
      const selectedId = fileDatabaseId(state.databaseSource);
      return {
        files,
        activeFileDatabaseId: state.activeFileDatabaseId === id ? null : state.activeFileDatabaseId,
        activeFileGameId: state.activeFileDatabaseId === id ? null : state.activeFileGameId,
        databaseSource: selectedId === id ? "masters" : state.databaseSource,
      };
    });
    if (target?.remoteId) {
      void deleteRemoteDatabase(target.remoteId);
    }
  },
  mergeRemoteFiles: (databases) => {
    set((state) => {
      const existing = new Set(
        state.files.databases.map((item) => item.remoteId).filter((id): id is string => Boolean(id)),
      );
      const extra = databases.filter((item) => item.remoteId && !existing.has(item.remoteId));
      if (extra.length === 0) {
        return {};
      }
      const files = {
        ...state.files,
        databases: [...state.files.databases, ...extra],
      };
      saveLocalFiles(files);
      return { files };
    });
  },
  togglePlayerBookmark: (player) => {
    const key = bookmarkKey(player);
    const exists = get().bookmarks.some((item) => bookmarkKey(item) === key);
    const bookmarks = exists
      ? removeBookmark(get().bookmarks, player)
      : upsertBookmark(get().bookmarks, player);
    saveLocalBookmarks(bookmarks);
    set({ bookmarks });
    const user = get().user;
    if (!user) {
      return;
    }
    if (exists) {
      void deleteRemoteBookmark(player, user.id);
      return;
    }
    const saved = bookmarks.find((item) => bookmarkKey(item) === key);
    if (saved) {
      void persistRemoteBookmark(saved, user.id);
    }
  },
  mergeRemoteBookmarks: (remote) => {
    set((state) => {
      const bookmarks = mergeBookmarks(state.bookmarks, remote);
      saveLocalBookmarks(bookmarks);
      return { bookmarks };
    });
  },
  hydrateRemoteBookmarks: async () => {
    const user = get().user;
    if (!user) {
      return;
    }
    const remote = await loadRemoteBookmarks(user.id);
    get().mergeRemoteBookmarks(remote);
  },
  setSetupMode: (setupMode) => set({ setupMode, enginePreview: null, threat: null }),
  applySetupFen: (fen) => {
    const trimmed = fen.trim();
    if (!isLegalSetupFen(trimmed)) {
      set({ statusMessage: "Invalid setup position" });
      return false;
    }
    const chess = new Chess(trimmed);
    const startFen = chess.fen();
    const isStart = startFen === START_FEN;
    set((state) => ({
      setupMode: false,
      threat: null,
      statusMessage: "Position applied",
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const headers = { ...board.headers };
        if (isStart) {
          delete headers.FEN;
          delete headers.SetUp;
        } else {
          headers.FEN = startFen;
          headers.SetUp = "1";
        }
        return {
          ...board,
          tree: createEmptyTree(startFen),
          path: [],
          headers,
          dirty: true,
        };
      }),
    }));
    return true;
  },
  openSharedPosition: (fen) => {
    const trimmed = fen.trim();
    if (!isLegalSetupFen(trimmed)) {
      return;
    }
    const startFen = new Chess(trimmed).fen();
    const isStart = startFen === START_FEN;
    set((state) => ({
      setupMode: false,
      enginePreview: null,
      threat: null,
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const headers = { ...board.headers };
        if (isStart) {
          delete headers.FEN;
          delete headers.SetUp;
        } else {
          headers.FEN = startFen;
          headers.SetUp = "1";
        }
        return {
          ...board,
          tree: createEmptyTree(startFen),
          path: [],
          headers,
          dirty: false,
        };
      }),
    }));
  },
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
    } satisfies SessionResetPayload;
    set(sessionReset);
  },
  hydrateLocalSettings: () => {
    set({ settings: loadLocalSettings() });
  },
  hydrateSettings: (partial) => {
    set((state) => ({
      settings: {
        ...state.settings,
        ...(partial.showCoordinates !== undefined
          ? { showCoordinates: partial.showCoordinates }
          : {}),
        ...(partial.showEvalBar !== undefined ? { showEvalBar: partial.showEvalBar } : {}),
        ...(partial.boardTheme !== undefined ? { boardTheme: partial.boardTheme } : {}),
        ...(partial.pieceSet !== undefined ? { pieceSet: partial.pieceSet } : {}),
        ...(partial.moveNotation !== undefined ? { moveNotation: partial.moveNotation } : {}),
        ...(partial.gamePreviewEnabled !== undefined
          ? { gamePreviewEnabled: partial.gamePreviewEnabled }
          : {}),
        ...(partial.engineDepth !== undefined ? { engineDepth: clampDepth(partial.engineDepth) } : {}),
        ...(partial.multiPv !== undefined ? { multiPv: clampLines(partial.multiPv) } : {}),
        ...(partial.engineThreads !== undefined
          ? { engineThreads: clampThreads(partial.engineThreads) }
          : {}),
      },
    }));
  },
  resetView: () => {
    bumpDockLayoutEpoch();
    clearStoredDockLayout();
    void persistDockLayout(null).catch(() => undefined);
    set((state) => ({ layoutNonce: state.layoutNonce + 1 }));
  },
  hydrateRemoteBoard: (board) => {
    set((state) => {
      const exists = state.boards.some((item) => item.remoteId === board.remoteId);
      if (exists) {
        return {
          boards: state.boards.map((item) =>
            item.remoteId === board.remoteId ? { ...board, dirty: false } : item,
          ),
        };
      }
      const isPlaceholder =
        state.boards.length === 1 &&
        state.boards[0].path.length === 0 &&
        state.boards[0].tree.children.length === 0 &&
        !state.boards[0].remoteId;
      if (isPlaceholder) {
        return { boards: [board], activeBoardId: board.id };
      }
      return { boards: [...state.boards, board] };
    });
  },
  markSaved: (id, remoteId) => {
    set((state) => ({
      boards: state.boards.map((board) =>
        board.id === id ? { ...board, remoteId, dirty: false } : board,
      ),
    }));
  },
}));

function soundForAdvance(previous: number[]): void {
  const state = useStudioStore.getState();
  if (shouldPlayMoveSound(state.settings.moveSound, previous, state.active().path)) {
    playMoveSound();
  }
}

const initial = useStudioStore.getState();
if (!initial.activeBoardId && initial.boards[0]) {
  useStudioStore.setState({ activeBoardId: initial.boards[0].id });
}

export function boardPreview(board: BoardSession): string {
  return recentSans(board.tree, board.path) || "starting position";
}

export async function persistBoard(board: BoardSession): Promise<string | null> {
  const supabase = createBrowserSupabase();
  const user = useStudioStore.getState().user;
  if (!supabase || !user) {
    return null;
  }
  if (board.remoteId) {
    const { error } = await supabase
      .from("boards")
      .update({
        title: board.title,
        pgn: exportPgn(board.tree, board.headers),
        current_node_path: board.path,
        orientation: board.orientation,
        updated_at: new Date().toISOString(),
      })
      .eq("id", board.remoteId);
    if (error) {
      throw error;
    }
    return board.remoteId;
  }
  const { data, error } = await supabase
    .from("boards")
    .insert({
      user_id: user.id,
      title: board.title,
      pgn: exportPgn(board.tree, board.headers),
      current_node_path: board.path,
      orientation: board.orientation,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return data.id;
}

export async function persistSettings(settings: StudioSettings): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
  const supabase = createBrowserSupabase();
  const user = useStudioStore.getState().user;
  if (!supabase || !user) {
    return;
  }
  const { error } = await supabase.from("user_settings").upsert({
    user_id: user.id,
    show_coordinates: settings.showCoordinates,
    piece_theme: settings.pieceSet,
    board_theme: settings.boardTheme,
    engine_depth: settings.engineDepth,
    multi_pv: settings.multiPv,
  });
  if (error) {
    throw error;
  }
}

export async function loadRemoteSettings(): Promise<Partial<StudioSettings> | null> {
  const supabase = createBrowserSupabase();
  const user = useStudioStore.getState().user;
  if (!supabase || !user) {
    return null;
  }
  const { data, error } = await supabase
    .from("user_settings")
    .select("show_coordinates, board_theme, piece_theme, engine_depth, multi_pv")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return {
    showCoordinates: data.show_coordinates,
    boardTheme: isBoardTheme(data.board_theme) ? data.board_theme : undefined,
    pieceSet: isPieceSet(data.piece_theme) ? data.piece_theme : undefined,
    engineDepth: data.engine_depth,
    multiPv: data.multi_pv,
  };
}

let syncedDockUserId: string | null = null;

export function forgetRemoteDockSync(): void {
  syncedDockUserId = null;
}

export async function persistDockLayout(
  snapshot: DockLayoutSnapshot | null,
  epoch = currentDockLayoutEpoch(),
): Promise<void> {
  if (epoch !== currentDockLayoutEpoch()) {
    return;
  }
  if (snapshot) {
    writeStoredDockLayout(snapshot);
  } else {
    clearStoredDockLayout();
  }
  if (epoch !== currentDockLayoutEpoch()) {
    return;
  }
  const supabase = createBrowserSupabase();
  const user = useStudioStore.getState().user;
  if (!supabase || !user) {
    return;
  }
  const { error } = await supabase.from("user_settings").upsert({
    user_id: user.id,
    layout: toJson(snapshot),
  });
  if (error) {
    throw error;
  }
}

export async function syncRemoteDockLayout(userId: string): Promise<void> {
  if (syncedDockUserId === userId) {
    return;
  }
  syncedDockUserId = userId;
  const epoch = currentDockLayoutEpoch();
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return;
  }
  const { data, error } = await supabase
    .from("user_settings")
    .select("layout")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || epoch !== currentDockLayoutEpoch()) {
    return;
  }
  const remote = sanitizeDockLayout(data?.layout ?? null);
  if (remote) {
    writeStoredDockLayout(remote);
    publishDockLayout(remote);
    return;
  }
  const local = readStoredDockLayout();
  if (local) {
    await persistDockLayout(local, epoch);
  }
}
