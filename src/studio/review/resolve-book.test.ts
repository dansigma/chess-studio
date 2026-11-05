// SIG-1226: resolveBook checks the local book first and only falls back to the
// explorer route when the file is unavailable in time or the game is still in
// book at the last ply the file covers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { Chess } from "chess.js";
import { bookKey } from "@/src/chess/opening-book.ts";
import { encodeBook, encodeMove } from "@/src/chess/opening-book-format.ts";
import { runReview, type PositionEval, type ReviewEngine } from "@/src/chess/review-engine.ts";
import { STANDARD_START_FEN } from "./book-client.ts";
import { LOCAL_BOOK_RETRY_MS, _resetLocalBookForTest, localBookUrl, resolveBook } from "./resolve-book.ts";

const FILE = "opening-book-test-v1.bin.gz";
process.env.NEXT_PUBLIC_OPENING_BOOK_FILE = FILE;

const originalFetch = globalThis.fetch;
test.beforeEach(() => _resetLocalBookForTest());
test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function lineOf(sans: string): { fens: string[]; ucis: string[] } {
  const board = new Chess();
  const fens = [board.fen()];
  const ucis: string[] = [];
  for (const san of sans.split(" ")) {
    const move = board.move(san);
    ucis.push(move.from + move.to + (move.promotion ?? ""));
    fens.push(board.fen());
  }
  return { fens, ucis };
}

/** gzip bytes of a book that holds the first `theory` plies of `sans`. */
function bookFile(sans: string, theory: number, maxPly = 40): Uint8Array {
  const { fens, ucis } = lineOf(sans);
  const entries = ucis.slice(0, theory).map((uci, i) => ({ key: bookKey(fens[i]), move: encodeMove(uci) }));
  return gzipSync(encodeBook(entries, { maxPly }));
}

type Calls = { file: number; explorer: number };

function stubNetwork(options: {
  file?: () => Response | Promise<Response>;
  explorer?: () => Response | Promise<Response>;
}): Calls {
  const calls: Calls = { file: 0, explorer: 0 };
  globalThis.fetch = (async (url: string) => {
    if (String(url) === localBookUrl()) {
      calls.file += 1;
      return options.file ? options.file() : new Response("nope", { status: 404 });
    }
    if (String(url) === "/api/explorer/book") {
      calls.explorer += 1;
      return options.explorer ? options.explorer() : Response.json({ available: false }, { status: 503 });
    }
    throw new Error(`unexpected request ${String(url)}`);
  }) as typeof fetch;
  return calls;
}

const RUY = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6";
const bytesResponse = (bytes: Uint8Array) => () => new Response(bytes as BodyInit);

test("the local book answers without touching the explorer route", async () => {
  const calls = stubNetwork({ file: bytesResponse(bookFile(RUY, 5)) });
  const { ucis } = lineOf(RUY);
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, ucis), { plies: 5 });
  assert.deepEqual(calls, { file: 1, explorer: 0 });
  // The decoded book stays in memory for the session: no second download.
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, lineOf("e4 c5").ucis), { plies: 1 });
  assert.deepEqual(calls, { file: 1, explorer: 0 });
});

test("a whole game inside the book never needs the explorer", async () => {
  const calls = stubNetwork({ file: bytesResponse(bookFile(RUY, 8)) });
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, lineOf(RUY).ucis), { plies: 8 });
  assert.equal(calls.explorer, 0);
});

test("a missing file (404) falls back to the explorer, and the failure is remembered", async () => {
  const calls = stubNetwork({ explorer: () => Response.json({ available: true, plies: 4, partial: false, counts: [] }) });
  const { ucis } = lineOf(RUY);
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, ucis), { plies: 4 });
  assert.deepEqual(calls, { file: 1, explorer: 1 });
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, ucis), { plies: 4 });
  assert.deepEqual(calls, { file: 1, explorer: 2 }, "no second download attempt inside the retry window");
  // After the retry window the download is attempted again.
  await resolveBook(STANDARD_START_FEN, ucis, undefined, { now: () => Date.now() + LOCAL_BOOK_RETRY_MS + 1 });
  assert.equal(calls.file, 2);
});

test("missing file and explorer down means no book (null)", async () => {
  stubNetwork({});
  assert.equal(await resolveBook(STANDARD_START_FEN, lineOf(RUY).ucis), null);
});

test("a corrupt file is treated as unavailable", async () => {
  const calls = stubNetwork({
    file: bytesResponse(gzipSync(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]))),
    explorer: () => Response.json({ available: true, plies: 2 }),
  });
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, lineOf(RUY).ucis), { plies: 2 });
  assert.equal(calls.explorer, 1);
});

test("a download slower than the wait falls back to the explorer, and the next review uses the file", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls = stubNetwork({
    file: async () => {
      await gate;
      return new Response(bookFile(RUY, 6) as BodyInit);
    },
    explorer: () => Response.json({ available: true, plies: 3 }),
  });
  const { ucis } = lineOf(RUY);
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, ucis, undefined, { waitMs: 20 }), { plies: 3 });
  assert.deepEqual(calls, { file: 1, explorer: 1 });
  release();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, ucis), { plies: 6 });
  assert.deepEqual(calls, { file: 1, explorer: 1 }, "the download that was in flight is reused");
});

test("still in book where the file stops asks the explorer, which can only extend it", async () => {
  const sans = "e4 e5 Nf3 Nc6 Bb5 a6";
  const calls = stubNetwork({
    file: bytesResponse(bookFile(sans, 4, 4)),
    explorer: () => Response.json({ available: true, plies: 6 }),
  });
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, lineOf(sans).ucis), { plies: 6 });
  assert.equal(calls.explorer, 1);
});

test("explorer failure past the cap keeps the local result instead of dropping the book", async () => {
  const sans = "e4 e5 Nf3 Nc6 Bb5 a6";
  const calls = stubNetwork({ file: bytesResponse(bookFile(sans, 4, 4)) });
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, lineOf(sans).ucis), { plies: 4 });
  assert.equal(calls.explorer, 1);
});

test("a deviation inside the covered range never calls the explorer", async () => {
  const calls = stubNetwork({ file: bytesResponse(bookFile(RUY, 8, 8)) });
  const deviation = lineOf("e4 e5 Nf3 d6 Bc4 Nf6 O-O Be7 d4");
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, deviation.ucis), { plies: 3 });
  assert.equal(calls.explorer, 0);
});

test("non-standard starts and empty lines have no book and make no request", async () => {
  const calls = stubNetwork({});
  assert.deepEqual(await resolveBook("8/8/8/8/8/8/8/K6k w - - 0 1", ["a1a2"]), { plies: 0 });
  assert.deepEqual(await resolveBook(STANDARD_START_FEN, []), { plies: 0 });
  assert.deepEqual(calls, { file: 0, explorer: 0 });
});

test("a review marks book moves from the local book with the explorer route blocked", async () => {
  const calls = stubNetwork({ file: bytesResponse(bookFile(RUY, 6)) });
  const { fens, ucis } = lineOf(RUY);
  const engine: ReviewEngine = {
    async analyze(fen): Promise<PositionEval | null> {
      return fens.includes(fen) ? { depth: 12, lines: [{ whitePawns: 0.2, uci: null }] } : null;
    },
  };
  const analysed: string[] = [];
  const outcome = await runReview({
    fens,
    moves: ucis.map((uci) => ({ uci })),
    preset: "standard",
    engine: { analyze: (fen, options) => (analysed.push(fen), engine.analyze(fen, options)) },
    book: () => resolveBook(STANDARD_START_FEN, ucis),
  });
  assert.equal(outcome.status, "done");
  if (outcome.status !== "done") {
    return;
  }
  assert.deepEqual(outcome.rows.map((row) => row.label === "book"), [true, true, true, true, true, true, false, false]);
  assert.equal(analysed.length, fens.length - 6, "the engine starts at the last book position");
  assert.equal(calls.explorer, 0);
});

test("the shipped fixture book marks the Fischer-Spassky 1972 (game 6) opening with the explorer blocked", async () => {
  const fixture = readFileSync(new URL("../../../public/book/opening-book-fixture-v1.bin.gz", import.meta.url));
  process.env.NEXT_PUBLIC_OPENING_BOOK_FILE = "opening-book-fixture-v1.bin.gz";
  try {
    const calls = stubNetwork({ file: bytesResponse(new Uint8Array(fixture)) });
    const game6 = lineOf("c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4 c5 Qa3 Rc8 Bb5 a6");
    const result = await resolveBook(STANDARD_START_FEN, game6.ucis);
    assert.ok(result && result.plies >= 14 && result.plies < game6.ucis.length, `book plies ${result?.plies}`);
    assert.equal(calls.explorer, 0);
  } finally {
    process.env.NEXT_PUBLIC_OPENING_BOOK_FILE = FILE;
  }
});
