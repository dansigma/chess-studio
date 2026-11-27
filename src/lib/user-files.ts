import { createBrowserSupabase } from "@/src/lib/supabase/client";
import type { SiteLocale } from "@/src/i18n/locale";
import { tLibrary } from "@/src/i18n/library-strings";
import { importPgn } from "@/src/chess/pgn";
import type { GameTree } from "@/src/chess/tree";
import { parsePgnCollection, type ParsedFileGame } from "@/src/chess/pgn-games";
import { mergeStatRows, resultBucket, rowsForTree, type PositionRow, type StatRow } from "@/src/lib/position-index";
import type { Database } from "@/src/lib/supabase/database.types";

const FILES_KEY = "studio-clone-files";

export type FileFolder = {
  id: string;
  name: string;
  parentId: string | null;
};

export type FileGame = ParsedFileGame;

export type FileDatabase = {
  id: string;
  remoteId: string | null;
  name: string;
  folderId: string | null;
  games: FileGame[];
};

export type FilesLibrary = {
  folders: FileFolder[];
  databases: FileDatabase[];
};

export const EMPTY_FILES: FilesLibrary = { folders: [], databases: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readGame(value: unknown): FileGame | null {
  if (!isRecord(value) || typeof value.pgn !== "string") {
    return null;
  }
  return {
    id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
    white: typeof value.white === "string" ? value.white : "White",
    black: typeof value.black === "string" ? value.black : "Black",
    result: typeof value.result === "string" ? value.result : "*",
    event: typeof value.event === "string" ? value.event : "",
    date: typeof value.date === "string" ? value.date : "",
    pgn: value.pgn,
    title: typeof value.title === "string" ? value.title : `${value.white ?? "White"} vs ${value.black ?? "Black"}`,
  };
}

function decodeLocalFiles(raw: string): FilesLibrary {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.folders) || !Array.isArray(parsed.databases)) {
      return EMPTY_FILES;
    }
    return {
      folders: parsed.folders.flatMap((item) => {
        if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") {
          return [];
        }
        return [
          {
            id: item.id,
            name: item.name,
            parentId: typeof item.parentId === "string" ? item.parentId : null,
          },
        ];
      }),
      databases: parsed.databases.flatMap((item) => {
        if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") {
          return [];
        }
        return [
          {
            id: item.id,
            remoteId: typeof item.remoteId === "string" ? item.remoteId : null,
            name: item.name,
            folderId: typeof item.folderId === "string" ? item.folderId : null,
            games: Array.isArray(item.games)
              ? item.games.flatMap((game) => {
                  const parsedGame = readGame(game);
                  return parsedGame ? [parsedGame] : [];
                })
              : [],
          },
        ];
      }),
    };
  } catch {
    return EMPTY_FILES;
  }
}

type FilesCache = {
  read: () => Promise<FilesLibrary | undefined>;
  write: (library: FilesLibrary, isCurrent: () => boolean) => Promise<void>;
};

async function withFilesCache<T>(
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = window.indexedDB.open("studio-library", 1);
    let blocked = false;
    open.onupgradeneeded = () => open.result.createObjectStore("files");
    open.onblocked = () => {
      blocked = true;
      reject(new Error("Library storage is blocked"));
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      if (blocked) {
        open.result.close();
      } else {
        resolve(open.result);
      }
    };
  });
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction("files", mode);
      const result = request(transaction.objectStore("files"));
      transaction.oncomplete = () => resolve(result?.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

const indexedFilesCache: FilesCache = {
  read: () => withFilesCache("readonly", (store) => store.get(FILES_KEY)),
  write: (library, isCurrent) =>
    withFilesCache("readwrite", (store) => {
      if (isCurrent()) return store.put(library, FILES_KEY);
    }).then(() => undefined),
};

// Serialize hydration, migration, and saves within a session.
let cacheGeneration = 0;
let pendingCacheOperation: Promise<unknown> = Promise.resolve();
let pendingCacheClear: Promise<boolean> = Promise.resolve(true);
function queueCacheOperation<T>(operation: (isCurrent: () => boolean) => Promise<T>): Promise<T> {
  const generation = cacheGeneration;
  const run = () => operation(() => generation === cacheGeneration);
  const next = pendingCacheOperation.then(run, run);
  pendingCacheOperation = next;
  return next;
}

function removeLegacyFiles() {
  try {
    window.localStorage.removeItem(FILES_KEY);
  } catch {
    // Legacy storage may be disabled.
  }
}

export function clearLocalFiles(): Promise<boolean> {
  // Skip queued writes and invalidate writes still opening IndexedDB. Any put
  // already issued has a readwrite transaction that IndexedDB orders before
  // the delete. New operations wait for the delete to commit.
  cacheGeneration++;
  if (typeof window !== "undefined") removeLegacyFiles();
  pendingCacheClear = pendingCacheClear.then(async () => {
    try {
      if (typeof window !== "undefined" && window.indexedDB) {
        await withFilesCache("readwrite", (store) => store.delete(FILES_KEY));
      }
      return true;
    } catch {
      return false;
    }
  });
  pendingCacheOperation = pendingCacheClear;
  return pendingCacheClear;
}

export function loadLocalFiles(cache: FilesCache = indexedFilesCache): Promise<FilesLibrary> {
  return queueCacheOperation(async (isCurrent) => {
    if (typeof window === "undefined" || !isCurrent()) {
      return EMPTY_FILES;
    }
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(FILES_KEY);
    } catch {
      // IndexedDB may still be available.
    }
    const legacy = raw ? decodeLocalFiles(raw) : EMPTY_FILES;
    try {
      if (cache === indexedFilesCache && !window.indexedDB) {
        return legacy;
      }
      const snapshot = await cache.read();
      if (!isCurrent()) return EMPTY_FILES;
      if (raw) {
        if (snapshot === undefined) await cache.write(legacy, isCurrent);
        if (isCurrent()) removeLegacyFiles();
      }
      return isCurrent() ? snapshot ?? legacy : EMPTY_FILES;
    } catch {
      // Retain the legacy snapshot if the migration could not commit.
    }
    return isCurrent() ? legacy : EMPTY_FILES;
  });
}

/** Returns false when the browser refused the write; never throws. */
export function saveLocalFiles(library: FilesLibrary): Promise<boolean> {
  return queueCacheOperation(async (isCurrent) => {
    if (typeof window === "undefined" || !isCurrent()) {
      return true;
    }
    try {
      if (window.indexedDB) {
        await indexedFilesCache.write(library, isCurrent);
        if (isCurrent()) removeLegacyFiles();
        return true;
      }
    } catch (error) {
      if (!(error instanceof DOMException) || !["SecurityError", "InvalidStateError"].includes(error.name)) {
        return false;
      }
    }
    if (!isCurrent()) return true;
    try {
      window.localStorage.setItem(FILES_KEY, JSON.stringify(library));
      return true;
    } catch {
      return false;
    }
  });
}

export function libraryFromPgn(name: string, pgn: string, folderId: string | null): FileDatabase {
  // Same per-database cap as the Library import (SIG-1323), not parsePgnCollection's 500 default.
  const parsed = parsePgnCollection(pgn, MAX_GAMES_PER_DATABASE);
  return {
    id: crypto.randomUUID(),
    remoteId: null,
    name,
    folderId,
    games: parsed.games,
  };
}

export const MAX_GAME_PGN_BYTES = 1_000_000;
/** Account limits, enforced by the server when signed in and by the client always. */
export const MAX_GAMES_PER_DATABASE = 25_000;
export const MAX_DATABASES = 10;

export type SaveErrorCode =
  | "pgn_too_large"
  | "board_too_large"
  | "layout_too_large"
  | "too_many_games"
  | "too_many_databases"
  | "save_failed";

export const GAME_PGN_TOO_LARGE_MESSAGE = "One game is larger than 1 MB and was not saved.";
export const BOARD_PGN_TOO_LARGE_MESSAGE = "One board is larger than 2 MB and was not saved.";
export const LAYOUT_TOO_LARGE_MESSAGE = "The layout is larger than 256 KB and was not saved.";
export const TOO_MANY_GAMES_MESSAGE = tLibrary("en", "library.quota.games");
export const TOO_MANY_DATABASES_MESSAGE = tLibrary("en", "library.quota.databases");

export function localizedSaveError(message: string, locale: SiteLocale): string {
  if (message === TOO_MANY_GAMES_MESSAGE) {
    return tLibrary(locale, "library.quota.games");
  }
  if (message === TOO_MANY_DATABASES_MESSAGE) {
    return tLibrary(locale, "library.quota.databases");
  }
  return message;
}

type DatabaseSaveError = { message?: string; code?: string };
export function databaseSaveErrorMessage(error: DatabaseSaveError): string;
export function databaseSaveErrorMessage(error: unknown): string | null;
export function databaseSaveErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }
  const message = isRecord(error) && typeof error.message === "string" ? error.message : "";
  if (message.includes("quota_games")) {
    return TOO_MANY_GAMES_MESSAGE;
  }
  if (message.includes("quota_databases")) {
    return TOO_MANY_DATABASES_MESSAGE;
  }
  if (isRecord(error) && error.code === "23514") {
    if (message.includes("games_pgn_size")) {
      return GAME_PGN_TOO_LARGE_MESSAGE;
    }
    if (message.includes("boards_pgn_size")) {
      return BOARD_PGN_TOO_LARGE_MESSAGE;
    }
    if (message.includes("user_settings_layout_size")) {
      return LAYOUT_TOO_LARGE_MESSAGE;
    }
    return "Some content exceeds the size limit and was not saved.";
  }
  return message || "Could not save the remote database.";
}

export async function persistRemoteDatabase(
  database: FileDatabase,
  userId: string,
): Promise<{ remoteId: string | null; indexError: string | null; saveError: string | null }> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return { remoteId: null, indexError: null, saveError: null };
  }
  if (database.remoteId) {
    throw new Error("Initial upload requires a local database");
  }
  if (database.games.some((game) => new TextEncoder().encode(game.pgn).length > MAX_GAME_PGN_BYTES)) {
    return { remoteId: null, indexError: null, saveError: GAME_PGN_TOO_LARGE_MESSAGE };
  }
  const { data, error } = await supabase
    .from("game_databases")
    .insert({
      user_id: userId,
      name: database.name,
      kind: "personal",
      game_count: 0,
      folder_id: database.folderId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { remoteId: null, indexError: null, saveError: databaseSaveErrorMessage(error) };
  }
  const remoteId = data.id;
  if (database.games.length > 0) {
    const prepared = database.games.map((game) => {
      const { tree, row } = prepareRemoteGame(game);
      return { tree, row: { ...row, id: game.id, database_id: remoteId, pending: true } };
    });
    const insertError = await insertChunks(
      prepared.map((item) => item.row),
      (chunk) => supabase.from("games").insert(chunk),
      200,
    );
    if (insertError) {
      await supabase.from("games").delete().eq("database_id", remoteId).eq("pending", true);
      await supabase.from("game_databases").delete().eq("id", remoteId);
      return { remoteId: null, indexError: null, saveError: databaseSaveErrorMessage(insertError) };
    }
    const { data: promoted, error: swapError } = await supabase.rpc("swap_database_games", {
      p_database_id: remoteId,
    });
    if (swapError) {
      await supabase.from("games").delete().eq("database_id", remoteId).eq("pending", true);
      await supabase.from("game_databases").delete().eq("id", remoteId);
      return { remoteId: null, indexError: null, saveError: databaseSaveErrorMessage(swapError) };
    }
    const { error: countError } = await supabase
      .from("game_databases")
      .update({ game_count: promoted ?? prepared.length })
      .eq("id", remoteId);
    if (countError) {
      await deleteRemoteDatabase(remoteId);
      return { remoteId: null, indexError: null, saveError: databaseSaveErrorMessage(countError) };
    }
    const indexError = await writePositionIndex(
      supabase,
      remoteId,
      prepared.map(({ row, tree }) => ({ id: row.id, tree, result: row.result })),
    );
    if (indexError) {
      await supabase.from("game_databases").delete().eq("id", remoteId);
      return { remoteId: null, indexError, saveError: null };
    }
  }
  return { remoteId, indexError: null, saveError: null };
}

function prepareRemoteGame(game: FileGame) {
  const { tree, headers } = importPgn(game.pgn);
  return {
    tree,
    row: {
      white: headers.White ?? game.white,
      black: headers.Black ?? game.black,
      white_elo: headerNumber(headers.WhiteElo),
      black_elo: headerNumber(headers.BlackElo),
      event: headers.Event ?? game.event,
      date: sqlDate(headers.Date ?? game.date),
      eco: headers.ECO ?? null,
      opening: headers.Opening ?? null,
      result: headers.Result ?? game.result,
      ply_count: countMoves(tree),
      pgn: game.pgn,
    },
  };
}

async function writeRemoteGame(
  remoteId: string,
  operation: "insert" | "update" | "delete",
  game: FileGame,
  previousPgn: string | null = null,
  knownIds: string[] = [],
): Promise<string | null> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return null;
  }
  if (operation !== "delete" && new TextEncoder().encode(game.pgn).length > MAX_GAME_PGN_BYTES) {
    return GAME_PGN_TOO_LARGE_MESSAGE;
  }
  const prepared = operation === "delete" ? null : prepareRemoteGame(game);
  const positions = prepared
    ? rowsForTree(prepared.tree, game.id, resultBucket(prepared.row.result)).positions
    : [];
  const { error } = await supabase.rpc("write_database_game", {
    p_database_id: remoteId,
    p_game_id: game.id,
    p_operation: operation,
    p_game: prepared?.row ?? null,
    p_positions: positions,
    p_previous_pgn: previousPgn,
    p_known_ids: knownIds,
  });
  return databaseSaveErrorMessage(error);
}

export function insertRemoteGame(remoteId: string, game: FileGame) {
  return writeRemoteGame(remoteId, "insert", game);
}

export function updateRemoteGame(remoteId: string, game: FileGame, previous: FileGame, knownIds: string[]) {
  return writeRemoteGame(remoteId, "update", game, previous.pgn, knownIds);
}

export function deleteRemoteGame(remoteId: string, game: FileGame, knownIds: string[]) {
  return writeRemoteGame(remoteId, "delete", game, game.pgn, knownIds);
}

function headerNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const rating = Number(value);
  return Number.isFinite(rating) ? Math.round(rating) : null;
}

function sqlDate(value: string | undefined): string | null {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(value ?? "");
  if (!match) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function dateFromPgn(pgn: string): string {
  // Read the tag directly: reloading must not replay every game's moves.
  // Only the header block at the top counts, never a "[Date ...]" in a comment.
  const headerBlock = /^(?:\s*\[[A-Za-z0-9_]+\s+"[^"]*"\])*/.exec(pgn)?.[0] ?? "";
  return /\[Date\s+"([^"]*)"\]/.exec(headerBlock)?.[1] ?? "";
}

function countMoves(tree: GameTree): number {
  let count = 0;
  const walk = (nodes: GameTree["children"]) => {
    for (const node of nodes) {
      count += 1;
      walk(node.children);
    }
  };
  walk(tree.children);
  return count;
}

async function writePositionIndex(
  supabase: NonNullable<ReturnType<typeof createBrowserSupabase>>,
  databaseId: string,
  games: Array<{ id: string; tree: ReturnType<typeof importPgn>["tree"]; result: string | null }>,
): Promise<string | null> {
  const { error: clearError } = await supabase.from("position_stats").delete().eq("database_id", databaseId);
  if (clearError) {
    return clearError.message;
  }
  const positions: PositionRow[] = [];
  const contributions: Array<{ zkey: string; nextUci: string; bucket: ReturnType<typeof resultBucket> }> = [];
  for (const game of games) {
    const indexed = rowsForTree(game.tree, game.id, resultBucket(game.result));
    positions.push(...indexed.positions);
    contributions.push(...indexed.stats.values());
  }
  const stats: StatRow[] = mergeStatRows(databaseId, contributions);
  type GamePositionInsert = Database["public"]["Tables"]["game_positions"]["Insert"];
  const toInsert = (row: PositionRow): GamePositionInsert => ({
    game_id: row.game_id,
    seq: row.seq,
    ply: row.ply,
    // zkey is pg bigint ↔ string in postgrest-js (precision safety); coerce explicitly.
    zkey: String(row.zkey),
    next_uci: row.next_uci,
  });
  const positionsError = await insertChunks(positions, (chunk) =>
    supabase.from("game_positions").insert(chunk.map(toInsert)),
  );
  if (positionsError) {
    return positionsError.message;
  }
  const statsError = await insertChunks(stats, (chunk) => supabase.from("position_stats").insert(chunk));
  if (statsError) {
    return statsError.message;
  }
  return null;
}

async function insertChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => PromiseLike<{ error: { message: string; code?: string } | null }>,
  size = 400,
): Promise<{ message: string; code?: string } | null> {
  for (let index = 0; index < rows.length; index += size) {
    const { error } = await insert(rows.slice(index, index + size));
    if (error) {
      return error;
    }
  }
  return null;
}

export const FOLDER_CYCLE_MESSAGE = "A folder can't be moved inside itself or one of its subfolders.";

export function folderWriteErrorMessage(error: { message?: string } | null): string | null {
  if (!error) {
    return null;
  }
  if (typeof error.message === "string" && error.message.includes("folder_cycle")) {
    return FOLDER_CYCLE_MESSAGE;
  }
  return error.message ?? "Could not save the folder.";
}

export async function persistRemoteFolder(folder: FileFolder, userId: string): Promise<string | null> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return null;
  }
  const { error } = await supabase.from("user_folders").upsert({
    id: folder.id,
    user_id: userId,
    name: folder.name,
    parent_id: folder.parentId,
  });
  return folderWriteErrorMessage(error);
}

/** Metadata changes leave the games and position index alone. */
export function persistRemoteDatabaseName(remoteId: string, name: string) {
  return persistRemoteDatabaseMetadata(remoteId, { name });
}

export function persistRemoteDatabaseFolder(remoteId: string, folderId: string | null) {
  return persistRemoteDatabaseMetadata(remoteId, { folder_id: folderId });
}

async function persistRemoteDatabaseMetadata(
  remoteId: string,
  fields: { name: string } | { folder_id: string | null },
): Promise<string | null> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return null;
  }
  const { error } = await supabase.from("game_databases").update(fields).eq("id", remoteId);
  return databaseSaveErrorMessage(error);
}

export async function deleteRemoteFolder(folderId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return;
  }
  await supabase.from("user_folders").delete().eq("id", folderId);
}

export async function loadRemoteFiles(userId: string): Promise<FilesLibrary> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return EMPTY_FILES;
  }
  const { data: folderRows, error: folderError } = await supabase
    .from("user_folders")
    .select("id, name, parent_id")
    .eq("user_id", userId);

  if (folderError) {
    throw folderError;
  }
  const folders: FileFolder[] = (folderRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
  }));

  const { data: databases, error } = await supabase
    .from("game_databases")
    .select("id, name, folder_id")
    .eq("user_id", userId)
    .eq("kind", "personal");
  if (error) {
    throw error;
  }
  const result: FileDatabase[] = [];
  for (const row of databases) {
    // The Supabase API caps each response at 1,000 rows.
    const pageSize = 1000;
    const games: FileGame[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error: gamesError } = await supabase
        .from("games")
        .select("id, white, black, event, result, date, pgn")
        .eq("database_id", row.id)
        .eq("pending", false)
        .order("id")
        .range(offset, offset + pageSize - 1);
      if (gamesError) {
        throw gamesError;
      }
      for (const game of page) {
        games.push({
          id: game.id,
          white: game.white,
          black: game.black,
          result: game.result ?? "*",
          event: game.event ?? "",
          date: game.date
            ? game.date.replaceAll("-", ".")
            : dateFromPgn(game.pgn),
          pgn: game.pgn,
          title: `${game.white} vs ${game.black}`,
        });
      }
      if (page.length < pageSize) {
        break;
      }
    }
    result.push({
      id: crypto.randomUUID(),
      remoteId: row.id,
      name: row.name,
      folderId: row.folder_id ?? null,
      games,
    });
  }
  return { folders, databases: result };
}

export async function deleteRemoteDatabase(remoteId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return;
  }
  await supabase.from("game_databases").delete().eq("id", remoteId);
}

export function isDescendantFolder(
  folders: FileFolder[],
  folderId: string,
  potentialAncestorId: string,
): boolean {
  let current = folders.find((f) => f.id === folderId);
  const visited = new Set<string>();
  while (current && current.parentId) {
    if (visited.has(current.id)) {
      break;
    }
    visited.add(current.id);
    if (current.parentId === potentialAncestorId) {
      return true;
    }
    current = folders.find((f) => f.id === current?.parentId);
  }
  return false;
}

export function getDescendantFolderIds(
  folders: FileFolder[],
  folderId: string,
): Set<string> {
  const descendants = new Set<string>();
  const queue = [folderId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const folder of folders) {
      if (folder.parentId === parentId && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        queue.push(folder.id);
      }
    }
  }
  return descendants;
}

export function canMoveFolder(
  folders: FileFolder[],
  folderId: string,
  targetParentId: string | null,
): boolean {
  if (targetParentId === null) {
    return true;
  }
  if (targetParentId === folderId) {
    return false;
  }
  const targetExists = folders.some((f) => f.id === targetParentId);
  if (!targetExists) {
    return false;
  }
  return !isDescendantFolder(folders, targetParentId, folderId);
}

