import { NextRequest, NextResponse } from "next/server";
import { searchFidePlayers } from "@/src/lib/players-server";
import { isSearchQuery } from "@/src/lib/request-validation";
import { clientIp, createRouteLimiter } from "@/src/lib/rate-limit";

export const dynamic = "force-dynamic";

const limiter = createRouteLimiter({ limit: 60, windowMs: 60_000, bindingName: "RL_60_MIN" });

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!isSearchQuery(query)) {
    return NextResponse.json({ players: [] });
  }
  const ip = clientIp(request.headers);
  if (ip !== "unknown") {
    const verdict = await limiter.checkAsync(`fide:${ip}`);
    if (!verdict.ok) {
      return NextResponse.json(
        { error: "Too many requests — try again shortly." },
        { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
      );
    }
  }
  try {
    const players = await searchFidePlayers(query);
    return NextResponse.json({ players });
  } catch (error) {
    console.error("searchFidePlayers route failed", { query, error });
    return NextResponse.json({ players: [] });
  }
}
