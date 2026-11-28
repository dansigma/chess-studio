import { Chess, DEFAULT_POSITION } from "chess.js";
import { bookKey } from "@/src/chess/opening-book";
import { GAME_ID_MASK, dateNumber } from "@/src/lib/xd-database/format";
import type { DirectoryPlayer, PlayerGame, XdDatabaseReader } from "@/src/lib/xd-database/reader";
import { error, gameHeaders, PAGE_SIZE } from "../shared";

const PLAYER_LIMIT = 20;
const BATCH_SIZE = 16;
const GAME_LIMIT = 500;
const POSITION_POSTINGS_LIMIT = 4096;
const INITIAL_POSITION = bookKey(DEFAULT_POSITION);
export const PLAYER_ID = /^\d{1,10}-\d{1,10}$/;

type Headers = ReturnType<typeof gameHeaders>;
type Posting = PlayerGame & { date: number; headers: Headers; moves: string };
type Stream = { player: DirectoryPlayer; offset: number; batch: Posting[]; index: number };

// The cursor JSON is ASCII (player ids and integers), so btoa/atob suffice; no node:buffer in the Worker.
function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(cursor: string): string {
  return atob(cursor.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (cursor.length % 4)) % 4));
}

export function playerOffsets(cursor: string | null): Map<string, number> | null {
  if (cursor === null) return new Map();
  if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const text = fromBase64Url(cursor);
    if (toBase64Url(text) !== cursor) return null;
    const parsed: unknown = JSON.parse(text);
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
    record.id, { date: dateNumber(record.game.date), headers: gameHeaders(record), moves: record.game.moves },
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

async function positionMatcher(reader: XdDatabaseReader, key: bigint, fen: string) {
  if (key === INITIAL_POSITION) return () => true;
  const position = await reader.position(key);
  if (!position) return null;
  if (position.total <= POSITION_POSTINGS_LIMIT) {
    const ids = new Set((await reader.positionGames(position, 0, position.total)).map(({ id }) => id));
    return ({ id }: Posting) => ids.has(id);
  }
  const maxPly = await reader.maxPly();
  const target = targetShape(fen);
  return ({ moves }: Posting) => replayReaches(moves, maxPly, key, target);
}

/** Whether replaying `moves` (SAN, space separated) reaches the position `key` within `maxPly` plies. */
export function replayReaches(moves: string, maxPly: number, key: bigint, target: TargetShape): boolean {
  const board = new Chess();
  const shape = { pawns: { w: 8, b: 8 }, pieces: { w: 16, b: 16 } };
  for (const san of moves.split(" ", maxPly)) {
    if (!san) break;
    let move;
    try {
      move = board.move(san);
    } catch {
      // The builder counts the legal prefix of a game.
      break;
    }
    // Captures and pawn moves are irreversible: once the game has fewer pawns or pieces than the
    // target, or a pawn left a home square the target still occupies, it can never reach it.
    if (move.captured) {
      const side = move.color === "w" ? "b" : "w";
      shape.pieces[side] -= 1;
      if (move.captured === "p") shape.pawns[side] -= 1;
      if (move.captured === "p" && target.homePawns.has(move.isEnPassant() ? "" : move.to)) return false;
    }
    if (move.piece === "p" && target.homePawns.has(move.from)) return false;
    if (move.promotion) shape.pawns[move.color] -= 1;
    if (shape.pawns.w < target.pawns.w || shape.pawns.b < target.pawns.b ||
        shape.pieces.w < target.pieces.w || shape.pieces.b < target.pieces.b) return false;
    if (shape.pawns.w === target.pawns.w && shape.pawns.b === target.pawns.b &&
        shape.pieces.w === target.pieces.w && shape.pieces.b === target.pieces.b &&
        bookKey(board.fen()) === key) return true;
  }
  return false;
}

type TargetShape = ReturnType<typeof targetShape>;

/** Pawn and piece counts per side, and the pawns still on their home squares, of a FEN. */
export function targetShape(fen: string) {
  const shape = { pawns: { w: 0, b: 0 }, pieces: { w: 0, b: 0 }, homePawns: new Set<string>() };
  const rows = fen.trim().split(/\s+/)[0].split("/");
  rows.forEach((row, index) => {
    const rank = 8 - index;
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char);
        continue;
      }
      const side = char === char.toUpperCase() ? "w" : "b";
      shape.pieces[side] += 1;
      if (char.toLowerCase() === "p") {
        shape.pawns[side] += 1;
        if ((side === "w" && rank === 2) || (side === "b" && rank === 7)) {
          shape.homePawns.add(`${"abcdefgh"[file]}${rank}`);
        }
      }
      file += 1;
    }
  });
  return shape;
}

export async function playerQueryGames(
  reader: XdDatabaseReader,
  key: bigint,
  fen: string,
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

  const playerSummary = {
    players: streams.map(({ player: { id, name, count } }) => ({ id, name, count })),
    playersCapped: found.length > PLAYER_LIMIT,
  };
  const games: Headers[] = [];
  if (!streams.some(({ player, offset }) => offset < player.count)) {
    return Response.json({ games, nextCursor: null, ...playerSummary });
  }
  const reachesPosition = await positionMatcher(reader, key, fen);
  if (!reachesPosition) return Response.json({ games, nextCursor: null, ...playerSummary });

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

    if (sideMatches && matches(newest.headers, Math.floor(newest.date / 10000)) && reachesPosition(newest)) {
      games.push(newest.headers);
    }
  }

  const nextCursor = streams.some(({ player, offset }) => offset < player.count)
    ? toBase64Url(JSON.stringify(Object.fromEntries(streams.map(({ player, offset }) => [player.id, offset]))))
    : null;
  return Response.json({ games, nextCursor, ...playerSummary });
}
