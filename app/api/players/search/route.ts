import { NextRequest, NextResponse } from "next/server";
import { searchPlayers } from "@/src/lib/players-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (query.trim().length < 2) {
    return NextResponse.json({ players: [] });
  }
  const players = await searchPlayers(query);
  return NextResponse.json({ players });
}
