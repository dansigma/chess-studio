import type { StateCreator } from "zustand";
import { fenKey, mainlinePathForFen } from "@/src/chess/tree";
import { parsePgnCollection } from "@/src/chess/pgn-games";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
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
  canMoveFolder,
  deleteRemoteDatabase,
  deleteRemoteFolder,
  deleteRemoteGame,
  insertRemoteGame,
  updateRemoteGame,
  MAX_DATABASES,
  MAX_GAMES_PER_DATABASE,
  MAX_GAME_PGN_BYTES,
  getDescendantFolderIds,
  libraryFromPgn,
  loadLocalFiles,
  persistRemoteDatabase,
  persistRemoteDatabaseName,
  persistRemoteDatabaseFolder,
  persistRemoteFolder,
  saveLocalFiles,
  type FileDatabase,
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
  | "renameFileFolder"
  | "renameFileDatabase"
  | "moveFileFolder"
  | "moveFileDatabase"
  | "importFileDatabase"
  | "importParsedDatabase"
  | "addActiveGameToDatabase"
  | "replaceFileDatabaseGames"
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

type FilesSet = Parameters<StateCreator<StudioState, [], [], FilesSlice>>[0];
type FilesGet = Parameters<StateCreator<StudioState, [], [], FilesSlice>>[1];

const STORAGE_FULL_MESSAGE = "Saved in this session only: browser storage is full";

// Serialize writes per database, including edits made while its initial upload is running.
const remoteWrites = new Map<string, Promise<void>>();
const incompleteSyncs = new Map<string, FileDatabase["games"]>();

function queueRemoteWrite(set: FilesSet, get: FilesGet, id: string, write: () => Promise<void>) {
  const userId = get().user?.id;
  if (!userId) {
    return;
  }
  const next = (remoteWrites.get(id) ?? Promise.resolve())
    .then(async () => {
      if (get().user?.id === userId) {
        await write();
      }
    })
    .catch((error: unknown) => {
      set({ statusMessage: error instanceof Error ? error.message : String(error) });
    })
    .finally(() => {
      if (remoteWrites.get(id) === next) {
        remoteWrites.delete(id);
      }
    });
  remoteWrites.set(id, next);
}

function syncRemoteDatabase(
  set: FilesSet,
  get: FilesGet,
  database: FileDatabase,
  previousGames: FileDatabase["games"] = [],
) {
  const userId = get().user?.id;
  if (!userId) {
    return;
  }
  queueRemoteWrite(set, get, database.id, async () => {
    const current = get().files.databases.find((item) => item.id === database.id);
    if (!current) {
      return;
    }
    const remoteId = current.remoteId;
    if (!remoteId) {
      const result = await persistRemoteDatabase(database, userId);
      if (result.saveError || result.indexError) {
        set({ statusMessage: result.saveError ?? result.indexError });
      }
      if (!result.remoteId) {
        return;
      }
      if (!get().files.databases.some((item) => item.id === database.id)) {
        await deleteRemoteDatabase(result.remoteId);
        return;
      }
      set((state) => {
        const files = {
          ...state.files,
          databases: state.files.databases.map((item) =>
            item.id === database.id ? { ...item, remoteId: result.remoteId } : item,
          ),
        };
        saveLocalFiles(files);
        return { files };
      });
      return;
    }
    const synced = new Map(
      (incompleteSyncs.get(database.id) ?? previousGames).map((game) => [game.id, game]),
    );
    const desired = new Map(database.games.map((game) => [game.id, game]));
    const knownIds = [...synced.keys()];
    const reportFailure = (message: string) => {
      incompleteSyncs.set(database.id, [...synced.values()]);
      set({ statusMessage: message });
    };
    for (const [id, game] of synced) {
      if (!desired.has(id)) {
        const error = await deleteRemoteGame(remoteId, game, knownIds);
        if (error) {
          reportFailure(error);
          return;
        }
        synced.delete(id);
      }
    }
    for (const [id, game] of desired) {
      const previous = synced.get(id);
      if (previous?.pgn === game.pgn) {
        continue;
      }
      const error = previous
        ? await updateRemoteGame(remoteId, game, previous, knownIds)
        : await insertRemoteGame(remoteId, game);
      if (error) {
        reportFailure(error);
        return;
      }
      synced.set(id, game);
    }
    incompleteSyncs.delete(database.id);
  });
}

function syncDatabaseMetadata(
  set: FilesSet,
  get: FilesGet,
  id: string,
  write: (remoteId: string) => Promise<string | null>,
) {
  queueRemoteWrite(set, get, id, async () => {
    const remoteId = get().files.databases.find((item) => item.id === id)?.remoteId;
    if (remoteId) {
      const error = await write(remoteId);
      if (error) {
        set({ statusMessage: error });
      }
    }
  });
}

/** Shared tail of the import entries: local save, status message, remote save. */
function addImportedDatabase(
  set: FilesSet,
  get: FilesGet,
  database: FileDatabase,
): string {
  set((state) => {
    const files = {
      ...state.files,
      databases: [...state.files.databases, database],
    };
    const stored = saveLocalFiles(files);
    const imported =
      database.games.length === 0
        ? "No games found in that PGN"
        : `Imported ${database.games.length} game${database.games.length === 1 ? "" : "s"}`;
    return {
      files,
      activeFileDatabaseId: database.id,
      activeFileGameId: null,
      statusMessage: stored ? imported : `${imported} · ${STORAGE_FULL_MESSAGE}`,
    };
  });
  syncRemoteDatabase(set, get, database);
  return database.id;
}

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
  createFileFolder: (name, parentId = null) => {
    const folder: FileFolder = {
      id: newId(),
      name: (name ?? "New folder").trim() || "New folder",
      parentId: parentId ?? null,
    };
    set((state) => {
      const files = { ...state.files, folders: [...state.files.folders, folder] };
      saveLocalFiles(files);
      return { files };
    });
    const user = get().user;
    if (user) {
      void persistRemoteFolder(folder, user.id).then((saveError) => {
        if (saveError) {
          set({ statusMessage: saveError });
        }
      });
    }
  },
  renameFileFolder: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    let updatedFolder: FileFolder | null = null;
    set((state) => {
      const folders = state.files.folders.map((folder) => {
        if (folder.id === id) {
          updatedFolder = { ...folder, name: trimmed };
          return updatedFolder;
        }
        return folder;
      });
      const files = { ...state.files, folders };
      saveLocalFiles(files);
      return { files };
    });
    const user = get().user;
    if (user && updatedFolder) {
      void persistRemoteFolder(updatedFolder, user.id).then((saveError) => {
        if (saveError) {
          set({ statusMessage: saveError });
        }
      });
    }
  },
  renameFileDatabase: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    let found = false;
    set((state) => {
      const databases = state.files.databases.map((database) => {
        if (database.id === id) {
          found = true;
          return { ...database, name: trimmed };
        }
        return database;
      });
      if (!found) {
        return {};
      }
      const files = { ...state.files, databases };
      saveLocalFiles(files);
      return { files };
    });
    if (found) {
      syncDatabaseMetadata(set, get, id, (remoteId) => persistRemoteDatabaseName(remoteId, trimmed));
    }
  },
  moveFileFolder: (id, targetParentId) => {
    const folders = get().files.folders;
    if (!canMoveFolder(folders, id, targetParentId)) {
      return false;
    }
    let movedFolder: FileFolder | null = null;
    set((state) => {
      const folders = state.files.folders.map((folder) => {
        if (folder.id === id) {
          movedFolder = { ...folder, parentId: targetParentId };
          return movedFolder;
        }
        return folder;
      });
      const files = { ...state.files, folders };
      saveLocalFiles(files);
      return { files };
    });
    const user = get().user;
    if (user && movedFolder) {
      void persistRemoteFolder(movedFolder, user.id).then((saveError) => {
        if (saveError) {
          set({ statusMessage: saveError });
        }
      });
    }
    return true;
  },
  moveFileDatabase: (id, targetFolderId) => {
    let updatedDatabase: FileDatabase | null = null;
    set((state) => {
      const databases = state.files.databases.map((database) => {
        if (database.id === id) {
          updatedDatabase = { ...database, folderId: targetFolderId };
          return updatedDatabase;
        }
        return database;
      });
      const files = { ...state.files, databases };
      saveLocalFiles(files);
      return { files };
    });
    if (updatedDatabase) {
      syncDatabaseMetadata(set, get, id, (remoteId) => persistRemoteDatabaseFolder(remoteId, targetFolderId));
    }
  },
  importFileDatabase: (name, pgn, folderId = null) =>
    addImportedDatabase(set, get, libraryFromPgn(name.trim() || "Database", pgn, folderId)),
  importParsedDatabase: (name, games, folderId = null) =>
    addImportedDatabase(
      set,
      get,
      { id: crypto.randomUUID(), remoteId: null, name: name.trim() || "Database", folderId, games },
    ),
  addActiveGameToDatabase: (destination) => {
    const state = get();
    const locale = state.settings.locale;
    const target = "id" in destination
      ? state.files.databases.find((database) => database.id === destination.id)
      : undefined;
    const name = "name" in destination ? destination.name.trim() : target?.name;
    if (!name) {
      return false;
    }
    if (target ? target.games.length >= MAX_GAMES_PER_DATABASE : state.files.databases.length >= MAX_DATABASES) {
      set({
        statusMessage: tStudioChrome(locale, target ? "chrome.addToDatabase.gameLimit" : "chrome.addToDatabase.databaseLimit", {
          limit: String(target ? MAX_GAMES_PER_DATABASE : MAX_DATABASES),
        }),
      });
      return false;
    }
    const pgn = state.exportActivePgn();
    if (new TextEncoder().encode(pgn).length > MAX_GAME_PGN_BYTES) {
      set({ statusMessage: tStudioChrome(locale, "chrome.addToDatabase.tooLarge") });
      return false;
    }
    const game = parsePgnCollection(pgn, 1).games[0];
    if (!game) {
      return false;
    }
    // Keep the exact export, including whitespace within comments.
    game.pgn = pgn;
    const updated: FileDatabase = target
      ? { ...target, games: [...target.games, game] }
      : { id: newId(), remoteId: null, name, folderId: null, games: [game] };
    const files = {
      ...state.files,
      databases: target
        ? state.files.databases.map((database) => database.id === target.id ? updated : database)
        : [...state.files.databases, updated],
    };
    dropFilesExplorerIndex(updated.id);
    const stored = saveLocalFiles(files);
    const message = tStudioChrome(locale, "chrome.addToDatabase.added", { name });
    set({ files, statusMessage: stored ? message : `${message} · ${STORAGE_FULL_MESSAGE}` });
    syncRemoteDatabase(set, get, updated, target?.games);
    return true;
  },
  replaceFileDatabaseGames: (id, games) => {
    const target = get().files.databases.find((item) => item.id === id);
    if (!target) {
      return false;
    }
    const updated: FileDatabase = { ...target, games };
    dropFilesExplorerIndex(id);
    set((state) => {
      const files = {
        ...state.files,
        databases: state.files.databases.map((item) => (item.id === id ? updated : item)),
      };
      const stored = saveLocalFiles(files);
      const message = `${updated.name}: ${games.length} game${games.length === 1 ? "" : "s"}`;
      return {
        files,
        activeFileGameId:
          state.activeFileDatabaseId === id && !games.some((game) => game.id === state.activeFileGameId)
            ? null
            : state.activeFileGameId,
        statusMessage: stored ? message : `${message} · ${STORAGE_FULL_MESSAGE}`,
      };
    });
    syncRemoteDatabase(set, get, updated, target.games);
    return true;
  },
  showFileDatabase: (id) => set({ activeFileDatabaseId: id }),
  openPgnSource: (name, pgn) => {
    get().importFileDatabase(name, pgn);
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
        // SIG-968: a fresh game replaces the tree — no annotate undo carries over.
        reviewAnnotateUndo: undefined,
        dirty: true,
      };
      set((state) => ({
        statusMessage: null,
        training: false,
        trainingStart: null,
        trainingMiss: null,
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
      trainingMiss: null,
      threat: null,
      activeFileDatabaseId: database?.id ?? state.activeFileDatabaseId,
      activeFileGameId: game.id,
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        title: combined ? database.name : (game.title || imported.title),
        tree: imported.tree,
        path,
        headers: imported.headers,
        // SIG-968: a fresh game replaces the tree — drop any annotate undo.
        reviewAnnotateUndo: undefined,
        dirty: true,
      })),
    }));
  },
  deleteFileFolder: (id) => {
    const state = get();
    const descendantIds = getDescendantFolderIds(state.files.folders, id);
    const toDeleteIds = new Set([id, ...descendantIds]);
    set((state) => {
      const files = {
        folders: state.files.folders.filter((folder) => !toDeleteIds.has(folder.id)),
        databases: state.files.databases.map((database) =>
          database.folderId && toDeleteIds.has(database.folderId)
            ? { ...database, folderId: null }
            : database,
        ),
      };
      saveLocalFiles(files);
      return { files };
    });
    const user = get().user;
    if (user) {
      for (const folderId of toDeleteIds) {
        void deleteRemoteFolder(folderId);
      }
    }
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
    incompleteSyncs.delete(id);
    if (target?.remoteId) {
      const remoteId = target.remoteId;
      queueRemoteWrite(set, get, id, () => deleteRemoteDatabase(remoteId));
    }
  },
  mergeRemoteFiles: (payload) => {
    set((state) => {
      const remote = Array.isArray(payload) ? { folders: [], databases: payload } : payload;
      const existingDbRemoteIds = new Set(
        state.files.databases.map((item) => item.remoteId).filter((id): id is string => Boolean(id)),
      );
      const existingFolderIds = new Set(state.files.folders.map((item) => item.id));

      const extraDatabases = (remote.databases ?? []).filter(
        (item) => item.remoteId && !existingDbRemoteIds.has(item.remoteId),
      );
      const extraFolders = (remote.folders ?? []).filter(
        (item) => !existingFolderIds.has(item.id),
      );

      if (extraDatabases.length === 0 && extraFolders.length === 0) {
        return {};
      }
      const files = {
        folders: [...state.files.folders, ...extraFolders],
        databases: [...state.files.databases, ...extraDatabases],
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
