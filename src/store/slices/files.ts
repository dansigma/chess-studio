import type { StateCreator } from "zustand";
import { fenKey, mainlinePathForFen } from "@/src/chess/tree";
import { openListedFileGame } from "@/src/chess/pgn";
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
import { fileDatabaseId } from "@/src/lib/explorer-types";
import { dropFilesExplorerIndex } from "@/src/lib/files-explorer";
import {
  deleteRemoteDatabase,
  libraryFromPgn,
  loadLocalFiles,
  persistRemoteDatabase,
  saveLocalFiles,
  type FileFolder,
} from "@/src/lib/user-files";
import { emptyBoard, newId, withActive } from "./board-helpers";
import type { BoardSession, StudioState } from "./types";

// Files + player-bookmark library state. Bookmarks live here (not a third
// module) — same local+remote library character as the file databases.
export type FilesSlice = Pick<
  StudioState,
  | "files"
  | "filesQuery"
  | "activeFileDatabaseId"
  | "activeFileGameId"
  | "bookmarks"
  | "setFilesQuery"
  | "createFileFolder"
  | "importFileDatabase"
  | "showFileDatabase"
  | "openPgnSource"
  | "openFileGame"
  | "deleteFileFolder"
  | "deleteFileDatabase"
  | "mergeRemoteFiles"
  | "togglePlayerBookmark"
  | "mergeRemoteBookmarks"
  | "hydrateRemoteBookmarks"
>;

export const initialFilesState = {
  files: loadLocalFiles(),
  filesQuery: "",
  activeFileDatabaseId: null,
  activeFileGameId: null,
  bookmarks: loadLocalBookmarks(),
};

export const createFilesSlice: StateCreator<StudioState, [], [], FilesSlice> = (
  set,
  get,
) => ({
  ...initialFilesState,
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
  openFileGame: (game, options) => {
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
    // SIG-909: landing jump for the position-search panel. Walk the merged
    // tree's mainline for atFen; fall back to the imported path when the hit
    // game is not on that mainline so the board never blanks.
    let path = imported.path;
    if (options?.atFen) {
      const jump = mainlinePathForFen(imported.tree, options.atFen);
      if (jump.length > 0 || fenKey(imported.tree.startFen) === fenKey(options.atFen)) {
        path = jump;
      }
    }
    // SIG-910: side-by-side open. Instead of overwriting the active board,
    // append a new independent board (preview: false) and make it active.
    if (options?.openInNewBoard) {
      const board: BoardSession = {
        ...emptyBoard(combined ? database.name : (game.title || imported.title)),
        title: combined ? database.name : (game.title || imported.title),
        tree: imported.tree,
        path,
        headers: imported.headers,
        preview: false,
        dirty: true,
      };
      set((state) => ({
        statusMessage: null,
        training: false,
        trainingStart: null,
        threat: null,
        activeFileDatabaseId: database?.id ?? state.activeFileDatabaseId,
        activeFileGameId: game.id,
        boards: [...state.boards, board],
        activeBoardId: board.id,
      }));
      return;
    }
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
});
