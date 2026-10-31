import { NextRequest, NextResponse } from "next/server";
import { loadPlayerGames } from "@/src/lib/players-server";
import { isDisplayText, isPlayerUsername, isStudioPlayerName } from "@/src/lib/request-validation";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { tooManyRequests } from "@/src/lib/rate-limit-response";

const limiter = createRouteLimiter({ limit: 30, windowMs: 60_000, bindingName: "RL_30_MIN" });

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
  if (!isDisplayText(displayName, 80) || !isDisplayText(subtitle, 120)) {
    return NextResponse.json(
      { error: "displayName must be at most 80 characters and subtitle at most 120" },
      { status: 400 },
    );
  }
  const ip = clientIp(request.headers);
  const verdict = await limiter.checkAsync(rateLimitKey("games", ip));
  if (!verdict.ok) {
    return tooManyRequests(verdict);
  }
  try {
    const payload = await loadPlayerGames(source, username, displayName, subtitle);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    console.error("loadPlayerGames route failed", { source, username, error });
    return NextResponse.json({ error: "Could not load games" }, { status: 502 });
  }
}
