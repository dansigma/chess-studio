import { buildCompactPgn, sanLineFromPgn } from "@/src/chess/pgn-clean";
import {
  isClosedLichessUser,
  usableDisplayName,
  usernameCandidates,
} from "@/src/lib/player-search";
import type { PlayerGame, PlayerHit } from "@/src/lib/player-types";
import {
  GAMES_TIMEOUT_MS,
  MAX_PLAYER_GAMES,
  MAX_PLAYER_GAMES_BYTES,
  SEARCH_TIMEOUT_MS,
  UA,
  fetchTimeout,
  lichessToken,
  playerResult,
} from "./shared";
import { readCapped } from "../read-capped";

export function lichessHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": UA,
  };
  const token = lichessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export type LichessUser = {
  id?: string;
  name?: string;
  title?: string;
  username?: string;
  disabled?: boolean;
};

export function hitFromLichessUser(user: LichessUser, fallback: string): PlayerHit | null {
  if (isClosedLichessUser(user)) {
    return null;
  }
  const username = user.id ?? user.username ?? user.name ?? fallback;
  if (!username) {
    return null;
  }
  const display = usableDisplayName(user.name ?? user.username, username);
  return {
    id: `lichess:${username}`,
    source: "lichess",
    username,
    displayName: user.title ? `${user.title} ${display}` : display,
    subtitle: "Lichess",
    title: user.title,
  };
}

async function hydrateLichessUsers(ids: string[]): Promise<LichessUser[]> {
  if (ids.length === 0) {
    return [];
  }
  const response = await fetchTimeout(
    "https://lichess.org/api/users",
    {
      method: "POST",
      headers: { ...lichessHeaders(), "Content-Type": "text/plain" },
      body: ids.join(","),
      cache: "no-store",
    },
    SEARCH_TIMEOUT_MS,
  );
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as unknown;
  return Array.isArray(payload) ? (payload as LichessUser[]) : [];
}

async function lookupLichessUser(username: string): Promise<PlayerHit | null> {
  const response = await fetchTimeout(
    `https://lichess.org/api/user/${encodeURIComponent(username.toLowerCase())}`,
    { headers: lichessHeaders(), cache: "no-store" },
    SEARCH_TIMEOUT_MS,
  );
  if (!response.ok) {
    return null;
  }
  const user = (await response.json()) as LichessUser;
  return hitFromLichessUser(user, username);
}

export async function searchLichess(query: string): Promise<PlayerHit[]> {
  const hits: PlayerHit[] = [];
  const seen = new Set<string>();
  function add(hit: PlayerHit | null) {
    if (!hit || seen.has(hit.id)) {
      return;
    }
    seen.add(hit.id);
    hits.push(hit);
  }

  const exactNames = new Set<string>();
  if (/^[a-zA-Z0-9_-]{2,30}$/.test(query)) {
    exactNames.add(query);
  }
  for (const candidate of usernameCandidates(query)) {
    exactNames.add(candidate);
  }
  await Promise.all(
    [...exactNames].slice(0, 4).map(async (username) => {
      try {
        add(await lookupLichessUser(username));
      } catch {
        // other lookups still run
      }
    }),
  );

  const canAutocomplete = /^[a-zA-Z0-9_-]{3,30}$/.test(query);
  if (!canAutocomplete) {
    return hits;
  }
  try {
    const response = await fetchTimeout(
      `https://lichess.org/api/player/autocomplete?term=${encodeURIComponent(query)}&object=true`,
      { headers: lichessHeaders(), cache: "no-store" },
      SEARCH_TIMEOUT_MS,
    );
    if (!response.ok) {
      return hits;
    }
    const payload = (await response.json()) as unknown;
    const rows = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && "result" in payload && Array.isArray(payload.result)
        ? payload.result
        : [];
    const ids: string[] = [];
    for (const row of rows.slice(0, 8)) {
      if (typeof row === "string") {
        ids.push(row);
        continue;
      }
      if (typeof row !== "object" || row === null) {
        continue;
      }
      const user = row as LichessUser;
      const id = user.id ?? user.username;
      if (id) {
        ids.push(id);
      }
    }
    const hydrated = await hydrateLichessUsers(ids);
    const byId = new Map(hydrated.map((user) => [(user.id ?? user.username ?? "").toLowerCase(), user]));
    for (const id of ids) {
      const user = byId.get(id.toLowerCase());
      add(user ? hitFromLichessUser(user, id) : null);
    }
  } catch {
    return hits;
  }
  return hits;
}

export type LichessGameJson = {
  id?: string;
  winner?: string;
  status?: string;
  createdAt?: number;
  moves?: string;
  pgn?: string;
  opening?: { eco?: string; name?: string };
  players?: {
    white?: { user?: { name?: string; id?: string }; rating?: number };
    black?: { user?: { name?: string; id?: string }; rating?: number };
  };
};

export function lichessWinner(game: LichessGameJson): PlayerGame["winner"] {
  if (game.winner === "white" || game.winner === "black") {
    return game.winner;
  }
  if (game.status === "draw" || game.status === "stalemate") {
    return "draw";
  }
  return null;
}

export async function lichessGamesSince(
  username: string,
  sinceMs: number,
  max: number,
): Promise<PlayerGame[]> {
  const params = new URLSearchParams({
    max: String(max),
    clocks: "false",
    evals: "false",
    opening: "true",
    moves: "true",
  });
  if (sinceMs > 0) {
    params.set("since", String(sinceMs));
  }
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { ...lichessHeaders(), Accept: "application/x-ndjson" },
    signal: AbortSignal.timeout(GAMES_TIMEOUT_MS),
    next: { revalidate: 120 },
  });
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "No public games for this Lichess account."
        : "Lichess games request failed",
    );
  }
  const text = await readCapped(response, MAX_PLAYER_GAMES_BYTES);
  const games: PlayerGame[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    let raw: LichessGameJson;
    try {
      raw = JSON.parse(line) as LichessGameJson;
    } catch {
      console.warn("Skipping malformed NDJSON line in Lichess response", { line });
      continue;
    }
    const whiteName = raw.players?.white?.user?.name ?? raw.players?.white?.user?.id ?? "White";
    const blackName = raw.players?.black?.user?.name ?? raw.players?.black?.user?.id ?? "Black";
    const target = username.toLowerCase();
    const color: "white" | "black" =
      whiteName.toLowerCase() === target || (raw.players?.white?.user?.id ?? "").toLowerCase() === target
        ? "white"
        : "black";
    const winner = lichessWinner(raw);
    const created = typeof raw.createdAt === "number" ? raw.createdAt : null;
    const moves = raw.moves?.trim() || (raw.pgn ? sanLineFromPgn(raw.pgn) : "");
    const result =
      winner === "white" ? "1-0" : winner === "black" ? "0-1" : winner === "draw" ? "1/2-1/2" : "*";
    const date = created
      ? `${new Date(created).getUTCFullYear()}.${String(new Date(created).getUTCMonth() + 1).padStart(2, "0")}.${String(new Date(created).getUTCDate()).padStart(2, "0")}`
      : undefined;
    games.push({
      id: raw.id ?? `${whiteName}-${blackName}-${created ?? games.length}`,
      winner,
      whiteName,
      whiteRating: raw.players?.white?.rating ?? null,
      blackName,
      blackRating: raw.players?.black?.rating ?? null,
      year: created ? new Date(created).getUTCFullYear() : null,
      month: created ? new Date(created).getUTCMonth() + 1 : null,
      event: raw.opening?.name ?? null,
      eco: raw.opening?.eco ?? null,
      opening: raw.opening?.name ?? null,
      moves: moves || undefined,
      pgn: moves
        ? buildCompactPgn(
            {
              Event: raw.opening?.name ?? "Lichess",
              Site: "https://lichess.org",
              Date: date ?? "????.??.??",
              White: whiteName,
              Black: blackName,
              Result: result,
              WhiteElo: raw.players?.white?.rating ? String(raw.players.white.rating) : "",
              BlackElo: raw.players?.black?.rating ? String(raw.players.black.rating) : "",
              ECO: raw.opening?.eco ?? "",
              Opening: raw.opening?.name ?? "",
            },
            moves,
          )
        : undefined,
      color,
      playerResult: playerResult(winner, color),
      playedAt: created,
    });
  }
  return games;
}

export async function lichessGames(username: string): Promise<PlayerGame[]> {
  return lichessGamesSince(username, 0, MAX_PLAYER_GAMES);
}
