// My Games adapter: server-side search, filters, sort and pagination on
// `public.my_games`. Position search joins `my_game_positions` (SIG-1275);
// annotations are not supported (these games carry clock comments only).
import type { SupabaseClient } from "@supabase/supabase-js";
import { positionKey } from "@/src/chess/zobrist";
import { formatTimeClass } from "@/src/lib/game-date";
import type { Database } from "@/src/lib/supabase/database.types";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { searchTokens } from "./filters";
import type {
  LibraryFilterState,
  LibraryGameItem,
  LibraryPage,
  LibraryResult,
  LibrarySortKey,
  LibrarySourceAdapter,
  LibrarySourceCapabilities,
} from "./types";

type Row = Pick<
  Database["public"]["Tables"]["my_games"]["Row"],
  | "id" | "source" | "played_at" | "color" | "result" | "time_class" | "white" | "black"
  | "white_elo" | "black_elo" | "eco" | "opening" | "ply_count"
>;

const COLUMNS =
  "id, source, played_at, color, result, time_class, white, black, white_elo, black_elo, eco, opening, ply_count";

const CAPABILITIES: LibrarySourceCapabilities = {
  textSearch: "full",
  color: "full",
  result: "full",
  annotations: "none", // clock comments only
  // Games not indexed yet do not match until the backfill reaches them.
  position: "full",
  sort: "full",
  maxResults: null,
};

// `result` sorts by the account owner's outcome (the column), not White's.
const SORT_COLUMN: Record<LibrarySortKey, string> = {
  white: "white",
  whiteElo: "white_elo",
  black: "black",
  blackElo: "black_elo",
  result: "result",
  eco: "eco",
  plyCount: "ply_count",
  event: "time_class",
  date: "played_at",
};

/** `%text%` with LIKE wildcards in `text` escaped. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Quotes a LIKE pattern for use inside a PostgREST `or()` filter. */
export function ilikeValue(text: string): string {
  return `"${likePattern(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function playerResult(row: Pick<Row, "color" | "result">): LibraryResult {
  const color = row.color ?? "white";
  if (row.result === "draw") {
    return "1/2-1/2";
  }
  if (row.result === "win") {
    return color === "white" ? "1-0" : "0-1";
  }
  if (row.result === "loss") {
    return color === "white" ? "0-1" : "1-0";
  }
  return "*";
}

export function myGamesRowToItem(row: Row): LibraryGameItem {
  const platform = row.source === "chesscom" ? "Chess.com" : "Lichess";
  const timeClass = formatTimeClass(row.time_class);
  return {
    key: `my-games:${row.id}`,
    sourceId: "my-games",
    gameId: row.id,
    white: row.white ?? "?",
    whiteElo: row.white_elo,
    black: row.black ?? "?",
    blackElo: row.black_elo,
    result: playerResult(row),
    eco: row.eco,
    opening: row.opening,
    plyCount: row.ply_count && row.ply_count > 0 ? row.ply_count : null,
    event: timeClass ? `${platform} · ${timeClass}` : platform,
    date: row.played_at ? row.played_at.slice(0, 10) : null,
  };
}

/** The `my_game_positions.zkey` value for a FEN, as postgrest-js sends bigints. */
export function myGamesPositionKey(fen: string): string {
  try {
    return positionKey(fen).toString();
  } catch {
    throw new Error("Invalid position");
  }
}

export function createMyGamesSource(
  getClient: () => SupabaseClient<Database> | null = createBrowserSupabase,
): LibrarySourceAdapter {
  const need = (): SupabaseClient<Database> => {
    const client = getClient();
    if (!client) {
      throw new Error("Supabase is not configured");
    }
    return client;
  };
  return {
    id: "my-games",
    label: (locale) => (locale.toLowerCase().startsWith("pt") ? "Minhas partidas" : "My Games"),
    capabilities: () => CAPABILITIES,
    async list(filters: LibraryFilterState, cursor, limit, signal): Promise<LibraryPage> {
      const offset = Math.max(0, Number(cursor ?? 0) || 0);
      const zkey = filters.position ? myGamesPositionKey(filters.position.fen) : null;
      // `!inner` keeps only games with a matching position row; PostgREST returns
      // each game once even when it reaches the position more than once.
      let q = need()
        .from("my_games")
        .select(zkey ? `${COLUMNS}, my_game_positions!inner(game_id)` : COLUMNS, { count: "exact" });
      if (zkey) {
        q = q.eq("my_game_positions.zkey", zkey);
      }
      for (const token of searchTokens(filters.query)) {
        const v = ilikeValue(token);
        q = q.or(
          `white.ilike.${v},black.ilike.${v},opening.ilike.${v},eco.ilike.${v},time_class.ilike.${v}`,
        );
      }
      const opponent = filters.opponent.trim();
      if (opponent) {
        const v = ilikeValue(opponent);
        q =
          filters.color === "white"
            ? q.ilike("black", likePattern(opponent))
            : filters.color === "black"
              ? q.ilike("white", likePattern(opponent))
              : q.or(`white.ilike.${v},black.ilike.${v}`);
      }
      if (filters.color !== "both") {
        q = q.eq("color", filters.color);
      }
      if (filters.result === "draw") {
        q = q.eq("result", "draw");
      } else if (filters.result !== "all") {
        const [winner, loser] = filters.result === "1-0" ? ["white", "black"] : ["black", "white"];
        q = q.or(
          `and(color.eq.${winner},result.eq.win),and(color.eq.${loser},result.eq.loss)`,
        );
      }
      const { key, direction } = filters.sort;
      const { data, error, count } = await q
        .order(SORT_COLUMN[key], { ascending: direction === "asc", nullsFirst: false })
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1)
        .abortSignal(signal);
      if (error) {
        throw new Error(error.message || "Query failed");
      }
      const items = ((data ?? []) as unknown as Row[]).map(myGamesRowToItem);
      const next = offset + items.length;
      const total = typeof count === "number" ? count : null;
      const more = total === null ? items.length === limit : next < total;
      return { items, nextCursor: more ? String(next) : null, total };
    },
    async loadPgn(gameId, signal) {
      const { data, error } = await need()
        .from("my_games")
        .select("pgn")
        .eq("id", gameId)
        .abortSignal(signal)
        .single();
      if (error || !data) {
        throw new Error(error?.message || "Game not found");
      }
      return data.pgn;
    },
  };
}
