import { sanLineFromPgn } from "@/src/chess/pgn-clean";
import { bookGamesForPlayer, searchBookPlayers } from "@/src/lib/opening-book";
import type { PlayerGame, PlayerHit } from "@/src/lib/player-types";
import { createServerSupabase } from "@/src/lib/supabase/server";
import { playerResult, safeQuery } from "./shared";

export async function searchStudioDatabase(query: string): Promise<PlayerHit[]> {
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
    .eq("pending", false)
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

export async function studioGames(username: string): Promise<PlayerGame[]> {
  const book = bookGamesForPlayer(username);
  const supabase = await createServerSupabase();
  if (!supabase) {
    return book;
  }
  const needle = safeQuery(username);
  const { data } = await supabase
    .from("games")
    .select("id, white, black, white_elo, black_elo, event, date, eco, opening, result, pgn")
    .eq("pending", false)
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
