import { NextRequest, NextResponse } from "next/server";
import { getBookGamePgn } from "@/src/lib/opening-book";
import { clientIp, createRateLimiter } from "@/src/lib/rate-limit";

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const ip = clientIp(request.headers);
  if (ip !== "unknown") {
    const verdict = limiter.check(`masters-pgn:${ip}`);
    if (!verdict.ok) {
      return NextResponse.json(
        { error: "Too many requests — try again shortly." },
        { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
      );
    }
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
        const pgn = await upstream.text();
        return new NextResponse(pgn, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    } catch {
      // try the next host
    }
  }
  return NextResponse.json({ error: "Game not found" }, { status: 404 });
}
