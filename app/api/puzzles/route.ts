import { NextRequest, NextResponse } from "next/server";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { PUZZLES } from "@/src/puzzles/puzzle-data";
import { compilePuzzle } from "@/src/puzzles/engine";
import { fetchPuzzleRowById, queryPuzzleTable, type PuzzleTableQuery } from "@/src/puzzles/puzzle-store";
import { queryPuzzles, isPuzzleTheme, type PuzzleQueryOptions, type PuzzleQueryResult } from "@/src/puzzles/query";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
};

const limiter = createRouteLimiter({ limit: 60, windowMs: 60_000, bindingName: "RL_60_MIN" });

/**
 * SIG-1102: table-first sampling. The `puzzles_window` function clamps to
 * 200 rows, so offset requests and large limits stay on the in-memory
 * catalog rather than silently truncating.
 */
async function queryTableFirst(queryOpts: PuzzleQueryOptions): Promise<PuzzleQueryResult> {
  const windowed = queryOpts.sample || queryOpts.minRating !== undefined || queryOpts.maxRating !== undefined;
  const limit = queryOpts.limit ?? 50;
  if (windowed && queryOpts.offset === undefined && limit <= 200) {
    const tableOpts: PuzzleTableQuery = {
      minRating: queryOpts.minRating,
      maxRating: queryOpts.maxRating,
      theme: queryOpts.theme,
      limit,
      exclude: queryOpts.exclude ? [...queryOpts.exclude] : undefined,
      seed: queryOpts.seed ?? (queryOpts.sample ? (Math.random() * 0xffffffff) >>> 0 : undefined),
    };
    const table = await queryPuzzleTable(tableOpts);
    if (table) {
      const excluded = queryOpts.exclude ? new Set(queryOpts.exclude) : null;
      const items = excluded ? table.filter((puzzle) => !excluded.has(puzzle.id)) : table;
      return { items, total: items.length };
    }
  }
  return queryPuzzles(PUZZLES, queryOpts);
}

export async function GET(request: NextRequest) {
  const ip = clientIp(request.headers);
  const verdict = await limiter.checkAsync(rateLimitKey("puzzles", ip));
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many requests — try again shortly." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
    );
  }
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");

  // Single-item lookup: table first, catalog fallback.
  if (id !== null) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const row = await fetchPuzzleRowById(id);
    if (row) {
      try {
        return NextResponse.json(compilePuzzle(row), { headers: CACHE_HEADERS });
      } catch {
        console.warn(`[puzzles] skipping table row ${row.id} that failed to compile`);
      }
    }
    const puzzle = PUZZLES.find((item) => item.id === id);
    if (!puzzle) {
      return NextResponse.json({ error: "Puzzle not found" }, { status: 404 });
    }
    return NextResponse.json(puzzle, { headers: CACHE_HEADERS });
  }

  // Filtered / paginated query
  const queryOpts: PuzzleQueryOptions = {};

  const themeParam = searchParams.get("theme");
  if (themeParam !== null) {
    if (!isPuzzleTheme(themeParam)) {
      return NextResponse.json({ error: `Invalid theme: ${themeParam}` }, { status: 400 });
    }
    queryOpts.theme = themeParam;
  }

  const minRatingParam = searchParams.get("minRating");
  if (minRatingParam !== null) {
    const val = Number(minRatingParam);
    if (!Number.isInteger(val) || val < 0) {
      return NextResponse.json({ error: "minRating must be a non-negative integer" }, { status: 400 });
    }
    queryOpts.minRating = val;
  }

  const maxRatingParam = searchParams.get("maxRating");
  if (maxRatingParam !== null) {
    const val = Number(maxRatingParam);
    if (!Number.isInteger(val) || val < 0) {
      return NextResponse.json({ error: "maxRating must be a non-negative integer" }, { status: 400 });
    }
    if (queryOpts.minRating !== undefined && val < queryOpts.minRating) {
      return NextResponse.json({ error: "minRating cannot exceed maxRating" }, { status: 400 });
    }
    queryOpts.maxRating = val;
  }

  const limitParam = searchParams.get("limit");
  if (limitParam !== null) {
    const val = Number(limitParam);
    if (!Number.isInteger(val) || val <= 0 || val > 1000) {
      return NextResponse.json({ error: "limit must be an integer between 1 and 1000" }, { status: 400 });
    }
    queryOpts.limit = val;
  }

  const offsetParam = searchParams.get("offset");
  if (offsetParam !== null) {
    const val = Number(offsetParam);
    if (!Number.isInteger(val) || val < 0) {
      return NextResponse.json({ error: "offset must be a non-negative integer" }, { status: 400 });
    }
    queryOpts.offset = val;
  }

  const excludeParam = searchParams.get("exclude");
  if (excludeParam !== null) {
    queryOpts.exclude = excludeParam.split(",").map((s) => s.trim()).filter(Boolean);
  }

  const seedParam = searchParams.get("seed");
  if (seedParam !== null) {
    const val = Number(seedParam);
    if (!Number.isInteger(val)) {
      return NextResponse.json({ error: "seed must be an integer" }, { status: 400 });
    }
    queryOpts.seed = val;
  }

  const sampleParam = searchParams.get("sample");
  if (sampleParam === "true" || sampleParam === "1") {
    queryOpts.sample = true;
  }

  const { items, total } = await queryTableFirst(queryOpts);

  const headers: Record<string, string> = {
    ...CACHE_HEADERS,
    "X-Total-Count": total.toString(),
  };

  if (queryOpts.sample && queryOpts.seed === undefined) {
    headers["Cache-Control"] = "no-store";
  }

  const envelope = searchParams.get("envelope") === "true";
  if (envelope) {
    return NextResponse.json({ items, total }, { headers });
  }

  return NextResponse.json(items, { headers });
}
