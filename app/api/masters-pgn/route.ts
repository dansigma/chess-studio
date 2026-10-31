import { NextRequest, NextResponse } from "next/server";
import { getBookGamePgn } from "@/src/lib/opening-book";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { tooManyRequests } from "@/src/lib/rate-limit-response";
import { readCapped, UpstreamPayloadTooLargeError } from "@/src/lib/read-capped";

const MAX_MASTERS_PGN_BYTES = 1024 * 1024; // 1 MB
const limiter = createRouteLimiter({ limit: 30, windowMs: 60_000, bindingName: "RL_30_MIN" });

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const ip = clientIp(request.headers);
  const verdict = await limiter.checkAsync(rateLimitKey("masters-pgn", ip));
  if (!verdict.ok) {
    return tooManyRequests(verdict);
  }

  const book = getBookGamePgn(id);
  if (book) {
    return new NextResponse(book, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const endpoints = [
    `https://explorer.lichess.ovh/masters/pgn/${id}`,
    `https://lichess.org/game/export/${id}?evals=0&clocks=0`,
  ];
  for (const endpoint of endpoints) {
    try {
      const upstream = await fetch(endpoint, {
        headers: { Accept: "application/x-chess-pgn, text/plain" },
        signal: AbortSignal.timeout(8000),
      });
      if (upstream.ok) {
        const pgn = await readCapped(upstream, MAX_MASTERS_PGN_BYTES);
        return new NextResponse(pgn, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    } catch (error) {
      if (error instanceof UpstreamPayloadTooLargeError) {
        return NextResponse.json({ error: "Upstream response too large" }, { status: 502 });
      }
      // try the next host
    }
  }
  return NextResponse.json({ error: "Game not found" }, { status: 404 });
}
