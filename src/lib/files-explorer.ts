import { importPgn } from "@/src/chess/pgn";
import { START_FEN } from "@/src/chess/tree";
import {
  DEFAULT_EXPLORER_FILTERS,
  gameMatchesFilters,
  speedFromTimeClass,
  type ExplorerFilters,
  type ExplorerSpeed,
} from "@/src/lib/explorer-filters";
import {
  fileExplorerSource,
  type ExplorerGameRow,
  type ExplorerMoveRow,
  type ExplorerResponse,
  type ExplorerSource,
} from "@/src/lib/explorer-types";
import type { PlayerGame } from "@/src/lib/player-types";
import { visitGameTree } from "@/src/lib/position-index";
import type { FileDatabase, FileGame } from "@/src/lib/user-files";

const GAMES_PER_POSITION = 50;

type IndexGame = FileGame & {
  speed?: ExplorerSpeed | null;
  whiteRating?: number | null;
  blackRating?: number | null;
  year?: number | null;
  month?: number | null;
};

type MoveAgg = {
  san: string;
  uci: string;
  gameIds: string[];
};

type PositionAgg = {
  moves: Map<string, MoveAgg>;
  games: ExplorerGameRow[];
};

type CachedIndex = {
  signature: string;
  positions: Map<string, PositionAgg>;
};

const cache = new Map<string, CachedIndex>();

export function normalizeFen(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

function emptyPosition(): PositionAgg {
  return {
    moves: new Map(),
    games: [],
  };
}

function winnerFromResult(result: string): ExplorerGameRow["winner"] {
  if (result === "1-0") {
    return "white";
  }
  if (result === "0-1") {
    return "black";
  }
  if (result.includes("1/2")) {
    return "draw";
  }
  return null;
}

function parseRating(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const rating = Number(value);
  return Number.isFinite(rating) ? rating : null;
}

function parseDateParts(date: string | undefined): { year: number | null; month: number | null } {
  if (!date) {
    return { year: null, month: null };
  }
  const match = date.match(/^(\d{4})(?:[.\-](\d{2}))?/);
  if (!match) {
    return { year: null, month: null };
  }
  const year = Number(match[1]);
  const monthRaw = match[2] ? Number(match[2]) : null;
  return {
    year: Number.isFinite(year) ? year : null,
    month: monthRaw && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null,
  };
}

function gameRow(game: IndexGame, headers: Record<string, string>): ExplorerGameRow {
  const result = headers.Result ?? game.result;
  const date = headers.Date ?? game.date;
  const { year, month } = parseDateParts(date);
  return {
    id: game.id,
    winner: winnerFromResult(result),
    whiteName: headers.White ?? game.white,
    whiteRating: parseRating(headers.WhiteElo) ?? game.whiteRating ?? null,
    blackName: headers.Black ?? game.black,
    blackRating: parseRating(headers.BlackElo) ?? game.blackRating ?? null,
    year: year ?? game.year ?? null,
    month: month ?? game.month ?? null,
    event: headers.Event ?? game.event ?? null,
    eco: headers.ECO ?? null,
    opening: headers.Opening ?? null,
    pgn: game.pgn,
    speed: game.speed ?? null,
  };
}

function addGame(pos: PositionAgg, row: ExplorerGameRow): void {
  if (pos.games.some((item) => item.id === row.id)) {
    return;
  }
  pos.games.push(row);
}

function indexSignature(cacheId: string, games: IndexGame[]): string {
  return `${cacheId}:${games.map((game) => `${game.id}:${game.speed ?? ""}`).join(",")}`;
}

function indexGames(games: IndexGame[]): Map<string, PositionAgg> {
  const positions = new Map<string, PositionAgg>();
  for (const game of games) {
    const imported = importPgn(game.pgn);
    if (imported.tree.children.length === 0 && Object.keys(imported.headers).length === 0) {
      continue;
    }
    const row = gameRow(game, imported.headers);
    const seenMoves = new Set<string>();
    visitGameTree(imported.tree, (event) => {
      const key = normalizeFen(event.type === "move" ? event.fenBefore : event.fen);
      let pos = positions.get(key);
      if (!pos) {
        pos = emptyPosition();
        positions.set(key, pos);
      }
      if (event.type === "position") {
        if (event.leaf) {
          addGame(pos, row);
        }
        return;
      }
      addGame(pos, row);
      const dedupe = `${key}|${event.uci}`;
      if (seenMoves.has(dedupe)) {
        return;
      }
      seenMoves.add(dedupe);
      const current = pos.moves.get(event.uci) ?? {
        san: event.san,
        uci: event.uci,
        gameIds: [],
      };
      current.gameIds.push(row.id);
      pos.moves.set(event.uci, current);
    });
  }
  return positions;
}

function positionsFor(cacheId: string, games: IndexGame[]): Map<string, PositionAgg> {
  const signature = indexSignature(cacheId, games);
  const hit = cache.get(cacheId);
  if (hit && hit.signature === signature) {
    return hit.positions;
  }
  const positions = indexGames(games);
  cache.set(cacheId, { signature, positions });
  return positions;
}

export function dropFilesExplorerIndex(databaseId: string): void {
  cache.delete(databaseId);
}

function averageRating(games: ExplorerGameRow[]): number | null {
  const ratings = games.flatMap((game) => [game.whiteRating, game.blackRating]).filter((rating): rating is number => rating != null && rating > 0);
  if (ratings.length === 0) {
    return null;
  }
  return Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length);
}

function openingFor(games: ExplorerGameRow[], fen: string): ExplorerResponse["opening"] {
  if (normalizeFen(fen) === normalizeFen(START_FEN)) {
    return null;
  }
  const withEco = games.find((game) => game.eco);
  if (!withEco?.eco) {
    return null;
  }
  return { eco: withEco.eco, name: withEco.opening ?? "" };
}

function bucketOf(game: ExplorerGameRow): "white" | "draws" | "black" {
  if (game.winner === "white") {
    return "white";
  }
  if (game.winner === "black") {
    return "black";
  }
  return "draws";
}

function lookupIndexed(
  source: ExplorerSource,
  cacheId: string,
  games: IndexGame[],
  fen: string,
  filters: ExplorerFilters,
  applySpeed: boolean,
  emptyNotice?: string,
): ExplorerResponse {
  if (games.length === 0 && emptyNotice) {
    return {
      source,
      fen,
      white: 0,
      draws: 0,
      black: 0,
      opening: null,
      moves: [],
      games: [],
      notice: emptyNotice,
    };
  }
  const pos = positionsFor(cacheId, games).get(normalizeFen(fen));
  if (!pos) {
    return {
      source,
      fen,
      white: 0,
      draws: 0,
      black: 0,
      opening: null,
      moves: [],
      games: [],
    };
  }
  const allowedList = pos.games.filter((game) => gameMatchesFilters(game, filters, applySpeed));
  const allowed = new Set(allowedList.map((game) => game.id));
  const byId = new Map(pos.games.map((game) => [game.id, game]));
  let white = 0;
  let draws = 0;
  let black = 0;
  for (const game of allowedList) {
    const bucket = bucketOf(game);
    if (bucket === "white") {
      white += 1;
    } else if (bucket === "black") {
      black += 1;
    } else {
      draws += 1;
    }
  }
  const listed = [...allowedList].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).slice(0, GAMES_PER_POSITION);
  const moves: ExplorerMoveRow[] = [...pos.moves.values()]
    .map((move) => {
      const matched = move.gameIds.flatMap((id) => {
        if (!allowed.has(id)) {
          return [];
        }
        const game = byId.get(id);
        return game ? [game] : [];
      });
      let moveWhite = 0;
      let moveDraws = 0;
      let moveBlack = 0;
      for (const game of matched) {
        const bucket = bucketOf(game);
        if (bucket === "white") {
          moveWhite += 1;
        } else if (bucket === "black") {
          moveBlack += 1;
        } else {
          moveDraws += 1;
        }
      }
      return {
        san: move.san,
        uci: move.uci,
        white: moveWhite,
        draws: moveDraws,
        black: moveBlack,
        games: matched.length,
        averageRating: averageRating(matched),
      };
    })
    .filter((move) => move.games > 0)
    .sort((a, b) => b.games - a.games);
  const hadGames = pos.games.length > 0;
  return {
    source,
    fen,
    white,
    draws,
    black,
    opening: openingFor(listed, fen),
    moves,
    games: listed,
    notice: hadGames && allowedList.length === 0 ? "No games match these filters." : undefined,
  };
}

export function lookupFilesExplorer(
  database: FileDatabase,
  fen: string,
  filters: ExplorerFilters = DEFAULT_EXPLORER_FILTERS,
): ExplorerResponse {
  return lookupIndexed(fileExplorerSource(database.id), database.id, database.games, fen, filters, false);
}

export function lookupChesscomExplorer(
  games: PlayerGame[],
  fen: string,
  filters: ExplorerFilters = DEFAULT_EXPLORER_FILTERS,
): ExplorerResponse {
  const indexed: IndexGame[] = games.flatMap((game) => {
    if (!game.pgn) {
      return [];
    }
    return [
      {
        id: game.id,
        white: game.whiteName,
        black: game.blackName,
        result: game.winner === "white" ? "1-0" : game.winner === "black" ? "0-1" : "1/2-1/2",
        event: game.event ?? "Chess.com",
        date: game.year ? `${game.year}.${String(game.month ?? 1).padStart(2, "0")}.01` : "",
        pgn: game.pgn,
        title: `${game.whiteName} vs ${game.blackName}`,
        speed: game.timeClass ? speedFromTimeClass(game.timeClass) : null,
        whiteRating: game.whiteRating,
        blackRating: game.blackRating,
        year: game.year,
        month: game.month,
      },
    ];
  });
  return lookupIndexed(
    "chesscom",
    "chesscom-open",
    indexed,
    fen,
    filters,
    true,
    "Search a Chess.com player to explore their published games.",
  );
}
