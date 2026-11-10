// SIG-1275: backfill of the My Games position index. Indexes one batch of the
// signed-in user's unindexed games per call; the Library calls it repeatedly
// until `remaining` is 0 ("Indexing your games…"). Reads use the user session
// (RLS), writes use the service client. Rate limited like the sync route.
import { NextRequest, NextResponse } from "next/server";
import { indexMyGames } from "@/src/lib/my-games/position-index";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { createServiceSupabase } from "@/src/lib/supabase/admin";
import { createServerSupabase } from "@/src/lib/supabase/server";

export const INDEX_BATCH_SIZE = 25;

// 3,000 games / 25 per batch = 120 calls, so the quota leaves room for a full
// backfill plus retries: 240/hour per user, 600/hour per IP.
const userLimiter = createRouteLimiter({ limit: 240, windowMs: 60 * 60 * 1000, bindingName: "RL_AUTH" });
const ipLimiter = createRouteLimiter({ limit: 600, windowMs: 60 * 60 * 1000, bindingName: "RL_30_MIN" });

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Indexing is unavailable right now." }, { status: 503 });
  }
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return NextResponse.json({ error: "Sign in to index games." }, { status: 401 });
  }

  const userVerdict = await userLimiter.checkAsync(rateLimitKey("my-games-index", user.id));
  const ipVerdict = await ipLimiter.checkAsync(rateLimitKey("my-games-index-ip", clientIp(request.headers)));
  const denied = !userVerdict.ok ? userVerdict : !ipVerdict.ok ? ipVerdict : null;
  if (denied) {
    return NextResponse.json(
      { error: "Too many indexing requests — try again later." },
      { status: 429, headers: { "Retry-After": String(denied.retryAfterSeconds) } },
    );
  }

  const service = createServiceSupabase();
  if (!service) {
    return NextResponse.json({ error: "Indexing is unavailable right now." }, { status: 503 });
  }

  const { data: pending, error } = await supabase
    .from("my_games")
    .select("id, pgn")
    .eq("user_id", user.id)
    .is("indexed_at", null)
    .order("created_at", { ascending: true })
    .limit(INDEX_BATCH_SIZE);
  if (error) {
    console.error("my-games index select failed", { error });
    return NextResponse.json({ error: "Could not load games to index." }, { status: 502 });
  }

  const result = await indexMyGames(service, user.id, pending ?? []);

  const { count } = await supabase
    .from("my_games")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("indexed_at", null);
  return NextResponse.json({
    indexed: result.indexed,
    failed: result.failed,
    remaining: count ?? null,
  });
}
