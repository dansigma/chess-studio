// SIG-1449: binary formats of the Xadrez Digital database (built offline by
// scripts/xd-database/build.mjs, read by the app routes). Shared by the
// builder, its `inspect` command and the API, so all of them read the files the
// same way. Every integer is little-endian. "varint" is unsigned LEB128.
//
// One build is a folder `v<N>/` holding:
//
//   games.bin    Game blocks. Each block is deflate-raw of UTF-8 text, one game
//                per line, each line a JSON array (see GameRecord). A block holds
//                GAMES_PER_BLOCK games (the last block may hold fewer): game `id`
//                is line `id % GAMES_PER_BLOCK` of block `floor(id / GAMES_PER_BLOCK)`.
//   games.idx    "XDGI", u32 format version, u32 games per block, u32 game count,
//                u32 block count, then block count + 1 u64 byte offsets into
//                games.bin (the last one is the file size).
//   tree.bin     Tree pages. Each page is deflate-raw of position records sorted
//                by unsigned 64-bit position key (see TreePosition).
//   tree.idx     "XDTI", u32 format version, u32 page count, u32 max ply, then per
//                page: u64 first key, u64 byte offset into tree.bin; then a final
//                u64 offset (the file size).
//   players.bin  Player directory pages. Each page is deflate-raw of player
//                records sorted by search key (see PlayerEntry).
//   players.idx  "XDPI", u32 format version, u32 page count, u32 player count, then
//                per page: u16 byte length + UTF-8 first search key, u64 byte
//                offset into players.bin; then a final u64 offset.
//   position-games.bin  Per-position entries: u32 game id, u16 white Elo,
//                u16 black Elo, u16 year, u8 result (0/1/2), u8 reserved.
//   player-games.bin  u32 game ids with bit 31 set for Black. A player's games are `count` ids starting at id
//                index `start` (byte offset start * 4), newest first.
//   manifest.json     Versions, sizes, SHA-256 checksums and build stats.
//
// Position keys are the app's position hash (`bookKey`: FNV-1a 64 of the first
// four FEN fields of chess.js `fen()`), unsigned.
//
// Tree position record:
//   u64 key
//   u64 byte offset into position-games.bin
//   varint total             games that reached the position (each game counted once)
//   varint move count, then per move:
//     u16 move code          encodeMove (from | to << 6 | promotion << 12)
//     varint white, varint draws, varint black
//     varint average rating  mean of both players' ratings over the move's games
//     varint last year       latest year the move was played (0: unknown)
//   varint game count, then that many varint game ids, strongest first
//   (average rating of the game, then the newest, then the lowest id).
//
// Player record:
//   string search key (varint byte length + UTF-8): lowercase, no accents
//   string display name
//   varint FIDE id (0: none)
//   varint start, varint count   slice of player-games.bin
//   varint first year, varint last year (0: unknown)

export const XD_FORMAT_VERSION = 3;
export const POSITION_GAME_BYTES = 12;
export const PLAYER_BLACK_BIT = 0x80000000;
export const GAME_ID_MASK = PLAYER_BLACK_BIT - 1;
export const GAME_RESULTS = ["1-0", "1/2-1/2", "0-1"] as const;
/** Average the available ratings. Position game entries store missing ratings as zero. */
export function averageGameRating(whiteElo: number, blackElo: number): number {
  return whiteElo && blackElo ? Math.round((whiteElo + blackElo) / 2) : whiteElo || blackElo;
}

export const GAMES_MAGIC = "XDGI";
export const TREE_MAGIC = "XDTI";
export const PLAYERS_MAGIC = "XDPI";
export const GAMES_PER_BLOCK = 256;

/**
 * One game, as stored in games.bin. The moves are SAN separated by single
 * spaces, without move numbers, comments, variations or result.
 */
export type GameRecord = {
  white: string;
  black: string;
  whiteElo: number | null;
  blackElo: number | null;
  result: "1-0" | "0-1" | "1/2-1/2";
  date: string | null;
  event: string | null;
  site: string | null;
  round: string | null;
  eco: string | null;
  whiteTitle: string | null;
  blackTitle: string | null;
  whiteFideId: number | null;
  blackFideId: number | null;
  moves: string;
  openingEco: string | null;
  openingName: string | null;
};

const GAME_FIELDS = [
  "white",
  "black",
  "whiteElo",
  "blackElo",
  "result",
  "date",
  "event",
  "site",
  "round",
  "eco",
  "whiteTitle",
  "blackTitle",
  "whiteFideId",
  "blackFideId",
  "moves",
  "openingEco",
  "openingName",
] as const;

export function gameToLine(game: GameRecord): string {
  return JSON.stringify(GAME_FIELDS.map((field) => game[field]));
}

export function gameFromLine(line: string): GameRecord {
  const values = JSON.parse(line) as unknown[];
  const game = {} as Record<string, unknown>;
  GAME_FIELDS.forEach((field, i) => {
    game[field] = values[i] ?? null;
  });
  return game as GameRecord;
}

export type TreeMove = {
  code: number;
  white: number;
  draws: number;
  black: number;
  averageRating: number;
  lastYear: number;
};

export type TreePosition = {
  key: bigint;
  total: number;
  gamesOffset: number;
  moves: TreeMove[];
  gameIds: number[];
};

export type PlayerEntry = {
  searchKey: string;
  name: string;
  fideId: number;
  start: number;
  count: number;
  firstYear: number;
  lastYear: number;
};

export type GamesIndex = {
  formatVersion: number;
  gamesPerBlock: number;
  gameCount: number;
  offsets: number[];
};

export type PageIndex<K> = {
  formatVersion: number;
  firstKeys: K[];
  offsets: number[];
};

export type TreeIndex = PageIndex<bigint> & { maxPly: number };
export type PlayersIndex = PageIndex<string> & { playerCount: number };

// ---------- writing ----------

/** Growable byte buffer with the primitives of this format. */
export class ByteWriter {
  bytes = new Uint8Array(1024);
  length = 0;

  private ensure(extra: number): void {
    if (this.length + extra <= this.bytes.length) {
      return;
    }
    let size = this.bytes.length * 2;
    while (size < this.length + extra) {
      size *= 2;
    }
    const next = new Uint8Array(size);
    next.set(this.bytes.subarray(0, this.length));
    this.bytes = next;
  }

  u8(value: number): void {
    this.ensure(1);
    this.bytes[this.length++] = value & 0xff;
  }

  u16(value: number): void {
    this.ensure(2);
    this.bytes[this.length++] = value & 0xff;
    this.bytes[this.length++] = (value >>> 8) & 0xff;
  }

  u32(value: number): void {
    this.ensure(4);
    new DataView(this.bytes.buffer).setUint32(this.length, value >>> 0, true);
    this.length += 4;
  }

  u64(value: bigint | number): void {
    this.ensure(8);
    new DataView(this.bytes.buffer).setBigUint64(this.length, BigInt.asUintN(64, BigInt(value)), true);
    this.length += 8;
  }

  /** u64 from two unsigned 32-bit halves. */
  u64Parts(hi: number, lo: number): void {
    this.u32(lo);
    this.u32(hi);
  }

  varint(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`varint out of range: ${value}`);
    }
    let rest = value;
    while (rest >= 0x80) {
      this.u8((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    this.u8(rest);
  }

  text(value: string): void {
    const encoded = new TextEncoder().encode(value);
    this.varint(encoded.length);
    this.raw(encoded);
  }

  ascii(value: string): void {
    for (let i = 0; i < value.length; i += 1) {
      this.u8(value.charCodeAt(i));
    }
  }

  raw(bytes: Uint8Array): void {
    this.ensure(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }

  result(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

// ---------- reading ----------

export class ByteReader {
  offset = 0;
  readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get done(): boolean {
    return this.offset >= this.bytes.length;
  }

  private need(count: number): void {
    if (this.offset + count > this.bytes.length) {
      throw new Error("xd-database: truncated data");
    }
  }

  u8(): number {
    this.need(1);
    return this.bytes[this.offset++];
  }

  u16(): number {
    this.need(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32(): number {
    this.need(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  u64(): bigint {
    this.need(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  /** u64 that must fit a safe integer (byte offsets). */
  offset64(): number {
    const value = this.u64();
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("xd-database: offset too large");
    }
    return Number(value);
  }

  varint(): number {
    let value = 0;
    let scale = 1;
    for (;;) {
      const byte = this.u8();
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) {
        return value;
      }
      scale *= 0x80;
      if (scale > 2 ** 56) {
        throw new Error("xd-database: varint too long");
      }
    }
  }

  text(): string {
    const length = this.varint();
    this.need(length);
    const value = new TextDecoder().decode(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }

  ascii(length: number): string {
    this.need(length);
    let value = "";
    for (let i = 0; i < length; i += 1) {
      value += String.fromCharCode(this.bytes[this.offset + i]);
    }
    this.offset += length;
    return value;
  }
}

function expectMagic(reader: ByteReader, magic: string): number {
  const found = reader.ascii(4);
  if (found !== magic) {
    throw new Error(`xd-database: bad magic ${JSON.stringify(found)}, expected ${magic}`);
  }
  const version = reader.u32();
  if (version < 2 || version > XD_FORMAT_VERSION) {
    throw new Error(`xd-database: format version ${version}, expected 2 through ${XD_FORMAT_VERSION}`);
  }
  return version;
}

export function encodeGamesIndex(index: Omit<GamesIndex, "formatVersion">): Uint8Array {
  const writer = new ByteWriter();
  writer.ascii(GAMES_MAGIC);
  writer.u32(XD_FORMAT_VERSION);
  writer.u32(index.gamesPerBlock);
  writer.u32(index.gameCount);
  writer.u32(index.offsets.length - 1);
  for (const offset of index.offsets) {
    writer.u64(offset);
  }
  return writer.result();
}

export function decodeGamesIndex(bytes: Uint8Array): GamesIndex {
  const reader = new ByteReader(bytes);
  const formatVersion = expectMagic(reader, GAMES_MAGIC);
  const gamesPerBlock = reader.u32();
  const gameCount = reader.u32();
  const blockCount = reader.u32();
  const offsets: number[] = [];
  for (let i = 0; i <= blockCount; i += 1) {
    offsets.push(reader.offset64());
  }
  return { formatVersion, gamesPerBlock, gameCount, offsets };
}

/** Byte range of the block holding game `id` in games.bin, or null when the id is out of range. */
export function gameBlockRange(index: GamesIndex, id: number): { block: number; line: number; start: number; end: number } | null {
  if (!Number.isInteger(id) || id < 0 || id >= index.gameCount) {
    return null;
  }
  const block = Math.floor(id / index.gamesPerBlock);
  return { block, line: id % index.gamesPerBlock, start: index.offsets[block], end: index.offsets[block + 1] };
}

export function encodeTreeIndex(index: { maxPly: number; firstKeys: bigint[]; offsets: number[] }): Uint8Array {
  const writer = new ByteWriter();
  writer.ascii(TREE_MAGIC);
  writer.u32(XD_FORMAT_VERSION);
  writer.u32(index.firstKeys.length);
  writer.u32(index.maxPly);
  index.firstKeys.forEach((key, i) => {
    writer.u64(key);
    writer.u64(index.offsets[i]);
  });
  writer.u64(endOffset(index));
  return writer.result();
}

function endOffset(index: { firstKeys: readonly unknown[]; offsets: readonly number[] }): number {
  const end = index.offsets[index.firstKeys.length];
  if (end === undefined) {
    throw new Error("page index: the end offset is missing");
  }
  return end;
}

export function decodeTreeIndex(bytes: Uint8Array): TreeIndex {
  const reader = new ByteReader(bytes);
  const formatVersion = expectMagic(reader, TREE_MAGIC);
  const pageCount = reader.u32();
  const maxPly = reader.u32();
  const firstKeys: bigint[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    firstKeys.push(reader.u64());
    offsets.push(reader.offset64());
  }
  offsets.push(reader.offset64());
  return { formatVersion, maxPly, firstKeys, offsets };
}

export function encodePlayersIndex(index: { playerCount: number; firstKeys: string[]; offsets: number[] }): Uint8Array {
  const writer = new ByteWriter();
  writer.ascii(PLAYERS_MAGIC);
  writer.u32(XD_FORMAT_VERSION);
  writer.u32(index.firstKeys.length);
  writer.u32(index.playerCount);
  index.firstKeys.forEach((key, i) => {
    const encoded = new TextEncoder().encode(key);
    writer.u16(encoded.length);
    writer.raw(encoded);
    writer.u64(index.offsets[i]);
  });
  writer.u64(endOffset(index));
  return writer.result();
}

export function decodePlayersIndex(bytes: Uint8Array): PlayersIndex {
  const reader = new ByteReader(bytes);
  const formatVersion = expectMagic(reader, PLAYERS_MAGIC);
  const pageCount = reader.u32();
  const playerCount = reader.u32();
  const firstKeys: string[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const length = reader.u16();
    if (reader.offset + length > reader.bytes.length) {
      throw new Error("players index: truncated data");
    }
    firstKeys.push(new TextDecoder().decode(reader.bytes.subarray(reader.offset, reader.offset + length)));
    reader.offset += length;
    offsets.push(reader.offset64());
  }
  offsets.push(reader.offset64());
  return { formatVersion, playerCount, firstKeys, offsets };
}

/**
 * Page that may hold `key`: the last page whose first key is <= key, as a byte
 * range of the data file, or null when the key sorts before every page.
 */
export function pageFor<K>(index: PageIndex<K>, key: K): { page: number; start: number; end: number } | null {
  let low = 0;
  let high = index.firstKeys.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (index.firstKeys[mid] <= key) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (found < 0) {
    return null;
  }
  return { page: found, start: index.offsets[found], end: index.offsets[found + 1] };
}

export function writeTreePosition(writer: ByteWriter, position: TreePosition): void {
  writer.u64(position.key);
  writer.u64(position.gamesOffset);
  writer.varint(position.total);
  writer.varint(position.moves.length);
  for (const move of position.moves) {
    writer.u16(move.code);
    writer.varint(move.white);
    writer.varint(move.draws);
    writer.varint(move.black);
    writer.varint(move.averageRating);
    writer.varint(move.lastYear);
  }
  writer.varint(position.gameIds.length);
  for (const id of position.gameIds) {
    writer.varint(id);
  }
}

export function readTreePosition(reader: ByteReader): TreePosition {
  const key = reader.u64();
  const gamesOffset = reader.offset64();
  const total = reader.varint();
  const moveCount = reader.varint();
  const moves: TreeMove[] = [];
  for (let i = 0; i < moveCount; i += 1) {
    moves.push({
      code: reader.u16(),
      white: reader.varint(),
      draws: reader.varint(),
      black: reader.varint(),
      averageRating: reader.varint(),
      lastYear: reader.varint(),
    });
  }
  const gameCount = reader.varint();
  const gameIds: number[] = [];
  for (let i = 0; i < gameCount; i += 1) {
    gameIds.push(reader.varint());
  }
  return { key, gamesOffset, total, moves, gameIds };
}

/** Every position of an inflated tree page. */
export function decodeTreePage(bytes: Uint8Array): TreePosition[] {
  const reader = new ByteReader(bytes);
  const positions: TreePosition[] = [];
  while (!reader.done) {
    positions.push(readTreePosition(reader));
  }
  return positions;
}

/** The position with `key` in an inflated tree page, or null. Stops early (records are sorted). */
export function findInTreePage(bytes: Uint8Array, key: bigint): TreePosition | null {
  const reader = new ByteReader(bytes);
  while (!reader.done) {
    const position = readTreePosition(reader);
    if (position.key === key) {
      return position;
    }
    if (position.key > key) {
      return null;
    }
  }
  return null;
}

export function writePlayerEntry(writer: ByteWriter, entry: PlayerEntry): void {
  writer.text(entry.searchKey);
  writer.text(entry.name);
  writer.varint(entry.fideId);
  writer.varint(entry.start);
  writer.varint(entry.count);
  writer.varint(entry.firstYear);
  writer.varint(entry.lastYear);
}

export function decodePlayersPage(bytes: Uint8Array): PlayerEntry[] {
  const reader = new ByteReader(bytes);
  const entries: PlayerEntry[] = [];
  while (!reader.done) {
    entries.push({
      searchKey: reader.text(),
      name: reader.text(),
      fideId: reader.varint(),
      start: reader.varint(),
      count: reader.varint(),
      firstYear: reader.varint(),
      lastYear: reader.varint(),
    });
  }
  return entries;
}

/** Lowercase, accent-free form of a player name used to sort and prefix-search the directory. */
export function playerSearchKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/ł/g, "l")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}

/** Byte-order comparison of two strings as UTF-8 (the order of players.bin). */
export function compareUtf8(a: string, b: string): number {
  // Code-unit order equals UTF-8 byte order except for surrogates; search keys never
  // contain astral characters after normalization in practice, and both the builder
  // and the reader use this same function, so the order is consistent either way.
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "2019.03.04" -> 20190304; unknown month/day parts are 0; 0 when the year is unknown. */
export function dateNumber(date?: string | null) {
  const match = /^(\d{4})(?:[.\-/](\d{2}|\?\?))?(?:[.\-/](\d{2}|\?\?))?/.exec(date ?? "");
  if (!match) {
    return 0;
  }
  const month = Number(match[2]) || 0;
  const day = Number(match[3]) || 0;
  return Number(match[1]) * 10000 + month * 100 + day;
}
