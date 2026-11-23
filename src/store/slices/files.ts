import { tLibrary } from "@/src/i18n/library-strings";
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
  databaseSaveErrorMessage,
  EMPTY_FILES,
  FOLDER_CYCLE_MESSAGE,
  MAX_DATABASES,
  MAX_GAMES_PER_DATABASE,
  deleteRemoteDatabase,
  deleteRemoteFolder,
  deleteRemoteGame,
  insertRemoteGame,
  updateRemoteGame,
  MAX_GAME_PGN_BYTES,
  getDescendantFolderIds,
  libraryFromPgn,
  loadLocalFiles,
  localizedSaveError,
  persistRemoteDatabase,
  persistRemoteDatabaseName,
  persistRemoteDatabaseFolder,
  persistRemoteFolder,
  saveLocalFiles,
  type FileDatabase,
  type FileFolder,
  type FilesLibrary,
} from "@/src/lib/user-files";
import { emptyBoard, newId, withActive } from "./board-helpers";
import type { BoardSession, StudioState } from "./types";

// Files + player-bookmark library state. Bookmarks live here (not a third
// module) — same local+remote library character as the file databases.
export type FilesSlice = Pick<
  StudioState,
  | "files"
  | "filesHydrated"
  | "hydrateLocalFiles"
  | "uploadLocalDatabases"
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

function cacheFiles(set: FilesSet, get: FilesGet, files: FilesLibrary) {
  void saveLocalFiles(files).then((stored) => {
    if (!stored && get().files === files) {
      const status = get().statusMessage;
      set({ statusMessage: status ? `${status} · ${STORAGE_FULL_MESSAGE}` : STORAGE_FULL_MESSAGE });
    }
  });
}

type DatabaseSyncResult = { uploaded: boolean; error?: string; indexError?: string };
// Serialize writes per database, including edits made while its initial upload is running.
const remoteWrites = new Map<string, Promise<DatabaseSyncResult>>();
const databaseUploads = new Map<string, Promise<DatabaseSyncResult>>();
const incompleteSyncs = new Map<string, FileDatabase["games"]>();

function queueRemoteWrite(
  get: FilesGet,
  key: string,
  userId: string,
  write: () => Promise<DatabaseSyncResult>,
): Promise<DatabaseSyncResult> {
  const next = (remoteWrites.get(key) ?? Promise.resolve())
    .then(() => get().user?.id === userId ? write() : { uploaded: false })
    .catch((error: unknown) => ({
      uploaded: false,
      error: databaseSaveErrorMessage(error) ?? databaseSaveErrorMessage({}),
    }))
    .finally(() => {
      if (remoteWrites.get(key) === next) {
        remoteWrites.delete(key);
      }
    });
  remoteWrites.set(key, next);
  return next;
}

function syncRemoteDatabase(
  set: FilesSet,
  get: FilesGet,
  database: FileDatabase,
  previousGames?: FileDatabase["games"],
): Promise<DatabaseSyncResult> {
  const userId = get().user?.id;
  if (!userId) {
    return Promise.resolve({ uploaded: false });
  }
  const key = `${userId}:${database.id}`;
  const pending = databaseUploads.get(key);
  // Sign-in can join an upload already in flight. Edits still queue their delta.
  if (!database.remoteId && !previousGames && pending) {
    return pending;
  }
  const sync = queueRemoteWrite(get, key, userId, async () => {
    const current = get().files.databases.find((item) => item.id === database.id);
    if (!current) {
      return { uploaded: false };
    }
    const remoteId = current.remoteId;
    if (!remoteId) {
      const result = await persistRemoteDatabase({ ...current, games: database.games }, userId);
      if (get().user?.id !== userId) {
        return { uploaded: false };
      }
      const uploadedId = result.remoteId;
      if (!uploadedId) {
        return {
          uploaded: false,
          error: result.saveError ?? (result.indexError ? undefined : databaseSaveErrorMessage({})),
          indexError: result.indexError ?? undefined,
        };
      }
      if (!get().files.databases.some((item) => item.id === database.id)) {
        await deleteRemoteDatabase(uploadedId);
        return { uploaded: false };
      }
      set((state) => {
        const files = {
          ...state.files,
          databases: state.files.databases.map((item) =>
            item.id === database.id ? { ...item, remoteId: uploadedId } : item,
          ),
        };
        cacheFiles(set, get, files);
        return { files };
      });
      return { uploaded: true, indexError: result.indexError ?? undefined };
    }
    if (!previousGames) {
      return { uploaded: false };
    }
    const synced = new Map(
      (incompleteSyncs.get(key) ?? previousGames).map((game) => [game.id, game]),
    );
    const desired = new Map(database.games.map((game) => [game.id, game]));
    const knownIds = [...synced.keys()];
    const reportFailure = (error: string) => {
      incompleteSyncs.set(key, [...synced.values()]);
      return { uploaded: false, error };
    };
    for (const [id, game] of synced) {
      if (!desired.has(id)) {
        const error = await deleteRemoteGame(remoteId, game, knownIds);
        if (error) {
          return reportFailure(error);
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
        return reportFailure(error);
      }
      synced.set(id, game);
    }
    incompleteSyncs.delete(key);
    return { uploaded: false };
  });
  if (!database.remoteId && !pending) {
    databaseUploads.set(key, sync);
    void sync.then(() => databaseUploads.delete(key));
  }
  return sync;
}

function syncDatabaseMetadata(
  set: FilesSet,
  get: FilesGet,
  id: string,
  write: (remoteId: string) => Promise<string | null | void>,
) {
  const userId = get().user?.id;
  if (!userId) {
    return;
  }
  void queueRemoteWrite(get, `${userId}:${id}`, userId, async () => {
    const remoteId = get().files.databases.find((item) => item.id === id)?.remoteId;
    const error = remoteId ? await write(remoteId) : undefined;
    return { uploaded: false, error: error ?? undefined };
  }).then(({ error }) => {
    if (error && get().user?.id === userId) {
      set({ statusMessage: localizedSaveError(error, get().settings.locale) });
    }
  });
}

function syncAndReport(
  set: FilesSet,
  get: FilesGet,
  database: FileDatabase,
  indexMessage: string,
  previousGames?: FileDatabase["games"],
) {
  const userId = get().user?.id;
  void syncRemoteDatabase(set, get, database, previousGames).then(({ error, indexError }) => {
    if (get().user?.id === userId && (error || indexError)) {
      set({ statusMessage: error ? localizedSaveError(error, get().settings.locale) : indexMessage });
    }
  });
}

/** Shared tail of the import entries: local save, status message, remote save. */
function addImportedDatabase(
  set: FilesSet,
  get: FilesGet,
  database: FileDatabase,
): string {
  if (get().files.databases.length >= MAX_DATABASES) {
    set({ statusMessage: tLibrary(get().settings.locale, "library.quota.databases") });
    return "";
  }
  if (database.games.length > MAX_GAMES_PER_DATABASE) {
    set({ statusMessage: tLibrary(get().settings.locale, "library.quota.games") });
    return "";
  }
  set((state) => {
    const files = {
      ...state.files,
      databases: [...state.files.databases, database],
    };
    cacheFiles(set, get, files);
    const imported =
      database.games.length === 0
        ? "No games found in that PGN"
        : `Imported ${database.games.length} game${database.games.length === 1 ? "" : "s"}`;
    return {
      files,
      activeFileDatabaseId: database.id,
      activeFileGameId: null,
      statusMessage: imported,
    };
  });
  syncAndReport(set, get, database, "Games imported, but the position index could not be saved.");
  return database.id;
}

export const initialFilesState = {
  files: EMPTY_FILES,
  filesHydrated: false,
  filesQuery: "",
  activeFileDatabaseId: null,
  activeFileGameId: null,
  bookmarks: loadLocalBookmarks(),
};

function createFilesHydration(set: FilesSet, get: FilesGet): Pick<
  FilesSlice, "hydrateLocalFiles" | "uploadLocalDatabases"
> {
  let localHydration: Promise<void> | undefined;
  const uploadingUsers = new Set<string>();
  return {
    hydrateLocalFiles: () => {
      if (get().filesHydrated) {
        return Promise.resolve();
      }
      localHydration ??= loadLocalFiles().then((files) => {
        if (!get().filesHydrated) {
          set({ files, filesHydrated: true });
        }
      });
      return localHydration;
    },
    uploadLocalDatabases: async (remote) => {
      const user = get().user;
      if (!user || uploadingUsers.has(user.id)) {
        return;
      }
      uploadingUsers.add(user.id);
      const currentUser = () => get().user?.id === user.id;
      try {
        await get().hydrateLocalFiles();
        if (!currentUser()) {
          return;
        }
        get().mergeRemoteFiles(remote);
        const uploadedDatabases = [...remote.databases];
        const folderIds = new Set(remote.folders.map((folder) => folder.id));
        const savedFolders = new Map<string, Promise<string | null>>();
        const ensureFolder = (id: string | null, ancestors: string[] = []): Promise<string | null> => {
          if (!id || folderIds.has(id)) {
            return Promise.resolve(null);
          }
          if (ancestors.includes(id)) {
            return Promise.resolve(FOLDER_CYCLE_MESSAGE);
          }
          const pending = savedFolders.get(id);
          if (pending) {
            return pending;
          }
          const folder = get().files.folders.find((item) => item.id === id);
          if (!folder) {
            return Promise.resolve(null);
          }
          const save = Promise.resolve().then(async () => {
            const parentError = await ensureFolder(folder.parentId, [...ancestors, id]);
            if (!currentUser() || parentError) {
              return parentError;
            }
            return persistRemoteFolder(folder, user.id);
          });
          savedFolders.set(id, save);
          return save;
        };

        let count = 0;
        let indexFailed = false;
        const failures: string[] = [];
        for (const { id } of get().files.databases.filter((item) => !item.remoteId)) {
          if (!currentUser()) {
            return;
          }
          const database = get().files.databases.find((item) => item.id === id && !item.remoteId);
          if (!database) {
            continue;
          }
          const gameIds = new Set(database.games.map(({ id }) => id));
          if (uploadedDatabases.some((item) => {
            if (item.name !== database.name) {
              return false;
            }
            const uploadedIds = new Set(item.games.map(({ id }) => id));
            return uploadedIds.size === gameIds.size && [...gameIds].every((id) => uploadedIds.has(id));
          })) {
            continue;
          }
          let result: DatabaseSyncResult;
          try {
            const folderError = await ensureFolder(database.folderId);
            result = folderError
              ? { uploaded: false, error: databaseSaveErrorMessage({ message: folderError }) }
              : currentUser() ? await syncRemoteDatabase(set, get, database) : { uploaded: false };
          } catch (error) {
            result = { uploaded: false, error: databaseSaveErrorMessage(error) ?? databaseSaveErrorMessage({}) };
          }
          if (result.uploaded) {
            count++;
            uploadedDatabases.push(database);
          }
          indexFailed ||= Boolean(result.indexError);
          const failure = result.error ?? (result.uploaded ? undefined : result.indexError);
          if (failure) {
            failures.push(`${database.name} (${localizedSaveError(failure, get().settings.locale)})`);
          }
        }
        if (currentUser() && (count || indexFailed || failures.length)) {
          const locale = get().settings.locale;
          set({ statusMessage: [
            count && tLibrary(locale, "library.sync.uploaded", { count }),
            indexFailed && tLibrary(locale, "library.sync.indexFailed"),
            failures.length && tLibrary(locale, "library.sync.failed", { databases: failures.join(", ") }),
            get().statusMessage?.includes(STORAGE_FULL_MESSAGE) && STORAGE_FULL_MESSAGE,
          ].filter(Boolean).join(" · ") });
        }
      } finally {
        uploadingUsers.delete(user.id);
      }
    },
  };
}

export const createFilesSlice: StateCreator<StudioState, [], [], FilesSlice> = (
  set,
  get,
) => ({
  ...initialFilesState,
  ...createFilesHydration(set, get),
  setFilesQuery: (filesQuery) => set({ filesQuery }),
  createFileFolder: (name, parentId = null) => {
    const folder: FileFolder = {
      id: newId(),
      name: (name ?? "New folder").trim() || "New folder",
      parentId: parentId ?? null,
    };
    set((state) => {
      const files = { ...state.files, folders: [...state.files.folders, folder] };
      cacheFiles(set, get, files);
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
      cacheFiles(set, get, files);
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
      cacheFiles(set, get, files);
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
      cacheFiles(set, get, files);
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
      cacheFiles(set, get, files);
      return { files };
    });
    if (updatedDatabase) {
      syncDatabaseMetadata(set, get, id, (remoteId) => persistRemoteDatabaseFolder(remoteId, targetFolderId));
    }
  },
  importFileDatabase: (name, pgn, folderId = null) => {
    if (get().files.databases.length >= MAX_DATABASES) {
      set({ statusMessage: tLibrary(get().settings.locale, "library.quota.databases") });
      return "";
    }
    return addImportedDatabase(set, get, libraryFromPgn(name.trim() || "Database", pgn, folderId));
  },
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
    set({ files, statusMessage: tStudioChrome(locale, "chrome.addToDatabase.added", { name }) });
    cacheFiles(set, get, files);
    syncAndReport(set, get, updated, "Game saved locally, but the position index could not be saved.", target?.games);
    return true;
  },
  replaceFileDatabaseGames: (id, games) => {
    const target = get().files.databases.find((item) => item.id === id);
    if (!target) {
      return false;
    }
    if (games.length > MAX_GAMES_PER_DATABASE) {
      set({ statusMessage: tLibrary(get().settings.locale, "library.quota.games") });
      return false;
    }
    const updated: FileDatabase = { ...target, games };
    dropFilesExplorerIndex(id);
    set((state) => {
      const files = {
        ...state.files,
        databases: state.files.databases.map((item) => (item.id === id ? updated : item)),
      };
      cacheFiles(set, get, files);
      const message = `${updated.name}: ${games.length} game${games.length === 1 ? "" : "s"}`;
      return {
        files,
        activeFileGameId:
          state.activeFileDatabaseId === id && !games.some((game) => game.id === state.activeFileGameId)
            ? null
            : state.activeFileGameId,
        statusMessage: message,
      };
    });
    syncAndReport(set, get, updated, "Games saved, but the position index could not be saved.", target.games);
    return true;
  },
  showFileDatabase: (id) => set({ activeFileDatabaseId: id }),
  openPgnSource: (name, pgn) => {
    const id = get().importFileDatabase(name, pgn);
    get().importPgnText(pgn, name);
    if (get().statusMessage === "Could not open that PGN.") {
      return;
    }
    if (!id) {
      set({ statusMessage: tLibrary(get().settings.locale, "library.quota.databases") });
      return;
    }
    const database = get().files.databases.find((item) => item.id === id);
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
        dueDrill: null,
        drillDueOnly: false,
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
      dueDrill: null,
      drillDueOnly: false,
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
      cacheFiles(set, get, files);
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
      cacheFiles(set, get, files);
      const selectedId = fileDatabaseId(state.databaseSource);
      return {
        files,
        activeFileDatabaseId: state.activeFileDatabaseId === id ? null : state.activeFileDatabaseId,
        activeFileGameId: state.activeFileDatabaseId === id ? null : state.activeFileGameId,
        databaseSource: selectedId === id ? "masters" : state.databaseSource,
      };
    });
    const userId = get().user?.id;
    if (userId && target?.remoteId) {
      const remoteId = target.remoteId;
      const key = `${userId}:${id}`;
      void queueRemoteWrite(get, key, userId, async () => {
        incompleteSyncs.delete(key);
        await deleteRemoteDatabase(remoteId);
        return { uploaded: false };
      }).then(({ error }) => {
        if (error && get().user?.id === userId) {
          set({ statusMessage: localizedSaveError(error, get().settings.locale) });
        }
      });
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

      const remoteById = new Map(remote.databases.map((item) => [item.remoteId, item]));
      const databases = state.files.databases.map((item) => {
        // Older clients only fetched the first 1,000 games from the account.
        const complete = item.remoteId ? remoteById.get(item.remoteId) : undefined;
        if (item.games.length === 1000 && complete && complete.games.length > item.games.length) {
          const remoteGameIds = new Set(complete.games.map((game) => game.id));
          if (item.games.every((game) => remoteGameIds.has(game.id))) {
            dropFilesExplorerIndex(item.id);
            return { ...item, games: complete.games };
          }
        }
        return item;
      });
      if (!extraDatabases.length && !extraFolders.length &&
          databases.every((item, index) => item === state.files.databases[index])) {
        return {};
      }
      const files = {
        folders: [...state.files.folders, ...extraFolders],
        databases: [...databases, ...extraDatabases],
      };
      cacheFiles(set, get, files);
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
