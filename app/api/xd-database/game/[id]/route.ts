import type { GameRecord } from "@/src/lib/xd-database/format";
import { error, serve, unsignedInteger, type IdParams } from "../../shared";

function pgn(game: GameRecord) {
  const tags = {
    Event: game.event ?? "?",
    Site: game.site ?? "?",
    Date: game.date ?? "????.??.??",
    Round: game.round ?? "?",
    White: game.white,
    Black: game.black,
    Result: game.result,
    WhiteElo: game.whiteElo,
    BlackElo: game.blackElo,
    ECO: game.openingEco ?? game.eco,
    Opening: game.openingName,
    WhiteTitle: game.whiteTitle,
    BlackTitle: game.blackTitle,
    WhiteFideId: game.whiteFideId,
    BlackFideId: game.blackFideId,
  };
  const headers = Object.entries(tags).flatMap(([tag, value]) => {
    if (value === null) return [];
    const escaped = String(value).replace(/[\r\n]/g, " ").replace(/[\\"]/g, "\\$&");
    return `[${tag} "${escaped}"]`;
  });
  const moves = game.moves.split(" ").map((san, ply) => ply % 2 === 0 ? `${ply / 2 + 1}. ${san}` : san);
  return `${headers.join("\n")}\n\n${moves.join(" ")} ${game.result}\n`;
}

export async function GET(request: Request, { params }: IdParams) {
  const id = unsignedInteger((await params).id);
  if (Number.isNaN(id)) return error("Game not found", 404);
  return serve(request, async (reader) => {
    const game = await reader.game(id);
    return game
      ? new Response(pgn(game), { headers: { "Content-Type": "application/x-chess-pgn; charset=utf-8" } })
      : error("Game not found", 404);
  });
}
