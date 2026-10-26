import { NextRequest, NextResponse } from "next/server";
import { searchPlayers } from "@/src/lib/players-server";
import type { PlayerHit } from "@/src/lib/player-types";
import { createLruCache } from "@/src/lib/lru";
import { isSearchQuery } from "@/src/lib/request-validation";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";

export const dynamic = "force-dynamic";

const limiter = createRouteLimiter({ limit: 60, windowMs: 60_000, bindingName: "RL_60_MIN" });

const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_SOURCE_COUNT = 3;

type SearchCacheEntry = { expires: number; payload: { players: PlayerHit[]; partial: boolean } };

const searchCache = createLruCache<string, SearchCacheEntry>(200);

export function __clearSearchCacheForTests(): void {
  searchCache.clear();
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!isSearchQuery(query)) {
    return NextResponse.json({ error: "A search query of 2 to 40 characters is required" }, { status: 400 });
  }
  const ip = clientIp(request.headers);
  const verdict = await limiter.checkAsync(rateLimitKey("search", ip));
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many requests — try again shortly." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }
  const cacheKey = query.trim().toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.payload);
  }
  try {
    const { players, failedSources } = await searchPlayers(query);
    if (failedSources.length >= SEARCH_SOURCE_COUNT) {
      return NextResponse.json({ error: "Player search is temporarily unavailable" }, { status: 502 });
    }
    const payload = { players, partial: failedSources.length > 0 };
    searchCache.set(cacheKey, { expires: Date.now() + SEARCH_CACHE_TTL_MS, payload });
    return NextResponse.json(payload);
  } catch (error) {
    console.error("searchPlayers route failed", { query, error });
    return NextResponse.json({ players: [] });
  }
}
