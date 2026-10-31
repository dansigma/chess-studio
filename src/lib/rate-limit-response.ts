import { NextResponse } from "next/server";

/** Shared 429 body for rate-limited JSON routes (kept byte-identical everywhere). */
export function tooManyRequests(verdict: { retryAfterSeconds: number }): NextResponse {
  return NextResponse.json(
    { error: "Too many requests — try again shortly." },
    { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
  );
}
