import { NextRequest, NextResponse } from "next/server";
import { createLruCache } from "@/src/lib/lru";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { tooManyRequests } from "@/src/lib/rate-limit-response";
import { UA } from "@/src/lib/players/shared";

/**
 * SIG-1496: same-origin proxy for Lichess broadcast standings.
 *
 * `https://lichess.org/broadcast/{tourId}/players` is documented in the Lichess API, but it lives outside
 * `/api`, and Lichess only sends CORS headers there for `localhost` origins. A browser on the production
 * site cannot read it, so Live fetches standings through this route. The body is passed through unchanged
 * (the client maps it with `mapTourPlayers`) and cached per tour, so viewers of one tour share one upstream
 * request per minute.
 */

const LICHESS_PLAYERS_URL = (tourId: string) => `https://lichess.org/broadcast/${tourId}/players`;
const CACHE_TTL_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2_000_000;
const TOUR_ID = /^[A-Za-z0-9]{8}$/;

const cache = createLruCache<string, { body: string; fetchedAt: number }>(200);
const inFlight = new Map<string, Promise<string | number>>();
const limiter = createRouteLimiter({ limit: 60, windowMs: 60_000, bindingName: "RL_60_MIN" });

export function _resetLiveStandingsForTest(): void {
  cache.clear();
  inFlight.clear();
}

/** The upstream JSON text, or the HTTP status to report when Lichess did not answer with JSON. */
async function fetchUpstream(tourId: string): Promise<string | number> {
  try {
    const response = await fetch(LICHESS_PLAYERS_URL(tourId), {
      // Lichess answers 403 to requests without a User-Agent (the Workers runtime sends none).
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      // Lichess' 404 means an unknown tour; any other failure is ours to report as a bad gateway.
      return response.status === 404 ? 404 : response.status === 429 ? 429 : 502;
    }
    const text = await response.text();
    if (text.length > MAX_BODY_BYTES || !Array.isArray(JSON.parse(text))) {
      return 502;
    }
    return text;
  } catch {
    return 502;
  }
}

function json(body: string, maxAge: number): NextResponse {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    },
  });
}

export async function GET(request: NextRequest) {
  const tourId = request.nextUrl.searchParams.get("tour");
  if (!tourId || !TOUR_ID.test(tourId)) {
    return NextResponse.json({ error: "tour must be a Lichess broadcast id" }, { status: 400 });
  }

  const cached = cache.get(tourId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return json(cached.body, Math.max(1, Math.round((CACHE_TTL_MS - (Date.now() - cached.fetchedAt)) / 1000)));
  }

  const verdict = await limiter.checkAsync(rateLimitKey("live-standings", clientIp(request.headers)));
  if (!verdict.ok) {
    return tooManyRequests(verdict);
  }

  let pending = inFlight.get(tourId);
  if (!pending) {
    pending = fetchUpstream(tourId).finally(() => inFlight.delete(tourId));
    inFlight.set(tourId, pending);
  }
  const result = await pending;
  if (typeof result === "number") {
    // A stale copy beats an error while Lichess is unavailable.
    if (cached && result !== 404) {
      return json(cached.body, 10);
    }
    return NextResponse.json({ error: "standings unavailable" }, { status: result });
  }
  cache.set(tourId, { body: result, fetchedAt: Date.now() });
  return json(result, CACHE_TTL_MS / 1000);
}
