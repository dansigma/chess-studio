import { sanLineFromPgn, stripPgnNoise } from "@/src/chess/pgn-clean";
import { usableDisplayName, usernameCandidates } from "@/src/lib/player-search";
import type { PlayerGame, PlayerHit } from "@/src/lib/player-types";
import {
  GAMES_TIMEOUT_MS,
  MAX_ARCHIVE_STREAM_BYTES,
  MAX_PLAYER_GAMES,
  SEARCH_TIMEOUT_MS,
  UA,
  fetchTimeout,
  NoPublicGamesError,
  mapWithConcurrency,
  playerResult,
} from "./shared";
import { readCapped } from "../read-capped";
import { streamArrayTail } from "./json-array-stream";
import { chesscomOpeningNameFromUrl } from "./chesscom-opening";

export { chesscomOpeningNameFromUrl };

export function chesscomHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "User-Agent": UA,
  };
}

export type ChesscomPlayer = {
  username?: string;
  name?: string;
  title?: string;
};

export async function searchChesscom(query: string): Promise<PlayerHit[]> {
  const candidates = usernameCandidates(query);
  // SIG-1210: Chess.com asks for serial requests; parallel ones get 429.
  const fetched = await mapWithConcurrency(candidates, 1, (candidate) => lookupChesscomCandidate(candidate));
  const hits: PlayerHit[] = [];
  const seen = new Set<string>();
  for (const hit of fetched) {
    if (!hit) {
      continue;
    }
    const key = hit.username.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    hits.push(hit);
  }
  return hits;
}

async function lookupChesscomCandidate(candidate: string): Promise<PlayerHit | null> {
  try {
    const response = await fetchTimeout(
      `https://api.chess.com/pub/player/${encodeURIComponent(candidate.toLowerCase())}`,
      { headers: chesscomHeaders(), cache: "no-store" },
      SEARCH_TIMEOUT_MS,
    );
    if (!response.ok) {
      return null;
    }
    const player = (await response.json()) as ChesscomPlayer;
    const username = player.username ?? candidate.toLowerCase();
    const display = usableDisplayName(player.name, username);
    return {
      id: `chesscom:${username}`,
      source: "chesscom",
      username,
      displayName: player.title ? `${player.title} ${display}` : display,
      subtitle: `Chess.com · ${username}`,
      title: player.title,
    };
  } catch {
    return null;
  }
}

export type ChesscomArchiveGame = {
  url?: string;
  pgn?: string;
  end_time?: number;
  time_class?: string;
  // SIG-1048: feeds the opening-tree `ratedOnly` filter (via PlayerGame).
  rated?: boolean;
  eco?: string;
  white?: { username?: string; rating?: number; result?: string };
  black?: { username?: string; rating?: number; result?: string };
};

export function chesscomWinner(game: ChesscomArchiveGame): PlayerGame["winner"] {
  if (game.white?.result === "win") {
    return "white";
  }
  if (game.black?.result === "win") {
    return "black";
  }
  return "draw";
}

export type ChesscomArchiveResult = {
  /** Kept games, oldest to newest (the order Chess.com serves them). */
  games: ChesscomArchiveGame[];
  /** True when the safety byte cap cut the month short. */
  truncated: boolean;
};

/**
 * SIG-1210: streams one month archive and keeps only the newest `keep` games
 * (optionally only those newer than `sinceMs`). Peak memory is bounded by
 * `keep` games plus one in-flight game, not by the month size: an active
 * player's month is tens of MB. Throws on network/HTTP/parse failures; the
 * caller decides to skip the month.
 */
export async function fetchArchive(
  url: string,
  keep: number,
  sinceMs = 0,
): Promise<ChesscomArchiveResult> {
  const monthResponse = await fetchTimeout(
    url,
    {
      headers: chesscomHeaders(),
      // The vinext/Next fetch cache (`next.revalidate`) buffers the entire
      // body to store it, which would defeat the streaming parse below. The
      // loaders' own LRU and the route's Cache-Control cover repeat reads.
      cache: "no-store",
    },
    GAMES_TIMEOUT_MS,
  );
  if (!monthResponse.ok) {
    throw new Error(`Chess.com archive responded ${monthResponse.status}`);
  }
  const result = await streamArrayTail<ChesscomArchiveGame>(monthResponse.body, {
    arrayKey: "games",
    keepLast: keep,
    maxBytes: MAX_ARCHIVE_STREAM_BYTES,
    accept:
      sinceMs > 0
        ? (game) => typeof game?.end_time === "number" && game.end_time * 1000 > sinceMs
        : undefined,
  });
  return { games: result.items, truncated: result.truncated };
}

function pgnHeader(pgn: string | undefined, tag: string): string | null {
  if (!pgn) {
    return null;
  }
  const match = new RegExp(`^\\[${tag}\\s+"([^"]*)"\\]`, "m").exec(pgn);
  const value = match?.[1]?.trim();
  return value ? value : null;
}


export function compactChesscomGame(
  raw: ChesscomArchiveGame,
  username: string,
  fallbackId: number,
): PlayerGame {
  const whiteName = raw.white?.username ?? "White";
  const blackName = raw.black?.username ?? "Black";
  const color: "white" | "black" = whiteName.toLowerCase() === username.toLowerCase() ? "white" : "black";
  const winner = chesscomWinner(raw);
  const end = typeof raw.end_time === "number" ? raw.end_time * 1000 : null;
  const id =
    raw.url?.split("/").filter(Boolean).at(-1) ?? `${whiteName}-${blackName}-${end ?? fallbackId}`;
  const cleaned = raw.pgn ? stripPgnNoise(raw.pgn) : "";
  const moves = cleaned ? sanLineFromPgn(cleaned) : "";
  // SIG-1218: the stored PGN keeps Chess.com's `[%clk]` (and TimeControl header);
  // `moves` above stays SAN-only.
  const storedPgn = raw.pgn ? stripPgnNoise(raw.pgn, { keepClocks: true }) : "";
  return {
    id,
    winner,
    whiteName,
    whiteRating: raw.white?.rating ?? null,
    blackName,
    blackRating: raw.black?.rating ?? null,
    year: end ? new Date(end).getUTCFullYear() : null,
    month: end ? new Date(end).getUTCMonth() + 1 : null,
    event: "Chess.com",
    // SIG-1210: `raw.eco` is the ECOUrl, not a code. The code lives in the PGN
    // `[ECO "A40"]` header; the English name comes from the ECOUrl slug and
    // stays raw (UI localizes through resolveOpeningName), like Lichess.
    eco: pgnHeader(raw.pgn, "ECO"),
    opening: chesscomOpeningNameFromUrl(pgnHeader(raw.pgn, "ECOUrl") ?? raw.eco),
    moves: moves || undefined,
    pgn: storedPgn || undefined,
    timeClass: raw.time_class ?? null,
    // SIG-1048: absent on old payloads (null = unknown).
    rated: raw.rated ?? null,
    color,
    playerResult: playerResult(winner, color),
    playedAt: end,
  };
}

export type ChesscomGamesResult = {
  games: PlayerGame[];
  /** True when a month was skipped (failed) or cut short by the byte cap. */
  partial: boolean;
};

export async function chesscomGamesSince(
  username: string,
  sinceMs: number,
  max: number,
): Promise<PlayerGame[]> {
  return (await chesscomGamesSinceDetailed(username, sinceMs, max)).games;
}

/**
 * Like `chesscomGamesSince`, but also reports `partial` so callers can tell the
 * user that some months could not be read. A failing month never fails the
 * request: only the archives list does.
 */
export async function chesscomGamesSinceDetailed(
  username: string,
  sinceMs: number,
  max: number,
): Promise<ChesscomGamesResult> {
  const archivesResponse = await fetchTimeout(
    `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`,
    { headers: chesscomHeaders(), next: { revalidate: 300 } },
    GAMES_TIMEOUT_MS,
  );
  if (!archivesResponse.ok) {
    if (archivesResponse.status === 404) {
      throw new NoPublicGamesError("No public games for this Chess.com account.");
    }
    throw new Error("Chess.com archives request failed");
  }
  const archivesText = await readCapped(archivesResponse, 512 * 1024);
  const archivesPayload = JSON.parse(archivesText) as { archives?: string[] };
  const allUrls = archivesPayload.archives ?? [];
  if (allUrls.length === 0) {
    return { games: [], partial: false };
  }
  // Chess.com has no `since` filter: walk month archives from the newest back
  // to (and including) the month containing sinceMs. A 90-day cold sync
  // touches ~4 archives; the max cap bounds per-month work, and the archive
  // visit cap below bounds the walk when no archive URL matches the cutoff
  // month (empty history or renamed layouts would otherwise fan out to every
  // monthly archive — 100+ sequential 2 MB fetches for a decade-old account).
  const cutoff = sinceMs > 0 ? new Date(sinceMs) : null;
  const cutoffKey = cutoff ? `${cutoff.getUTCFullYear()}/${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}` : null;
  const MAX_ARCHIVES_PER_SYNC = 6;
  const urls: string[] = [];
  if (!cutoffKey) {
    // No lower bound: preserve the legacy display behavior (newest archives).
    for (let i = allUrls.length - 1; i >= 0 && urls.length < 2; i -= 1) {
      const archiveUrl = allUrls[i];
      if (archiveUrl) {
        urls.push(archiveUrl);
      }
    }
  } else {
    for (let i = allUrls.length - 1; i >= 0 && urls.length < MAX_ARCHIVES_PER_SYNC; i -= 1) {
      const archiveUrl = allUrls[i];
      if (!archiveUrl) {
        continue;
      }
      urls.push(archiveUrl);
      if (archiveUrl.includes(`/${cutoffKey}`)) {
        break;
      }
    }
  }
  const games: PlayerGame[] = [];
  const target = username.toLowerCase();
  let partial = false;
  for (const archiveUrl of urls) {
    let month: ChesscomArchiveResult;
    try {
      // Only the newest `max - games.length` of this month can still be used.
      month = await fetchArchive(archiveUrl, max - games.length, sinceMs);
    } catch (error) {
      partial = true;
      console.warn("chesscom archive skipped", {
        source: "chesscom",
        username: target,
        url: archiveUrl,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
      continue;
    }
    if (month.truncated) {
      partial = true;
      console.warn("chesscom archive truncated by byte cap", {
        source: "chesscom",
        username: target,
        url: archiveUrl,
        reason: `exceeded ${MAX_ARCHIVE_STREAM_BYTES} bytes`,
      });
    }
    // Games are oldest->newest within a month: walk the kept ones backwards.
    for (let i = month.games.length - 1; i >= 0; i -= 1) {
      const raw = month.games[i] as ChesscomArchiveGame;
      const playedAt = typeof raw.end_time === "number" ? raw.end_time * 1000 : null;
      if (sinceMs > 0 && (playedAt === null || playedAt <= sinceMs)) {
        continue;
      }
      games.push(compactChesscomGame(raw, target, games.length));
      if (games.length >= max) {
        return { games, partial };
      }
    }
  }
  return { games, partial };
}

export async function chesscomGames(username: string): Promise<PlayerGame[]> {
  return chesscomGamesSince(username, 0, MAX_PLAYER_GAMES);
}

export async function chesscomGamesDetailed(username: string): Promise<ChesscomGamesResult> {
  return chesscomGamesSinceDetailed(username, 0, MAX_PLAYER_GAMES);
}
