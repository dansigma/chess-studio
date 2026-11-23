import { decodeMove } from "@/src/chess/opening-book-format";
import { lookupBookOpening } from "@/src/lib/opening-book";
import { error, positionQuery, serve } from "../shared";

export async function GET(request: Request) {
  const query = positionQuery(new URL(request.url).searchParams);
  if (!query) return error("fen is not a valid position");
  return serve(request, async (reader) => {
    const position = await reader.position(query.key);
    return Response.json({
      opening: lookupBookOpening(query.fen),
      total: position?.total ?? 0,
      moves: position?.moves.map(({ code, ...stats }) => ({ uci: decodeMove(code), ...stats })) ?? [],
    });
  });
}
