import { createLruCache } from "@/src/lib/lru";
import type { PlayerGame, PlayerGamesResponse, PlayerHit, PlayerSource } from "@/src/lib/player-types";
import { chesscomGames, searchChesscom } from "./players/chesscom";
import { lichessGames, searchLichess } from "./players/lichess";
import { GAMES_CACHE_TTL_MS, MAX_PLAYER_GAMES, isSource } from "./players/shared";
import { searchStudioDatabase, studioGames } from "./players/studio";

export { searchFidePlayers } from "./players/fide";
export { NoPublicGamesError } from "./players/shared";

const gamesCache = createLruCache<string, { expires: number; payload: PlayerGamesResponse }>(200);

export type SearchPlayersResult = { players: PlayerHit[]; failedSources: PlayerSource[] };

export const SEARCH_SOURCES = ["lichess", "chesscom", "studio"] as const satisfies readonly PlayerSource[];

export async function searchPlayers(query: string): Promise<SearchPlayersResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { players: [], failedSources: [] };
  }
  const [lichess, chesscom, studio] = await Promise.all([
    searchLichess(q).then(
      (hits) => ({ hits, failed: null as PlayerSource | null }),
      (): { hits: PlayerHit[]; failed: PlayerSource | null } => ({ hits: [], failed: "lichess" }),
    ),
    searchChesscom(q).then(
      (hits) => ({ hits, failed: null as PlayerSource | null }),
      (): { hits: PlayerHit[]; failed: PlayerSource | null } => ({ hits: [], failed: "chesscom" }),
    ),
    searchStudioDatabase(q).then(
      (hits) => ({ hits, failed: null as PlayerSource | null }),
      (): { hits: PlayerHit[]; failed: PlayerSource | null } => ({ hits: [], failed: "studio" }),
    ),
  ]);
  const failedSources: PlayerSource[] = [lichess.failed, chesscom.failed, studio.failed].filter(
    (source): source is PlayerSource => source !== null,
  );
  const merged: PlayerHit[] = [];
  const seen = new Set<string>();
  for (const hit of [...studio.hits, ...chesscom.hits, ...lichess.hits]) {
    if (seen.has(hit.id)) {
      continue;
    }
    seen.add(hit.id);
    merged.push(hit);
  }
  merged.sort((a, b) => playerRank(a) - playerRank(b));
  return { players: merged.slice(0, 20), failedSources };
}

function playerRank(hit: PlayerHit): number {
  const titleBoost = hit.title ? 0 : 10;
  const sourceBoost = hit.source === "studio" ? 0 : hit.source === "chesscom" ? 1 : 2;
  return titleBoost + sourceBoost;
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
  // SIG-1029: studio results depend on the caller's session (RLS exposes their
  // private games), so they must never enter the process-wide cache.
  const cacheable = source !== "studio";
  const cacheKey = `${source}:${username.trim().toLowerCase()}`;
  const cached = cacheable ? gamesCache.get(cacheKey) : undefined;
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
    throw error;
  }
  games.sort((a, b) => (b.playedAt ?? 0) - (a.playedAt ?? 0));
  // Lichess/Chess.com fetchers stop at MAX_PLAYER_GAMES, so reaching it means
  // there may be more (>=). Studio fetches more rows than the cap, so exactly
  // MAX_PLAYER_GAMES is a complete list and only a longer one is truncated (>).
  if (source === "studio" && games.length > MAX_PLAYER_GAMES) {
    games = games.slice(0, MAX_PLAYER_GAMES);
    truncated = true;
    notice = `Showing the ${MAX_PLAYER_GAMES} most recent Studio games.`;
  }
  const payload: PlayerGamesResponse = { player, games, truncated, notice };
  // Studio never caches (see `cacheable`). For the other sources, only a
  // truncation notice may be cached; any other notice is kept out of the cache.
  if (cacheable && (!notice || truncated)) {
    gamesCache.set(cacheKey, { expires: Date.now() + GAMES_CACHE_TTL_MS, payload });
  }
  return payload;
}
