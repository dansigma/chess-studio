import { error, serve } from "../shared";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length > 120) return error("q must be a player name prefix");
  return serve(request, async (reader) => {
    const players = (await reader.searchPlayers(query)).map(({ id, name, fideId, count, firstYear, lastYear }) => ({
      id, name, fideId: fideId || null, count, firstYear: firstYear || null, lastYear: lastYear || null,
    }));
    return Response.json({ players });
  });
}
