import { NextRequest, NextResponse } from "next/server";
import { searchFidePlayers } from "@/src/lib/players-server";
import { isSearchQuery } from "@/src/lib/request-validation";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { tooManyRequests } from "@/src/lib/rate-limit-response";

export const dynamic = "force-dynamic";

const limiter = createRouteLimiter({ limit: 60, windowMs: 60_000, bindingName: "RL_60_MIN" });

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!isSearchQuery(query)) {
    return NextResponse.json({ players: [] });
  }
  const ip = clientIp(request.headers);
  const verdict = await limiter.checkAsync(rateLimitKey("fide", ip));
  if (!verdict.ok) {
    return tooManyRequests(verdict);
  }
  try {
    const players = await searchFidePlayers(query);
    return NextResponse.json({ players });
  } catch (error) {
    console.error("searchFidePlayers route failed", { query, error });
    return NextResponse.json({ players: [] });
  }
}
