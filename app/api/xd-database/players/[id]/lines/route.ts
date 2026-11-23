import { error, playerLines, serve, type IdParams } from "../../../shared";

export async function GET(request: Request, { params }: IdParams) {
  const { id } = await params;
  return serve(request, async (reader) => {
    const player = await reader.playerById(id);
    if (!player) return error("Player not found", 404);
    return Response.json(await playerLines(reader, player));
  });
}
