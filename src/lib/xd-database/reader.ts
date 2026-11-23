// SIG-1449: reads a built Xadrez Digital database through a byte-range source
// (R2 in the app, local files in the builder's `inspect` and the tests). Every
// lookup is at most one range read once the small index files are loaded.
import { Chess } from "chess.js";
import { bookKey } from "../../chess/opening-book.ts";
import {
  compareUtf8,
  decodeGamesIndex,
  decodePlayersIndex,
  decodePlayersPage,
  decodeTreeIndex,
  findInTreePage,
  gameBlockRange,
  gameFromLine,
  pageFor,
  playerSearchKey,
  type GameRecord,
  type GamesIndex,
  type PlayerEntry,
  type PlayersIndex,
  type TreeIndex,
  type TreePosition,
} from "./format.ts";

export type XdFileName = "games.bin" | "games.idx" | "tree.bin" | "tree.idx" | "players.bin" | "players.idx" | "player-games.bin";

/** Byte source of one database version. `end` is exclusive; omitted range = whole file. */
export type XdRangeSource = (file: XdFileName, range?: { start: number; end: number }) => Promise<Uint8Array>;

export async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Position key of a FEN as the builder computes it (normalized through chess.js). */
export function treeKeyOfFen(fen: string): bigint | null {
  try {
    return bookKey(new Chess(fen).fen());
  } catch {
    return null;
  }
}

export class XdDatabaseReader {
  private gamesIndex: Promise<GamesIndex> | null = null;
  private treeIndex: Promise<TreeIndex> | null = null;
  private playersIndex: Promise<PlayersIndex> | null = null;
  private readonly source: XdRangeSource;

  constructor(source: XdRangeSource) {
    this.source = source;
  }

  private games(): Promise<GamesIndex> {
    this.gamesIndex ??= this.source("games.idx").then(decodeGamesIndex);
    return this.gamesIndex;
  }

  private tree(): Promise<TreeIndex> {
    this.treeIndex ??= this.source("tree.idx").then(decodeTreeIndex);
    return this.treeIndex;
  }

  private players(): Promise<PlayersIndex> {
    this.playersIndex ??= this.source("players.idx").then(decodePlayersIndex);
    return this.playersIndex;
  }

  async gameCount(): Promise<number> {
    return (await this.games()).gameCount;
  }

  async maxPly(): Promise<number> {
    return (await this.tree()).maxPly;
  }

  /** The tree entry of a position, or null when it is not in the tree (fewer than the build's minimum games, or deeper than its max ply). */
  async position(key: bigint): Promise<TreePosition | null> {
    const index = await this.tree();
    const range = pageFor(index, key);
    if (!range) {
      return null;
    }
    const page = await inflateRaw(await this.source("tree.bin", range));
    return findInTreePage(page, key);
  }

  async positionByFen(fen: string): Promise<TreePosition | null> {
    const key = treeKeyOfFen(fen);
    return key === null ? null : this.position(key);
  }

  /** Games by id, in the order asked. Ids out of range are skipped. Reads each block once. */
  async gamesById(ids: readonly number[]): Promise<Array<{ id: number; game: GameRecord }>> {
    const index = await this.games();
    const blocks = new Map<number, Promise<string[]>>();
    const out: Array<{ id: number; game: GameRecord }> = [];
    const loaded = await Promise.all(
      ids.map(async (id) => {
        const range = gameBlockRange(index, id);
        if (!range) {
          return null;
        }
        let lines = blocks.get(range.block);
        if (!lines) {
          lines = this.source("games.bin", { start: range.start, end: range.end })
            .then(inflateRaw)
            .then((bytes) => new TextDecoder().decode(bytes).split("\n"));
          blocks.set(range.block, lines);
        }
        const line = (await lines)[range.line];
        return line === undefined ? null : { id, game: gameFromLine(line) };
      }),
    );
    for (const entry of loaded) {
      if (entry) {
        out.push(entry);
      }
    }
    return out;
  }

  async game(id: number): Promise<GameRecord | null> {
    return (await this.gamesById([id]))[0]?.game ?? null;
  }

  /** Players whose search key starts with `prefix` (lowercase, no accents), most games first. */
  async searchPlayers(prefix: string, limit = 20): Promise<PlayerEntry[]> {
    const key = playerSearchKey(prefix);
    if (key === "") {
      return [];
    }
    const index = await this.players();
    let page = pageFor(index, key)?.page ?? 0;
    const found: PlayerEntry[] = [];
    // A prefix can span several pages; stop at the first entry past the prefix.
    for (; page < index.firstKeys.length; page += 1) {
      if (page > 0 && compareUtf8(index.firstKeys[page], key) > 0 && !index.firstKeys[page].startsWith(key)) {
        break;
      }
      const entries = decodePlayersPage(await inflateRaw(await this.source("players.bin", { start: index.offsets[page], end: index.offsets[page + 1] })));
      let past = false;
      for (const entry of entries) {
        if (entry.searchKey.startsWith(key)) {
          found.push(entry);
        } else if (compareUtf8(entry.searchKey, key) > 0) {
          past = true;
          break;
        }
      }
      if (past || found.length >= 2000) {
        break;
      }
    }
    return found.sort((a, b) => b.count - a.count || compareUtf8(a.searchKey, b.searchKey)).slice(0, limit);
  }

  /** One page of a player's game ids, newest first. */
  async playerGameIds(player: Pick<PlayerEntry, "start" | "count">, offset: number, limit: number): Promise<number[]> {
    const from = Math.max(0, Math.min(offset, player.count));
    const to = Math.min(player.count, from + Math.max(0, limit));
    if (to <= from) {
      return [];
    }
    const bytes = await this.source("player-games.bin", { start: (player.start + from) * 4, end: (player.start + to) * 4 });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ids: number[] = [];
    for (let i = 0; i + 4 <= bytes.length; i += 4) {
      ids.push(view.getUint32(i, true));
    }
    return ids;
  }
}
