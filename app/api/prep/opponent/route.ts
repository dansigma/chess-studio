// SIG-1100: opponent opening profile from their last public games (Insights 3/4).
// Public data only — no session, no `createServerSupabase` in this path.
import { NextRequest, NextResponse } from "next/server";
import { loadPlayerGames } from "@/src/lib/players-server";
import { buildOpponentProfile } from "@/src/lib/prep/opponent-profile";
import { isPlayerUsername } from "@/src/lib/request-validation";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { tooManyRequests } from "@/src/lib/rate-limit-response";

const limiter = createRouteLimiter({ limit: 20, windowMs: 60_000, bindingName: "RL_30_MIN" });

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") ?? "";
  const username = (request.nextUrl.searchParams.get("username") ?? "").trim();
  const validSource = source === "lichess" || source === "chesscom";
  if (!validSource || !isPlayerUsername(username)) {
    return NextResponse.json({ error: "source and a valid username are required" }, { status: 400 });
  }
  const ip = clientIp(request.headers);
  const verdict = await limiter.checkAsync(rateLimitKey("prep-opponent", ip));
  if (!verdict.ok) {
    return tooManyRequests(verdict);
  }
  let games: Awaited<ReturnType<typeof loadPlayerGames>>["games"];
  try {
    ({ games } = await loadPlayerGames(source, username));
  } catch (error) {
    console.error("prep opponent route failed", { source, username, error });
    return NextResponse.json({ error: "Could not load games" }, { status: 502 });
  }
  if (games.length === 0) {
    return NextResponse.json({ error: "No public games found for this account" }, { status: 404 });
  }
  return NextResponse.json(buildOpponentProfile(games), {
    headers: { "Cache-Control": "public, max-age=120" },
  });
}
