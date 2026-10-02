import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { importPgn } from "@/src/chess/pgn";
import { parsePgnCollection, type ParsedFileGame } from "@/src/chess/pgn-games";
import { mergeStatRows, resultBucket, rowsForTree, type PositionRow, type StatRow } from "@/src/lib/position-index";
import type { Database } from "@/src/lib/supabase/database.types";

const FILES_KEY = "studio-clone-files";

export type FileFolder = {
  id: string;
  name: string;
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

export function loadLocalFiles(): FilesLibrary {
  if (typeof window === "undefined") {
    return EMPTY_FILES;
  }
  try {
    const raw = window.localStorage.getItem(FILES_KEY);
    if (!raw) {
      return EMPTY_FILES;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.folders) || !Array.isArray(parsed.databases)) {
      return EMPTY_FILES;
    }
    return {
      folders: parsed.folders.flatMap((item) => {
        if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") {
          return [];
        }
        return [{ id: item.id, name: item.name }];
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

export function saveLocalFiles(library: FilesLibrary): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(FILES_KEY, JSON.stringify(library));
}

export function libraryFromPgn(name: string, pgn: string, folderId: string | null): FileDatabase {
  const parsed = parsePgnCollection(pgn);
  return {
    id: crypto.randomUUID(),
    remoteId: null,
    name,
    folderId,
    games: parsed.games,
  };
}

export async function persistRemoteDatabase(
  database: FileDatabase,
  userId: string,
): Promise<{ remoteId: string | null; indexError: string | null }> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return { remoteId: null, indexError: null };
  }
  let remoteId = database.remoteId;
  if (!remoteId) {
    const { data, error } = await supabase
      .from("game_databases")
      .insert({
        user_id: userId,
        name: database.name,
        kind: "personal",
        game_count: database.games.length,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { remoteId: null, indexError: null };
    }
    remoteId = data.id;
  } else {
    await supabase
      .from("game_databases")
      .update({ name: database.name, game_count: database.games.length })
      .eq("id", remoteId);
    await supabase.from("games").delete().eq("database_id", remoteId);
  }
  if (database.games.length > 0) {
    const prepared = database.games.map((game) => {
      const imported = importPgn(game.pgn);
      const headers = imported.headers;
      const id = crypto.randomUUID();
      return {
        id,
        imported,
        row: {
          id,
          database_id: remoteId,
          white: headers.White ?? game.white,
          black: headers.Black ?? game.black,
          white_elo: headerNumber(headers.WhiteElo),
          black_elo: headerNumber(headers.BlackElo),
          event: headers.Event ?? game.event ?? null,
          date: sqlDate(headers.Date ?? game.date),
          eco: headers.ECO ?? null,
          opening: headers.Opening ?? null,
          result: headers.Result ?? game.result,
          ply_count: imported.tree.children.length > 0 ? countMoves(imported.tree) : 0,
          pgn: game.pgn,
        },
      };
    });
    const { error } = await supabase.from("games").insert(prepared.map((item) => item.row));
    if (error) {
      return { remoteId, indexError: null };
    }
    const indexError = await writePositionIndex(
      supabase,
      remoteId,
      prepared.map((item) => ({
        id: item.id,
        tree: item.imported.tree,
        result: item.row.result,
      })),
    );
    return { remoteId, indexError };
  } else {
    await supabase.from("position_stats").delete().eq("database_id", remoteId);
  }
  return { remoteId, indexError: null };
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

function countMoves(tree: { children: Array<{ children: unknown[] }> }): number {
  let count = 0;
  const walk = (nodes: Array<{ children: unknown[] }>) => {
    for (const node of nodes) {
      count += 1;
      walk(node.children as Array<{ children: unknown[] }>);
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
  const positionsError = await insertChunks(positions, (chunk) =>
    supabase.from("game_positions").insert(chunk as unknown as GamePositionInsert[]),
  );
  if (positionsError) {
    return positionsError;
  }
  const statsError = await insertChunks(stats, (chunk) => supabase.from("position_stats").insert(chunk));
  if (statsError) {
    return statsError;
  }
  return null;
}

async function insertChunks<T extends PositionRow | StatRow>(
  rows: T[],
  insert: (chunk: T[]) => PromiseLike<{ error: { message: string } | null }>,
): Promise<string | null> {
  for (let index = 0; index < rows.length; index += 400) {
    const { error } = await insert(rows.slice(index, index + 400));
    if (error) {
      return error.message;
    }
  }
  return null;
}

export async function loadRemoteFiles(userId: string): Promise<FileDatabase[]> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return [];
  }
  const { data: databases, error } = await supabase
    .from("game_databases")
    .select("id, name, game_count")
    .eq("user_id", userId)
    .eq("kind", "personal");
  if (error || !databases) {
    return [];
  }
  const result: FileDatabase[] = [];
  for (const row of databases) {
    const { data: games } = await supabase
      .from("games")
      .select("id, white, black, event, result, pgn")
      .eq("database_id", row.id);
    result.push({
      id: crypto.randomUUID(),
      remoteId: row.id,
      name: row.name,
      folderId: null,
      games: (games ?? []).map((game) => ({
        id: game.id,
        white: game.white,
        black: game.black,
        result: game.result ?? "*",
        event: game.event ?? "",
        date: "",
        pgn: game.pgn,
        title: `${game.white} vs ${game.black}`,
      })),
    });
  }
  return result;
}

export async function deleteRemoteDatabase(remoteId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return;
  }
  await supabase.from("game_databases").delete().eq("id", remoteId);
}
