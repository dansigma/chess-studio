import { NextRequest, NextResponse } from "next/server";
import { loadPlayerGames } from "@/src/lib/players-server";
import { isPlayerUsername, isStudioPlayerName } from "@/src/lib/request-validation";
import { clientIp, createRateLimiter } from "@/src/lib/rate-limit";

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") ?? "";
  const username = (request.nextUrl.searchParams.get("username") ?? "").trim();
  const displayName = request.nextUrl.searchParams.get("displayName") ?? undefined;
  const subtitle = request.nextUrl.searchParams.get("subtitle") ?? undefined;
  const validSource = source === "lichess" || source === "chesscom" || source === "studio";
  const usernameOk = source === "studio" ? isStudioPlayerName(username) : isPlayerUsername(username);
  if (!validSource || !usernameOk) {
    return NextResponse.json({ error: "source and a valid username are required" }, { status: 400 });
  }
  const ip = clientIp(request.headers);
  if (ip !== "unknown") {
    const verdict = limiter.check(`games:${ip}`);
    if (!verdict.ok) {
      return NextResponse.json(
        { error: "Too many requests — try again shortly." },
        { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
      );
    }
  }
  try {
    const payload = await loadPlayerGames(source, username, displayName, subtitle);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    console.error("loadPlayerGames route failed", { source, username, error });
    return NextResponse.json({ error: "Could not load games" }, { status: 400 });
  }
}
