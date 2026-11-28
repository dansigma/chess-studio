import { Buffer } from "node:buffer";
import { GAME_ID_MASK, dateNumber } from "@/src/lib/xd-database/format";
import type { DirectoryPlayer, PlayerGame, XdDatabaseReader } from "@/src/lib/xd-database/reader";
import { error, gameHeaders, PAGE_SIZE } from "../shared";

const PLAYER_LIMIT = 20;
const BATCH_SIZE = 16;
const GAME_LIMIT = 500;
export const PLAYER_ID = /^\d{1,10}-\d{1,10}$/;

type Headers = ReturnType<typeof gameHeaders>;
type Posting = PlayerGame & { date: number; headers: Headers };
type Stream = { player: DirectoryPlayer; offset: number; batch: Posting[]; index: number };

export function playerOffsets(cursor: string | null): Map<string, number> | null {
  if (cursor === null) return new Map();
  if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) return null;
    const parsed: unknown = JSON.parse(bytes.toString());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed);
    if (entries.length === 0 || entries.length > PLAYER_LIMIT || entries.some(([id, offset]) =>
      !PLAYER_ID.test(id) || !Number.isInteger(offset) || offset < 0 || offset > 2 * (GAME_ID_MASK + 1)
    )) return null;
    return new Map(entries);
  } catch {
    return null;
  }
}

async function refill(reader: XdDatabaseReader, streams: Stream[]) {
  const empty = streams.filter(({ index, batch, offset, player }) => index === batch.length && offset < player.count);
  if (!empty.length) return;

  const postings = await Promise.all(empty.map(({ player, offset }) => reader.playerGameIds(player, offset, BATCH_SIZE)));
  const ids = new Set(postings.flatMap((batch) => batch.map(({ id }) => id)));
  const records = new Map((await reader.gamesById([...ids])).map((record) => [
    record.id, { date: dateNumber(record.game.date), headers: gameHeaders(record) },
  ]));
  for (const [i, stream] of empty.entries()) {
    stream.batch = postings[i].map((posting) => {
      const record = records.get(posting.id);
      if (!record) throw new Error("xd-database: missing player game");
      return { ...posting, ...record };
    });
    stream.index = 0;
  }
}

export async function playerQueryGames(
  reader: XdDatabaseReader,
  query: string,
  offsets: Map<string, number>,
  color: string | null,
  matches: (game: Headers, year: number) => boolean,
) {
  const found = await reader.searchPlayersByWords(query, PLAYER_LIMIT + 1);
  const streams: Stream[] = found.slice(0, PLAYER_LIMIT).map((player) => ({
    player, offset: offsets.get(player.id) ?? 0, batch: [], index: 0,
  }));
  if (streams.some(({ player, offset }) => offset > player.count)) return error("Invalid playerQuery cursor");

  const games: Headers[] = [];
  await refill(reader, streams);
  for (let examined = 0; examined < GAME_LIMIT && games.length < PAGE_SIZE; examined += 1) {
    let newest: Posting | undefined;
    for (const { batch, index } of streams) {
      const head = batch[index];
      if (head && (!newest || head.date > newest.date || (head.date === newest.date && head.id > newest.id))) {
        newest = head;
      }
    }
    if (!newest) break;

    // Advance every posting for this game before returning a cursor, even across a batch boundary.
    let sideMatches = color === null;
    let consumed: boolean;
    do {
      consumed = false;
      for (const stream of streams) {
        let head = stream.batch[stream.index];
        while (head?.id === newest.id) {
          sideMatches ||= head.color === color;
          stream.offset += 1;
          stream.index += 1;
          head = stream.batch[stream.index];
          consumed = true;
        }
      }
      if (consumed) await refill(reader, streams);
    } while (consumed);

    if (sideMatches && matches(newest.headers, Math.floor(newest.date / 10000))) games.push(newest.headers);
  }

  const nextCursor = streams.some(({ player, offset }) => offset < player.count)
    ? Buffer.from(JSON.stringify(Object.fromEntries(streams.map(({ player, offset }) => [player.id, offset])))).toString("base64url")
    : null;
  return Response.json({
    games,
    nextCursor,
    players: streams.map(({ player: { id, name, count } }) => ({ id, name, count })),
    playersCapped: found.length > PLAYER_LIMIT,
  });
}
