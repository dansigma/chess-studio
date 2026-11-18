import { sanLineFromPgn } from "@/src/chess/pgn-clean";
import type { PlayerGame, PlayerHit } from "@/src/lib/player-types";
import type { FileDatabase, FileGame } from "@/src/lib/user-files";
import { playerResult } from "./shared";

// SIG-1333: players and games from the PGN files loaded in the Library, in the
// same shapes the online sources use. Pure: no store, no network.

const MAX_LOCAL_HITS = 50;
const INCREMENT_MOVES = 40;

export type LocalTimeClass = "bullet" | "blitz" | "rapid" | "classical";

/** Base seconds + 40 × increment from a PGN `[TimeControl]` value, or null. */
function estimateSeconds(timeControl: string): number | null {
  const raw = timeControl.trim();
  if (!raw || raw === "-" || raw === "?") {
    return null;
  }
  // "40/7200:3600" → first period "40/7200"; "*300" (sandclock) → "300".
  const firstStage = raw.split(":")[0] ?? "";
  const withoutMoves = firstStage.includes("/") ? firstStage.slice(firstStage.indexOf("/") + 1) : firstStage;
  const match = /^\*?(\d+)(?:\+(\d+))?$/.exec(withoutMoves.trim());
  if (!match) {
    return null;
  }
  const base = Number(match[1]);
  const increment = Number(match[2] ?? 0);
  if (base + increment === 0) {
    return null;
  }
  return base + INCREMENT_MOVES * increment;
}

function classFromSeconds(seconds: number): LocalTimeClass {
  if (seconds < 180) {
    return "bullet";
  }
  if (seconds < 480) {
    return "blitz";
  }
  if (seconds < 1500) {
    return "rapid";
  }
  return "classical";
}

/**
 * Time class of a PGN game: from `[TimeControl]` when readable, else from the
 * words Bullet / Blitz / Rapid / Classical in `[Event]`, else null. Same
 * lower-case strings as the Lichess `speed` and Chess.com `time_class` fields.
 */
export function timeClassFromHeaders({
  timeControl,
  event,
}: {
  timeControl?: string | null;
  event?: string | null;
}): LocalTimeClass | null {
  const seconds = timeControl ? estimateSeconds(timeControl) : null;
  if (seconds !== null) {
    return classFromSeconds(seconds);
  }
  const word = /\b(bullet|blitz|rapid|classical)\b/i.exec(event ?? "");
  return word ? (word[1].toLowerCase() as LocalTimeClass) : null;
}

type LocalHeaders = {
  timeControl: string | null;
  whiteElo: number | null;
  blackElo: number | null;
  eco: string | null;
  opening: string | null;
};

const TAG = /\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/g;

/** Light tag scan of the header block only; never builds a game tree. */
function scanHeaders(pgn: string): Record<string, string> {
  const lines = pgn.split("\n");
  const block: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" && block.length === 0) {
      continue;
    }
    if (!trimmed.startsWith("[")) {
      break;
    }
    block.push(trimmed);
  }
  const headers: Record<string, string> = {};
  for (const match of block.join("\n").matchAll(TAG)) {
    headers[match[1]] = match[2].replace(/\\(["\\])/g, "$1");
  }
  return headers;
}

function rating(value: string | undefined): number | null {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "?" ? trimmed : null;
}

const headerCache = new WeakMap<FileGame, LocalHeaders>();

function headersOf(game: FileGame): LocalHeaders {
  const cached = headerCache.get(game);
  if (cached) {
    return cached;
  }
  const tags = scanHeaders(game.pgn);
  const parsed: LocalHeaders = {
    timeControl: text(tags.TimeControl),
    whiteElo: rating(tags.WhiteElo),
    blackElo: rating(tags.BlackElo),
    eco: text(tags.ECO),
    opening: text(tags.Opening),
  };
  headerCache.set(game, parsed);
  return parsed;
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function isNamed(name: string): boolean {
  const key = nameKey(name);
  return key !== "" && key !== "?";
}

/**
 * The hit for a player found in the loaded PGN files. SIG-1405: the idle
 * Players list reuses it so a player looks the same whether it came from a
 * search or from the local suggestions.
 */
export function localPlayerHit(name: string): PlayerHit {
  const resolved = name.trim();
  return {
    id: `studio:${resolved}`,
    source: "studio",
    username: resolved,
    displayName: resolved,
    subtitle: "Studio database",
    inDatabases: true,
  };
}

/** Local players whose name contains `query` (case-insensitive), one per name. */
export function localPlayerHits(databases: FileDatabase[], query: string): PlayerHit[] {
  const target = nameKey(query);
  if (!target) {
    return [];
  }
  const found = new Map<string, PlayerHit>();
  for (const database of databases) {
    for (const game of database.games) {
      for (const raw of [game.white, game.black]) {
        const key = nameKey(raw);
        if (!isNamed(raw) || !key.includes(target) || found.has(key)) {
          continue;
        }
        found.set(key, localPlayerHit(raw));
      }
    }
  }
  return [...found.values()].slice(0, MAX_LOCAL_HITS);
}

/**
 * Merges local hits into the server hits. A `studio` hit is shown once, keyed
 * by lower-cased name: the server hit wins (it can carry sample-book info) and
 * is marked `inDatabases` when the player is also local.
 */
export function mergePlayerHits(local: PlayerHit[], server: PlayerHit[]): PlayerHit[] {
  if (local.length === 0) {
    return server;
  }
  const localKeys = new Set(local.map((hit) => nameKey(hit.username)));
  const seenStudio = new Set<string>();
  const merged: PlayerHit[] = [];
  for (const hit of server) {
    if (hit.source !== "studio") {
      merged.push(hit);
      continue;
    }
    const key = nameKey(hit.username);
    if (seenStudio.has(key)) {
      continue;
    }
    seenStudio.add(key);
    merged.push(localKeys.has(key) ? { ...hit, inDatabases: true } : hit);
  }
  for (const hit of local) {
    const key = nameKey(hit.username);
    if (!seenStudio.has(key)) {
      seenStudio.add(key);
      merged.push(hit);
    }
  }
  return merged;
}

function winnerFromResult(result: string): PlayerGame["winner"] {
  const value = result.trim();
  if (value === "1-0") {
    return "white";
  }
  if (value === "0-1") {
    return "black";
  }
  if (value === "1/2-1/2" || value === "½-½") {
    return "draw";
  }
  return null;
}

/** `YYYY.MM.DD` with `?` parts → year / month / UTC timestamp. */
function parseDate(value: string): { year: number | null; month: number | null; playedAt: number | null } {
  const match = /^(\d{4})(?:[.\-/](\d{1,2}|\?\?))?(?:[.\-/](\d{1,2}|\?\?))?/.exec(value.trim());
  if (!match) {
    return { year: null, month: null, playedAt: null };
  }
  const year = Number(match[1]);
  const month = match[2] && /^\d+$/.test(match[2]) ? Number(match[2]) : null;
  const day = match[3] && /^\d+$/.test(match[3]) ? Number(match[3]) : null;
  const validMonth = month !== null && month >= 1 && month <= 12 ? month : null;
  const playedAt = Date.UTC(year, (validMonth ?? 1) - 1, validMonth !== null && day ? day : 1);
  return { year, month: validMonth, playedAt: Number.isFinite(playedAt) ? playedAt : null };
}

const gameCache = new WeakMap<FileGame, Partial<Record<"white" | "black", PlayerGame>>>();

function toPlayerGame(game: FileGame, color: "white" | "black"): PlayerGame {
  const slots = gameCache.get(game) ?? {};
  const cached = slots[color];
  if (cached) {
    return cached;
  }
  const built = buildPlayerGame(game, color);
  slots[color] = built;
  gameCache.set(game, slots);
  return built;
}

function buildPlayerGame(game: FileGame, color: "white" | "black"): PlayerGame {
  const headers = headersOf(game);
  const winner = winnerFromResult(game.result);
  const { year, month, playedAt } = parseDate(game.date);
  const moves = sanLineFromPgn(game.pgn);
  return {
    id: game.id,
    winner,
    whiteName: game.white,
    whiteRating: headers.whiteElo,
    blackName: game.black,
    blackRating: headers.blackElo,
    year,
    month,
    event: text(game.event),
    eco: headers.eco,
    opening: headers.opening,
    pgn: game.pgn,
    moves: moves || undefined,
    timeClass: timeClassFromHeaders({ timeControl: headers.timeControl, event: game.event }),
    color,
    playerResult: playerResult(winner, color),
    playedAt,
  };
}

/** Every game of `name` (case-insensitive, trimmed) in all databases, uncapped. */
export function localPlayerGames(databases: FileDatabase[], name: string): PlayerGame[] {
  const target = nameKey(name);
  if (!target) {
    return [];
  }
  const games: PlayerGame[] = [];
  for (const database of databases) {
    for (const game of database.games) {
      if (nameKey(game.white) === target) {
        games.push(toPlayerGame(game, "white"));
      } else if (nameKey(game.black) === target) {
        games.push(toPlayerGame(game, "black"));
      }
    }
  }
  return games;
}
