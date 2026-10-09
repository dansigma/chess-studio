import { NextRequest, NextResponse } from "next/server";
import { PUZZLES } from "@/src/puzzles/puzzle-data";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
};

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (id === null) {
    return NextResponse.json(PUZZLES, { headers: CACHE_HEADERS });
  }
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const puzzle = PUZZLES.find((item) => item.id === id);
  if (!puzzle) {
    return NextResponse.json({ error: "Puzzle not found" }, { status: 404 });
  }
  return NextResponse.json(puzzle, { headers: CACHE_HEADERS });
}
