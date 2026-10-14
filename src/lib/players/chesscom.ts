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
  const hits: PlayerHit[] = [];
  const seen = new Set<string>();
  for (const candidate of usernameCandidates(query)) {
    try {
      const response = await fetchTimeout(
        `https://api.chess.com/pub/player/${encodeURIComponent(candidate.toLowerCase())}`,
        { headers: chesscomHeaders(), cache: "no-store" },
        SEARCH_TIMEOUT_MS,
      );
      if (!response.ok) {
        continue;
      }
      const player = (await response.json()) as ChesscomPlayer;
      const username = player.username ?? candidate.toLowerCase();
      const key = username.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const display = usableDisplayName(player.name, username);
      hits.push({
        id: `chesscom:${username}`,
        source: "chesscom",
        username,
        displayName: player.title ? `${player.title} ${display}` : display,
        subtitle: `Chess.com · ${username}`,
        title: player.title,
      });
    } catch {
      // try remaining candidates
    }
  }
  return hits;
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

export async function chesscomGames(username: string): Promise<PlayerGame[]> {
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
  const urls = (archivesPayload.archives ?? []).slice(-2);
  const latestUrl = urls.at(-1);
  if (!latestUrl) {
    return [];
  }
  const latest = await fetchArchive(latestUrl);
  const ordered = latest.slice().reverse();
  const games: PlayerGame[] = [];
  const target = username.toLowerCase();
  for (const raw of ordered) {
    games.push(compactChesscomGame(raw, target, games.length));
    if (games.length >= MAX_PLAYER_GAMES) {
      return games;
    }
  }
  const previousUrl = urls.length > 1 ? urls[0] : undefined;
  if (previousUrl && previousUrl !== latestUrl) {
    const previous = await fetchArchive(previousUrl);
    for (const raw of previous.slice().reverse()) {
      games.push(compactChesscomGame(raw, target, games.length));
      if (games.length >= MAX_PLAYER_GAMES) {
        break;
      }
    }
  }
  return games;
}
