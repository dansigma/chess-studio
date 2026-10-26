import { sanLineFromPgn, stripPgnNoise } from "@/src/chess/pgn-clean";
import { usableDisplayName, usernameCandidates } from "@/src/lib/player-search";
import type { PlayerGame, PlayerHit } from "@/src/lib/player-types";
import {
  GAMES_TIMEOUT_MS,
  MAX_PLAYER_GAMES,
  MAX_PLAYER_GAMES_BYTES,
  SEARCH_TIMEOUT_MS,
  UA,
  fetchTimeout,
  mapWithConcurrency,
  playerResult,
} from "./shared";
import { readCapped } from "../read-capped";

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
  const fetched = await mapWithConcurrency(candidates, 2, (candidate) => lookupChesscomCandidate(candidate));
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

async function fetchArchive(url: string): Promise<ChesscomArchiveGame[]> {
  const monthResponse = await fetchTimeout(
    url,
    {
      headers: chesscomHeaders(),
      next: { revalidate: 120 },
    },
    GAMES_TIMEOUT_MS,
  );
  if (!monthResponse.ok) {
    return [];
  }
  const text = await readCapped(monthResponse, MAX_PLAYER_GAMES_BYTES);
  const monthPayload = JSON.parse(text) as { games?: ChesscomArchiveGame[] };
  return monthPayload.games ?? [];
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
    eco: raw.eco ?? null,
    opening: null,
    moves: moves || undefined,
    pgn: cleaned || undefined,
    timeClass: raw.time_class ?? null,
    color,
    playerResult: playerResult(winner, color),
    playedAt: end,
  };
}

export async function chesscomGamesSince(
  username: string,
  sinceMs: number,
  max: number,
): Promise<PlayerGame[]> {
  const archivesResponse = await fetchTimeout(
    `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`,
    { headers: chesscomHeaders(), next: { revalidate: 300 } },
    GAMES_TIMEOUT_MS,
  );
  if (!archivesResponse.ok) {
    throw new Error("Chess.com archives request failed");
  }
  const archivesText = await readCapped(archivesResponse, 512 * 1024);
  const archivesPayload = JSON.parse(archivesText) as { archives?: string[] };
  const allUrls = archivesPayload.archives ?? [];
  if (allUrls.length === 0) {
    return [];
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
  for (const archiveUrl of urls) {
    const month = await fetchArchive(archiveUrl);
    for (const raw of month.slice().reverse()) {
      const playedAt = typeof raw.end_time === "number" ? raw.end_time * 1000 : null;
      if (sinceMs > 0 && (playedAt === null || playedAt <= sinceMs)) {
        continue;
      }
      games.push(compactChesscomGame(raw, target, games.length));
      if (games.length >= max) {
        return games;
      }
    }
  }
  return games;
}

export async function chesscomGames(username: string): Promise<PlayerGame[]> {
  return chesscomGamesSince(username, 0, MAX_PLAYER_GAMES);
}
