import { error, gameHeaders, pageCursor, PAGE_SIZE, serve, type IdParams } from "../../../shared";

export async function GET(request: Request, { params }: IdParams) {
  const cursor = pageCursor(new URL(request.url).searchParams);
  if (Number.isNaN(cursor)) return error("cursor must be a nonnegative integer");
  const { id } = await params;
  return serve(request, async (reader) => {
    const player = await reader.playerById(id);
    if (!player) return error("Player not found", 404);
    const postings = await reader.playerGameIds(player, cursor, PAGE_SIZE);
    const games = postings.length ? await reader.gamesById(postings.map((row) => row.id)) : [];
    const next = cursor + postings.length;
    return Response.json({
      games: games.map(gameHeaders),
      nextCursor: next < player.count ? next : null,
    });
  });
}
