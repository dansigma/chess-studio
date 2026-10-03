import { buildCompactPgn, sanLineFromPgn, stripPgnNoise } from "@/src/chess/pgn-clean";
import { createServerSupabase } from "@/src/lib/supabase/server";
import { bookGamesForPlayer, searchBookPlayers } from "@/src/lib/opening-book";
import {
  isClosedLichessUser,
  usableDisplayName,
  usernameCandidates,
} from "@/src/lib/player-search";
import type {
  PlayerGame,
  PlayerGamesResponse,
  PlayerHit,
  PlayerSource,
} from "@/src/lib/player-types";
import { createLruCache } from "@/src/lib/lru";

const MAX_PLAYER_GAMES = 80;
const GAMES_CACHE_TTL_MS = 180_000;
const SEARCH_TIMEOUT_MS = 6_000;
const GAMES_TIMEOUT_MS = 15_000;
const gamesCache = createLruCache<string, { expires: number; payload: PlayerGamesResponse }>(200);

const UA = "StudioClone/0.1 (chess analysis; local development)";

function lichessToken(): string | undefined {
  return process.env.LICHESS_TOKEN ?? process.env.LICHESS_API_TOKEN;
}

function lichessHeaders(): Record<string, string> {
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

function chesscomHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "User-Agent": UA,
  };
}

function fetchTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

function safeQuery(value: string): string {
  return value.replace(/[%_,()"]/g, " ").trim().slice(0, 48);
}

function playerResult(
  winner: PlayerGame["winner"],
  color: "white" | "black",
): PlayerGame["playerResult"] {
  if (winner === "draw") {
    return "draw";
  }
  if (winner === "white" || winner === "black") {
    return winner === color ? "win" : "loss";
  }
  return null;
}

type LichessUser = {
  id?: string;
  name?: string;
  title?: string;
  username?: string;
  disabled?: boolean;
};

function hitFromLichessUser(user: LichessUser, fallback: string): PlayerHit | null {
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

async function searchLichess(query: string): Promise<PlayerHit[]> {
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

type ChesscomPlayer = {
  username?: string;
  name?: string;
  title?: string;
};

async function searchChesscom(query: string): Promise<PlayerHit[]> {
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

async function searchStudioDatabase(query: string): Promise<PlayerHit[]> {
  const hits = searchBookPlayers(query);
  const supabase = await createServerSupabase();
  if (!supabase) {
    return hits;
  }
  const needle = safeQuery(query);
  if (needle.length < 2) {
    return hits;
  }
  const { data } = await supabase
    .from("games")
    .select("white, black")
    .or(`white.ilike.%${needle}%,black.ilike.%${needle}%`)
    .limit(80);
  const known = new Set(hits.map((hit) => hit.username.toLowerCase()));
  for (const row of data ?? []) {
    for (const name of [row.white, row.black]) {
      if (typeof name !== "string" || !name.toLowerCase().includes(needle.toLowerCase())) {
        continue;
      }
      const key = name.toLowerCase();
      if (known.has(key)) {
        continue;
      }
      known.add(key);
      hits.push({
        id: `studio:${name}`,
        source: "studio",
        username: name,
        displayName: name,
        subtitle: "Studio database",
      });
    }
  }
  return hits;
}

export async function searchPlayers(query: string): Promise<PlayerHit[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }
  const [lichess, chesscom, studio] = await Promise.all([
    searchLichess(q).catch(() => [] as PlayerHit[]),
    searchChesscom(q).catch(() => [] as PlayerHit[]),
    searchStudioDatabase(q).catch(() => [] as PlayerHit[]),
  ]);
  const merged: PlayerHit[] = [];
  const seen = new Set<string>();
  for (const hit of [...studio, ...chesscom, ...lichess]) {
    if (seen.has(hit.id)) {
      continue;
    }
    seen.add(hit.id);
    merged.push(hit);
  }
  merged.sort((a, b) => playerRank(a) - playerRank(b));
  return merged.slice(0, 20);
}

function playerRank(hit: PlayerHit): number {
  const titleBoost = hit.title ? 0 : 10;
  const sourceBoost = hit.source === "studio" ? 0 : hit.source === "chesscom" ? 1 : 2;
  return titleBoost + sourceBoost;
}

type LichessGameJson = {
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

function lichessWinner(game: LichessGameJson): PlayerGame["winner"] {
  if (game.winner === "white" || game.winner === "black") {
    return game.winner;
  }
  if (game.status === "draw" || game.status === "stalemate") {
    return "draw";
  }
  return null;
}

async function lichessGames(username: string): Promise<PlayerGame[]> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${MAX_PLAYER_GAMES}&clocks=false&evals=false&opening=true&moves=true`;
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
  const text = await response.text();
  const games: PlayerGame[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const raw = JSON.parse(line) as LichessGameJson;
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

type ChesscomArchiveGame = {
  url?: string;
  pgn?: string;
  end_time?: number;
  time_class?: string;
  eco?: string;
  white?: { username?: string; rating?: number; result?: string };
  black?: { username?: string; rating?: number; result?: string };
};

function chesscomWinner(game: ChesscomArchiveGame): PlayerGame["winner"] {
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
  const monthPayload = (await monthResponse.json()) as { games?: ChesscomArchiveGame[] };
  return monthPayload.games ?? [];
}

function compactChesscomGame(
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

async function chesscomGames(username: string): Promise<PlayerGame[]> {
  const archivesResponse = await fetchTimeout(
    `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`,
    { headers: chesscomHeaders(), next: { revalidate: 300 } },
    GAMES_TIMEOUT_MS,
  );
  if (!archivesResponse.ok) {
    throw new Error("Chess.com archives request failed");
  }
  const archivesPayload = (await archivesResponse.json()) as { archives?: string[] };
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

async function studioGames(username: string): Promise<PlayerGame[]> {
  const book = bookGamesForPlayer(username);
  const supabase = await createServerSupabase();
  if (!supabase) {
    return book;
  }
  const needle = safeQuery(username);
  const { data } = await supabase
    .from("games")
    .select("id, white, black, white_elo, black_elo, event, date, eco, opening, result, pgn")
    .or(`white.ilike.%${needle}%,black.ilike.%${needle}%`)
    .limit(200);
  const seen = new Set(book.map((game) => game.id));
  for (const row of data ?? []) {
    if (seen.has(row.id)) {
      continue;
    }
    const result = row.result ?? "*";
    const winner: PlayerGame["winner"] =
      result === "1-0" ? "white" : result === "0-1" ? "black" : result.includes("1/2") ? "draw" : null;
    const dateValue = row.date ? Date.parse(String(row.date)) : Number.NaN;
    const playedAt = Number.isFinite(dateValue) ? dateValue : null;
    const game: PlayerGame = {
      id: row.id,
      winner,
      whiteName: row.white,
      whiteRating: row.white_elo ?? null,
      blackName: row.black,
      blackRating: row.black_elo ?? null,
      year: playedAt ? new Date(playedAt).getUTCFullYear() : null,
      month: playedAt ? new Date(playedAt).getUTCMonth() + 1 : null,
      event: row.event ?? null,
      eco: row.eco ?? null,
      opening: row.opening ?? null,
      pgn: row.pgn,
      moves: row.pgn ? sanLineFromPgn(row.pgn) : undefined,
      color: "white",
      playerResult: null,
      playedAt,
    };
    const white = row.white.toLowerCase();
    const black = row.black.toLowerCase();
    const target = username.toLowerCase();
    if (white !== target && black !== target && !white.includes(target) && !black.includes(target)) {
      continue;
    }
    const matched = white === target || white.includes(target) ? row.white : row.black;
    seen.add(row.id);
    book.push({
      ...game,
      color: matched.toLowerCase() === white ? "white" : "black",
      playerResult: playerResult(winner, matched.toLowerCase() === white ? "white" : "black"),
    });
  }
  return book;
}

function isSource(value: string): value is PlayerSource {
  return value === "lichess" || value === "chesscom" || value === "studio";
}

export async function loadPlayerGames(
  source: string,
  username: string,
  displayName?: string,
  subtitle?: string,
): Promise<PlayerGamesResponse> {
  if (!isSource(source) || !username.trim()) {
    throw new Error("source and username are required");
  }
  const cacheKey = `${source}:${username.trim().toLowerCase()}`;
  const cached = gamesCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    const player: PlayerHit = {
      ...cached.payload.player,
      displayName: displayName?.trim() || cached.payload.player.displayName,
      subtitle: subtitle?.trim() || cached.payload.player.subtitle,
    };
    return { ...cached.payload, player };
  }
  const player: PlayerHit = {
    id: `${source}:${username}`,
    source,
    username,
    displayName: displayName?.trim() || username,
    subtitle: subtitle?.trim() || (source === "lichess" ? "Lichess" : source === "chesscom" ? "Chess.com" : "Studio"),
  };
  let games: PlayerGame[] = [];
  let truncated = false;
  let notice: string | undefined;
  try {
    if (source === "lichess") {
      games = await lichessGames(username);
      truncated = games.length >= MAX_PLAYER_GAMES;
      notice = truncated ? `Showing the ${MAX_PLAYER_GAMES} most recent Lichess games.` : undefined;
    } else if (source === "chesscom") {
      games = await chesscomGames(username);
      truncated = games.length >= MAX_PLAYER_GAMES;
      notice = truncated
        ? `Showing the ${MAX_PLAYER_GAMES} most recent Chess.com games.`
        : undefined;
    } else {
      games = await studioGames(username);
    }
  } catch (error) {
    console.error("loadPlayerGames failed", { source, username, error });
    notice = "Could not load games.";
  }
  games.sort((a, b) => (b.playedAt ?? 0) - (a.playedAt ?? 0));
  const payload: PlayerGamesResponse = { player, games, truncated, notice };
  if (!notice || truncated) {
    gamesCache.set(cacheKey, { expires: Date.now() + GAMES_CACHE_TTL_MS, payload });
  }
  return payload;
}
