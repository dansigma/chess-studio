import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/src/lib/supabase/server";
import type { Json } from "@/src/lib/supabase/database.types";
import type {
  CloudExplorerSource,
  ExplorerGameRow,
  ExplorerMoveRow,
  ExplorerResponse,
} from "@/src/lib/explorer-types";
import { filtersAreDefault, filtersFromSearchParams, lichessFilterQuery } from "@/src/lib/explorer-filters";
import { emptyExplorer, lookupOpeningBook } from "@/src/lib/opening-book";
import { lookupOpeningIndex } from "@/src/lib/opening-index";

const memoryCache = new Map<string, { payload: ExplorerResponse; fetchedAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

type LichessPlayer = {
  name?: string;
  rating?: number;
};

type LichessGame = {
  id?: string;
  winner?: string | null;
  white?: LichessPlayer;
  black?: LichessPlayer;
  year?: number;
  month?: number;
};

type LichessMove = {
  san?: string;
  uci?: string;
  white?: number;
  draws?: number;
  black?: number;
  averageRating?: number;
};

type LichessExplorer = {
  white?: number;
  draws?: number;
  black?: number;
  opening?: { eco?: string; name?: string } | null;
  moves?: LichessMove[];
  topGames?: LichessGame[];
  recentGames?: LichessGame[];
};

function isSource(value: string | null): value is "masters" | "lichess" {
  return value === "masters" || value === "lichess";
}

function cacheKey(source: CloudExplorerSource, fen: string): string {
  return `${source}|${fen}`;
}

function lichessToken(): string | undefined {
  return process.env.LICHESS_TOKEN ?? process.env.LICHESS_API_TOKEN;
}

function mapGame(
  game: LichessGame,
  opening: ExplorerResponse["opening"],
): ExplorerGameRow {
  const winner =
    game.winner === "white" || game.winner === "black"
      ? game.winner
      : game.winner === "draw"
        ? "draw"
        : null;
  return {
    id: game.id ?? "",
    winner,
    whiteName: game.white?.name ?? "Unknown",
    whiteRating: game.white?.rating ?? null,
    blackName: game.black?.name ?? "Unknown",
    blackRating: game.black?.rating ?? null,
    year: game.year ?? null,
    month: game.month ?? null,
    event: game.year ? String(game.year) : null,
    eco: opening?.eco ?? null,
    opening: opening?.name ?? null,
  };
}

function mapResponse(
  source: CloudExplorerSource,
  fen: string,
  data: LichessExplorer,
): ExplorerResponse {
  const opening =
    data.opening?.eco || data.opening?.name
      ? { eco: data.opening.eco ?? "", name: data.opening.name ?? "" }
      : null;
  const moves: ExplorerMoveRow[] = (data.moves ?? [])
    .filter((move) => move.san && move.uci)
    .map((move) => ({
      san: move.san as string,
      uci: move.uci as string,
      white: move.white ?? 0,
      draws: move.draws ?? 0,
      black: move.black ?? 0,
      games: (move.white ?? 0) + (move.draws ?? 0) + (move.black ?? 0),
      averageRating: move.averageRating ?? null,
    }));
  const games = [...(data.topGames ?? []), ...(data.recentGames ?? [])]
    .filter((game) => game.id)
    .map((game) => mapGame(game, opening));
  const unique = new Map<string, ExplorerGameRow>();
  for (const game of games) {
    unique.set(game.id, game);
  }
  return {
    source,
    fen,
    white: data.white ?? 0,
    draws: data.draws ?? 0,
    black: data.black ?? 0,
    opening,
    moves,
    games: [...unique.values()],
  };
}

async function fetchLichess(
  source: "masters" | "lichess",
  fen: string,
  filterQuery: string,
): Promise<ExplorerResponse | null> {
  const token = lichessToken();
  const endpoints =
    source === "masters"
      ? [
          `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&source=opening${filterQuery}`,
          `https://explorer.lichess.org/masters?fen=${encodeURIComponent(fen)}&source=opening${filterQuery}`,
        ]
      : [
          `https://explorer.lichess.ovh/lichess?variant=standard&fen=${encodeURIComponent(fen)}&source=opening${filterQuery}`,
          `https://explorer.lichess.org/lichess?variant=standard&fen=${encodeURIComponent(fen)}&source=opening${filterQuery}`,
        ];
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "StudioClone/0.1 (chess analysis)",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const raw = (await response.json()) as LichessExplorer;
        return mapResponse(source, fen, raw);
      }
    } catch {
      // try the fallback host
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const fen = request.nextUrl.searchParams.get("fen");
  const sourceParam = request.nextUrl.searchParams.get("source");
  if (!fen || !isSource(sourceParam)) {
    return NextResponse.json(
      { error: "fen and source=masters|lichess are required" },
      { status: 400 },
    );
  }

  const filters = filtersFromSearchParams(request.nextUrl.searchParams);
  const filtered = !filtersAreDefault(filters);
  const filterQuery = lichessFilterQuery(sourceParam, filters);
  const key = filtered ? `${cacheKey(sourceParam, fen)}|${filterQuery}` : cacheKey(sourceParam, fen);
  const memory = memoryCache.get(key);
  if (memory && Date.now() - memory.fetchedAt < CACHE_TTL_MS && !memory.payload.notice) {
    return NextResponse.json(memory.payload);
  }

  const supabase = await createServerSupabase();
  if (supabase && !filtered) {
    const { data } = await supabase
      .from("explorer_cache")
      .select("payload, fetched_at")
      .eq("source", sourceParam)
      .eq("fen", fen)
      .maybeSingle();
    if (data?.payload && typeof data.payload === "object") {
      const payload = data.payload as unknown as ExplorerResponse;
      if (!payload.notice) {
        memoryCache.set(key, { payload, fetchedAt: Date.now() });
        return NextResponse.json(payload);
      }
    }
  }

  if (sourceParam === "masters" && !filtered) {
    const local = lookupOpeningIndex(fen);
    if (local && local.moves.length > 0) {
      memoryCache.set(key, { payload: local, fetchedAt: Date.now() });
      return NextResponse.json(local);
    }
  }

  const token = lichessToken();
  const live = await fetchLichess(sourceParam, fen, filterQuery);
  const payload =
    live ??
    (!token && filtered
      ? emptyExplorer(sourceParam, fen, "Set LICHESS_TOKEN to filter live Lichess stats.")
      : null) ??
    (filtered ? emptyExplorer(sourceParam, fen, "No games match these filters.") : null) ??
    lookupOpeningBook(sourceParam, fen) ??
    emptyExplorer(
      sourceParam,
      fen,
      token
        ? "No games for this position in the sample book or Lichess explorer."
        : "No games for this position. Set LICHESS_TOKEN for live Lichess explorer stats.",
    );

  memoryCache.set(key, { payload, fetchedAt: Date.now() });

  if (supabase && !filtered && !payload.notice) {
    await supabase.from("explorer_cache").upsert({
      source: sourceParam,
      fen,
      payload: payload as unknown as Json,
      fetched_at: new Date().toISOString(),
    });
  }

  return NextResponse.json(payload);
}
