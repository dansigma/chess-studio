import { GAME_RESULTS, POSITION_GAME_BYTES, averageGameRating } from "@/src/lib/xd-database/format";
import { error, gameHeaders, pageCursor, PAGE_SIZE, positionQuery, serve, unsignedInteger } from "../shared";

import { PLAYER_ID, playerOffsets, playerQueryGames } from "./player-query";

const SCAN_LIMIT = Math.floor(64 * 1024 / POSITION_GAME_BYTES);

function filters(query: URLSearchParams) {
  const player = query.get("player");
  const playerQuery = query.get("playerQuery")?.trim() ?? null;
  const color = query.get("color");
  const result = query.get("result");
  const minRating = unsignedInteger(query.get("minRating") ?? "0");
  const maxRating = unsignedInteger(query.get("maxRating") ?? "65535");
  const minYear = unsignedInteger(query.get("minYear") ?? "0");
  const maxYear = unsignedInteger(query.get("maxYear") ?? "9999");
  if (!(minRating <= maxRating && maxRating <= 65535 && minYear <= maxYear && maxYear <= 9999) ||
    (player !== null && !PLAYER_ID.test(player)) ||
    (playerQuery !== null && (player !== null || !playerQuery || playerQuery.length > 120)) ||
    (color !== null && ((!player && !playerQuery) || (color !== "white" && color !== "black"))) ||
    (result !== null && !GAME_RESULTS.some((value) => value === result))) {
    return null;
  }
  return { player, playerQuery, color, result, minRating, maxRating, minYear, maxYear };
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const positionRequest = positionQuery(query);
  if (!positionRequest) return error("fen is not a valid position");
  const filter = filters(query);
  if (!filter) return error("Invalid game filters");
  const { player, playerQuery, color, result, minRating, maxRating, minYear, maxYear } = filter;
  const matches = ({ whiteElo, blackElo, result: gameResult }: {
    whiteElo: number | null; blackElo: number | null; result: string;
  }, year: number) => {
    const rating = averageGameRating(whiteElo ?? 0, blackElo ?? 0);
    return (!result || gameResult === result) &&
      rating >= minRating && rating <= maxRating && year >= minYear && year <= maxYear;
  };

  if (playerQuery !== null) {
    const offsets = playerOffsets(query.get("cursor"));
    if (!offsets) return error("Invalid playerQuery cursor");
    return serve(request, (reader) => playerQueryGames(reader, positionRequest.key, playerQuery, offsets, color, matches), {
      filtered: true, skipEdgeCache: true,
    });
  }

  const cursor = pageCursor(query);
  if (Number.isNaN(cursor)) return error("cursor must be a nonnegative integer");
  const filtered = ["player", "result", "minRating", "maxRating", "minYear", "maxYear"].some((name) => query.has(name));

  return serve(request, async (reader) => {
    const position = await reader.position(positionRequest.key);
    if (!position || cursor >= position.total) return Response.json({ games: [], nextCursor: null });

    const firstPageSize = Math.min(PAGE_SIZE, position.total);
    if (!filtered && !query.has("cursor") && position.gameIds.length >= firstPageSize) {
      const games = (await reader.gamesById(position.gameIds.slice(0, firstPageSize))).map(gameHeaders);
      return Response.json({ games, nextCursor: firstPageSize < position.total ? firstPageSize : null });
    }

    let playerIds: Set<number> | undefined;
    if (player) {
      const entry = await reader.playerById(player);
      if (!entry) return error("Player not found", 404);
      const postings = await reader.playerGameIds(entry, 0, entry.count);
      playerIds = new Set(postings.filter((row) => !color || row.color === color).map(({ id }) => id));
    }

    const postings = await reader.positionGames(position, cursor, filtered ? SCAN_LIMIT : PAGE_SIZE);
    const ids: number[] = [];
    let next = cursor;
    for (const row of postings) {
      next += 1;
      if ((!playerIds || playerIds.has(row.id)) && matches(row, row.year)) {
        ids.push(row.id);
        if (ids.length === PAGE_SIZE) break;
      }
    }
    const games = ids.length ? (await reader.gamesById(ids)).map(gameHeaders) : [];
    return Response.json({ games, nextCursor: next < position.total ? next : null });
  }, { filtered });
}
