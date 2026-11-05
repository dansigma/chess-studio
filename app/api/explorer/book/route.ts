// SIG-1225: opening-book lookup for Game Review, one request per review.
// Walks the game through the Lichess games explorer (strong players, slower
// speeds; see BOOK_RULE) on the server with the server's token, sequentially,
// and stops at the first move that is not theory. Positions are cached in
// `explorer_cache` under their own `source` (bookCacheSource), so they never
// collide with the masters/lichess entries of /api/explorer; like that route,
// reads use the public client and writes the service client (SIG-839).
import { NextRequest, NextResponse } from "next/server";
import { BOOK_RULE, bookCacheSource, type BookPosition } from "@/src/chess/opening-theory";
import { fetchBookPosition } from "@/src/lib/book-upstream";
import { standardFens, walkBook } from "@/src/lib/book-walk";
import { createLruCache } from "@/src/lib/lru";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { tooManyRequests } from "@/src/lib/rate-limit-response";
import { readCapped } from "@/src/lib/read-capped";
import { createServiceSupabase } from "@/src/lib/supabase/admin";
import { toJson } from "@/src/lib/supabase/database.types";
import { createPublicServerSupabase } from "@/src/lib/supabase/server";

/** Total time for one request; on the cap the walk returns what it has (`partial`). */
export const BOOK_BUDGET_MS = 8000;
const MAX_BODY_BYTES = 4096;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

const limiter = createRouteLimiter({ limit: 20, windowMs: 60_000, bindingName: "RL_60_MIN" });
const memory = createLruCache<string, BookPosition>(2000);

export function _resetBookStateForTest() {
  memory.clear();
}

function isBookPosition(value: unknown): value is BookPosition {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { total?: unknown; moves?: unknown };
  return (
    typeof record.total === "number" &&
    Array.isArray(record.moves) &&
    record.moves.every(
      (move) =>
        typeof move === "object" &&
        move !== null &&
        typeof (move as { uci?: unknown }).uci === "string" &&
        typeof (move as { games?: unknown }).games === "number",
    )
  );
}

async function getPosition(fen: string, remainingMs: number): Promise<BookPosition | null> {
  const hot = memory.get(fen);
  if (hot) {
    return hot;
  }
  const source = bookCacheSource();
  try {
    const { data } = (await createPublicServerSupabase()
      ?.from("explorer_cache")
      .select("payload, fetched_at")
      .eq("source", source)
      .eq("fen", fen)
      .maybeSingle()) ?? { data: null };
    if (data?.payload && isBookPosition(data.payload)) {
      memory.set(fen, data.payload);
      return data.payload;
    }
  } catch {
    // A cache read failure just means a live lookup.
  }
  const live = await fetchBookPosition(fen, remainingMs);
  if (!live) {
    return null;
  }
  memory.set(fen, live);
  const service = createServiceSupabase();
  if (service) {
    try {
      const { error } = await service.from("explorer_cache").upsert({
        source,
        fen,
        payload: toJson(live),
        fetched_at: new Date().toISOString(),
      });
      if (error) {
        console.error("[explorer-book] cache write failed", { code: (error as { code?: unknown })?.code ?? "unknown" });
      }
    } catch (error) {
      console.error("[explorer-book] cache write failed", { code: (error as { code?: unknown })?.code ?? "unknown" });
    }
  }
  return live;
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  const verdict = await limiter.checkAsync(rateLimitKey("explorer-book", ip));
  if (!verdict.ok) {
    return tooManyRequests(verdict);
  }
  let moves: unknown;
  try {
    moves = (JSON.parse(await readCapped(request, MAX_BODY_BYTES)) as { moves?: unknown }).moves;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (
    !Array.isArray(moves) ||
    moves.length === 0 ||
    moves.length > BOOK_RULE.maxPlies ||
    !moves.every((move) => typeof move === "string" && UCI.test(move))
  ) {
    return NextResponse.json({ error: `moves must be 1-${BOOK_RULE.maxPlies} UCI moves` }, { status: 400 });
  }
  const ucis = moves as string[];
  const fens = standardFens(ucis);
  if (!fens) {
    return NextResponse.json({ error: "moves are not legal from the standard start position" }, { status: 400 });
  }
  const result = await walkBook(ucis, fens, getPosition, { budgetMs: BOOK_BUDGET_MS });
  // Nothing here depends on the user, but the walk is cheap to repeat from the cache: no HTTP caching.
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
