import { NextRequest, NextResponse } from "next/server";
import { searchPlayers } from "@/src/lib/players-server";
import { isSearchQuery } from "@/src/lib/request-validation";
import { clientIp, createRateLimiter } from "@/src/lib/rate-limit";

export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!isSearchQuery(query)) {
    return NextResponse.json({ players: [] });
  }
  const verdict = limiter.check(`search:${clientIp(request.headers)}`);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many requests — try again shortly." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }
  try {
    const players = await searchPlayers(query);
    return NextResponse.json({ players });
  } catch {
    return NextResponse.json({ players: [] });
  }
}
