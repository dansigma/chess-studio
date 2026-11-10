// Imported PGNs adapter: one source per personal database (`file:<databaseId>`).
// Search, filters and sort run in memory over the whole database.
import { importPgn } from "@/src/chess/pgn";
import { searchFilesForPosition } from "@/src/lib/files-explorer";
import type { FileDatabase, FileGame } from "@/src/lib/user-files";
import {
  annotationInfo,
  matchesAnnotations,
  matchesResult,
  matchesTextFilters,
  normalizePgnDate,
  normalizeResult,
  type AnnotationInfo,
} from "./filters";
import { registerLibrarySource, listLibrarySources, unregisterLibrarySource } from "./sources";
import { compareLibraryItems } from "./sort";
import type {
  LibraryFilterState,
  LibraryGameItem,
  LibraryPage,
  LibrarySourceAdapter,
  LibrarySourceCapabilities,
  LibrarySourceId,
} from "./types";

type Parsed = { item: Omit<LibraryGameItem, "key" | "sourceId" | "gameId">; info: AnnotationInfo };

const parsedCache = new WeakMap<FileGame, Parsed>();

function parseElo(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mainlinePlies(tree: { children: { children: unknown[] }[] }): number {
  let plies = 0;
  let nodes = tree.children as { children: unknown[] }[];
  while (nodes[0]) {
    plies += 1;
    nodes = nodes[0].children as { children: unknown[] }[];
  }
  return plies;
}

function parseGame(game: FileGame): Parsed {
  const hit = parsedCache.get(game);
  if (hit) {
    return hit;
  }
  const imported = importPgn(game.pgn);
  const h = imported.headers;
  const plies = mainlinePlies(imported.tree);
  const parsed: Parsed = {
    item: {
      white: game.white || h.White || "?",
      whiteElo: parseElo(h.WhiteElo),
      black: game.black || h.Black || "?",
      blackElo: parseElo(h.BlackElo),
      result: normalizeResult(game.result || h.Result),
      eco: h.ECO && h.ECO !== "?" ? h.ECO : null,
      opening: h.Opening && h.Opening !== "?" ? h.Opening : null,
      plyCount: plies > 0 ? plies : null,
      event: game.event && game.event !== "?" ? game.event : null,
      date: normalizePgnDate(game.date || h.Date),
    },
    info: annotationInfo(imported.tree),
  };
  parsedCache.set(game, parsed);
  return parsed;
}

const CAPABILITIES: LibrarySourceCapabilities = {
  textSearch: "full",
  color: "full",
  result: "full",
  annotations: "full",
  position: "full",
  sort: "full",
  maxResults: null,
};

export function fileSourceId(databaseId: string): LibrarySourceId {
  return `file:${databaseId}`;
}

export function createFileSource(
  databaseId: string,
  getDatabase: () => FileDatabase | undefined,
): LibrarySourceAdapter {
  const id = fileSourceId(databaseId);
  const need = (): FileDatabase => {
    const db = getDatabase();
    if (!db) {
      throw new Error("Database not found");
    }
    return db;
  };
  return {
    id,
    label: () => getDatabase()?.name ?? databaseId,
    capabilities: () => CAPABILITIES,
    async list(filters: LibraryFilterState, cursor, limit, signal): Promise<LibraryPage> {
      signal.throwIfAborted();
      const db = need();
      let allowed: Set<string> | null = null;
      if (filters.position) {
        const hit = searchFilesForPosition([db], filters.position.fen)[0];
        allowed = new Set(hit?.games.map((g) => g.id) ?? []);
      }
      const rows: LibraryGameItem[] = [];
      for (const game of db.games) {
        if (allowed && !allowed.has(game.id)) {
          continue;
        }
        const parsed = parseGame(game);
        const item: LibraryGameItem = {
          key: `${id}:${game.id}`,
          sourceId: id,
          gameId: game.id,
          ...parsed.item,
        };
        if (
          matchesTextFilters(item, filters) &&
          matchesResult(item, filters.result) &&
          matchesAnnotations(parsed.info, filters.annotations)
        ) {
          rows.push(item);
        }
      }
      rows.sort((a, b) => compareLibraryItems(filters.sort, a, b));
      const offset = Math.max(0, Number(cursor ?? 0) || 0);
      const items = rows.slice(offset, offset + limit);
      const next = offset + items.length;
      return { items, nextCursor: next < rows.length ? String(next) : null, total: rows.length };
    },
    async loadPgn(gameId) {
      const game = need().games.find((g) => g.id === gameId);
      if (!game) {
        throw new Error("Game not found");
      }
      return game.pgn;
    },
  };
}

let latest = new Map<string, FileDatabase>();

/** Registers one adapter per database and drops adapters of removed ones. */
export function syncFileSources(databases: FileDatabase[]): void {
  latest = new Map(databases.map((db) => [db.id, db]));
  const wanted = new Set<LibrarySourceId>();
  for (const db of databases) {
    const id = fileSourceId(db.id);
    wanted.add(id);
    registerLibrarySource(createFileSource(db.id, () => latest.get(db.id)));
  }
  for (const adapter of listLibrarySources()) {
    if (adapter.id.startsWith("file:") && !wanted.has(adapter.id)) {
      unregisterLibrarySource(adapter.id);
    }
  }
}
