import { NextRequest, NextResponse } from "next/server";
import { createPublicServerSupabase } from "@/src/lib/supabase/server";
import { createServiceSupabase } from "@/src/lib/supabase/admin";
import { toJson } from "@/src/lib/supabase/database.types";
import {
  isExplorerResponse,
  type CloudExplorerSource,
  type ExplorerResponse,
} from "@/src/lib/explorer-types";
import { filtersAreDefault, filtersFromSearchParams, lichessFilterQuery } from "@/src/lib/explorer-filters";
import { emptyExplorer, lookupOpeningBook } from "@/src/lib/opening-book";
import { lookupCuratedIndex } from "@/src/lib/offline-explorer";
import { lookupOpeningIndex } from "@/src/lib/opening-index";
import { createLruCache } from "@/src/lib/lru";
import { isExplorerFen } from "@/src/lib/request-validation";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { tooManyRequests } from "@/src/lib/rate-limit-response";
import { lichessToken } from "@/src/lib/players/shared";
import { _resetExplorerUpstreamForTest, fetchExplorerUpstream } from "@/src/lib/explorer-upstream.ts";

const memoryCache = createLruCache<string, { payload: ExplorerResponse; fetchedAt: number }>(500);
const limiter = createRouteLimiter({ limit: 60, windowMs: 60_000, bindingName: "RL_60_MIN" });
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const FALLBACK_CACHE_TTL_MS = 1000 * 60 * 2;

export function _resetExplorerStateForTest() {
  memoryCache.clear();
  _resetExplorerUpstreamForTest();
}

function isSource(value: string | null): value is "masters" | "lichess" | "curated" {
  return value === "masters" || value === "lichess" || value === "curated";
}

function cacheKey(source: CloudExplorerSource, fen: string): string {
  return `${source}|${fen}`;
}

/**
 * Cache-Control for explorer successes. Payloads are public (position data
 * does not depend on the user); `notice`/filtered payloads are fallbacks and
 * cache only briefly; curated index output is effectively immutable.
 */
function explorerCacheHeaders(payload: ExplorerResponse, filtered: boolean): string {
  if (payload.source === "curated") {
    return "public, max-age=3600";
  }
  if (filtered || payload.notice) {
    return "public, max-age=30, s-maxage=60";
  }
  return "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
}

function cachedJson(payload: ExplorerResponse, filtered: boolean) {
  return NextResponse.json(payload, {
    headers: { "Cache-Control": explorerCacheHeaders(payload, filtered) },
  });
}

export async function GET(request: NextRequest) {
  const fen = request.nextUrl.searchParams.get("fen");
  const sourceParam = request.nextUrl.searchParams.get("source");
  if (!fen || !isSource(sourceParam)) {
    return NextResponse.json(
      { error: "fen and source=masters|lichess|curated are required" },
      { status: 400 },
    );
  }
  if (!isExplorerFen(fen)) {
    return NextResponse.json({ error: "fen is not a valid position" }, { status: 400 });
  }

  const ip = clientIp(request.headers);
  const verdict = await limiter.checkAsync(rateLimitKey("explorer", ip));
  if (!verdict.ok) {
    return tooManyRequests(verdict);
  }

  const filters = filtersFromSearchParams(request.nextUrl.searchParams);
  const filtered = !filtersAreDefault(filters);

  if (sourceParam === "curated") {
    const payload = lookupCuratedIndex(fen, filters, lookupOpeningIndex);
    return cachedJson(payload, filtered);
  }

  const filterQuery = lichessFilterQuery(sourceParam, filters);
  const key = filtered ? `${cacheKey(sourceParam, fen)}|${filterQuery}` : cacheKey(sourceParam, fen);
  const memory = memoryCache.get(key);
  if (memory) {
    const ttl = memory.payload.notice ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS;
    if (Date.now() - memory.fetchedAt < ttl) {
      return cachedJson(memory.payload, filtered);
    }
  }

  // Cookie-free read: explorer_cache is publicly selectable (anon, SIG-839),
  // so the shared cache needs no session — no cookies() in this path, and no
  // Set-Cookie / Vary: Cookie on the responses below.
  const supabase = createPublicServerSupabase();
  if (supabase && !filtered) {
    const { data } = await supabase
      .from("explorer_cache")
      .select("payload, fetched_at")
      .eq("source", sourceParam)
      .eq("fen", fen)
      .maybeSingle();
    if (data?.payload && typeof data.payload === "object" && isExplorerResponse(data.payload)) {
      const payload = data.payload;
      if (!payload.notice) {
        memoryCache.set(key, { payload, fetchedAt: Date.now() });
        return cachedJson(payload, filtered);
      }
    }
  }

  if (sourceParam === "masters" && !filtered) {
    const local = lookupOpeningIndex(fen);
    if (local && local.moves.length > 0) {
      memoryCache.set(key, { payload: local, fetchedAt: Date.now() });
      return cachedJson(local, filtered);
    }
  }

  const token = lichessToken();
  const live = await fetchExplorerUpstream(sourceParam, fen, filterQuery);
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

  const service = filtered || payload.notice ? null : createServiceSupabase();
  if (service) {
    try {
      const { error } = await service.from("explorer_cache").upsert({
        source: sourceParam,
        fen,
        payload: toJson(payload satisfies ExplorerResponse),
        fetched_at: new Date().toISOString(),
      });
      if (error) {
        console.error("[explorer] cache write failed", {
          code: (error as { code?: unknown })?.code ?? "unknown",
        });
      }
    } catch (error) {
      console.error("[explorer] cache write failed", {
        code: (error as { code?: unknown })?.code ?? "unknown",
      });
    }
  }

  return cachedJson(payload, filtered);
}
