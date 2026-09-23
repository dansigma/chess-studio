import { NextRequest, NextResponse } from "next/server";
import { loadPlayerGames } from "@/src/lib/players-server";

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") ?? "";
  const username = request.nextUrl.searchParams.get("username") ?? "";
  const displayName = request.nextUrl.searchParams.get("displayName") ?? undefined;
  const subtitle = request.nextUrl.searchParams.get("subtitle") ?? undefined;
  if (!source || !username) {
    return NextResponse.json({ error: "source and username are required" }, { status: 400 });
  }
  try {
    const payload = await loadPlayerGames(source, username, displayName, subtitle);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load games" },
      { status: 400 },
    );
  }
}
