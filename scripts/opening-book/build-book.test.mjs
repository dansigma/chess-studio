// scripts/opening-book/build-book.test.mjs
// SIG-1226: the offline opening book pipeline on hand-made and synthetic PGN:
// speed derivation, header filters, the theory rule (position < 100, move < 20,
// move < 1%), spill-to-disk equivalence, an independent recount oracle, and the
// round trip into the browser decoder.
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { BOOK_RULE } from "../../src/chess/opening-theory.ts";
import { bookKey } from "../../src/chess/opening-book.ts";
import { decodeBook, encodeMove } from "../../src/chess/opening-book-format.ts";
import { gunzipSync } from "node:zlib";
import { buildBook, parseArgs, appManifestSource } from "./build-book.mjs";
import { CountStore, selectTheory } from "./counts.mjs";
import { syntheticPgn } from "./generate-synthetic-pgn.mjs";
import { headerRejection, lastMoveNumber, linesOf, readGames, sanTokens, speedOf } from "./pgn.mjs";

const OPTIONS = { minElo: 2300, maxPly: 40, maxGames: Infinity, maxMapEntries: 3_000_000, tmpDir: null, months: ["2024-01"], buildDate: "2024-02-01T00:00:00.000Z", version: 1 };

function pgn(sans, overrides = {}) {
  const headers = { Event: "Rated Blitz game", Result: "1-0", WhiteElo: "2400", BlackElo: "2350", TimeControl: "180+0", Termination: "Normal", ...overrides };
  const moves = sans.split(" ");
  const text = moves.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san} { [%clk 0:03:00] }` : `${(i - 1) / 2 + 1}... ${san} { [%clk 0:03:00] }`)).join(" ");
  return `${Object.entries(headers).map(([k, v]) => `[${k} "${v}"]`).join("\n")}\n\n${text} ${headers.Result}\n\n`;
}

function source(text) {
  return linesOf(Readable.from([text]));
}

const TEN_MOVES = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7"; // 20 plies

describe("speedOf (Lichess: base + 40 * increment)", () => {
  it("buckets at the documented cut-offs", () => {
    const cases = { "15+0": "ultraBullet", "29+0": "ultraBullet", "30+0": "bullet", "60+0": "bullet", "179+0": "bullet", "180+0": "blitz", "180+1": "blitz", "300+3": "blitz", "479+0": "blitz", "480+0": "rapid", "600+5": "rapid", "1499+0": "rapid", "1500+0": "classical", "1800+20": "classical", "0+3": "bullet", "60+3": "blitz" };
    for (const [timeControl, speed] of Object.entries(cases)) {
      assert.equal(speedOf(timeControl), speed, timeControl);
    }
  });
  it("untimed or malformed time controls have no speed", () => {
    for (const timeControl of ["-", "", undefined, "1/86400", "abc"]) {
      assert.equal(speedOf(timeControl), null);
    }
  });
});

describe("header filter", () => {
  const ok = { WhiteElo: "2300", BlackElo: "2301", TimeControl: "300+0", Result: "1-0" };
  it("passes strong standard blitz/rapid/classical", () => {
    assert.equal(headerRejection(ok, 2300), null);
    assert.equal(headerRejection({ ...ok, TimeControl: "600+0" }, 2300), null);
    assert.equal(headerRejection({ ...ok, TimeControl: "1800+0" }, 2300), null);
  });
  it("rejects a player under the bar (either side), missing ratings, bullet, correspondence, variants, aborted", () => {
    assert.equal(headerRejection({ ...ok, WhiteElo: "2299" }, 2300), "elo");
    assert.equal(headerRejection({ ...ok, BlackElo: "1800" }, 2300), "elo");
    assert.equal(headerRejection({ ...ok, BlackElo: "?" }, 2300), "elo");
    assert.equal(headerRejection({ ...ok, TimeControl: "60+0" }, 2300), "speed");
    assert.equal(headerRejection({ ...ok, TimeControl: "15+0" }, 2300), "speed");
    assert.equal(headerRejection({ ...ok, TimeControl: "-" }, 2300), "speed");
    assert.equal(headerRejection({ ...ok, Variant: "Chess960" }, 2300), "variant");
    assert.equal(headerRejection({ ...ok, Termination: "Abandoned" }, 2300), "aborted");
    assert.equal(headerRejection({ ...ok, Result: "*" }, 2300), "aborted");
  });
});

describe("PGN reading", () => {
  it("reads games with clock comments, NAGs and results", async () => {
    const text = pgn("e4 e5 Nf3") + pgn("d4 d5", { WhiteElo: "1500" });
    const games = [];
    for await (const game of readGames(source(text))) {
      games.push(game);
    }
    assert.equal(games.length, 2);
    assert.equal(games[1].headers.WhiteElo, "1500");
    assert.deepEqual(sanTokens(games[0].movetext), ["e4", "e5", "Nf3"]);
    assert.deepEqual(sanTokens("1. e4 $1 { c } 1... e5?! 2. Nf3 (2. f4) Nc6 1/2-1/2"), ["e4", "e5", "Nf3", "Nc6"]);
    assert.deepEqual(sanTokens(games[0].movetext, 2), ["e4", "e5"]);
    assert.equal(lastMoveNumber(TEN_MOVES.split(" ").map((s, i) => (i % 2 ? s : `${i / 2 + 1}. ${s}`)).join(" ")), 10);
    assert.equal(lastMoveNumber(games[0].movetext), 2);
  });
});

describe("theory rule", () => {
  function recordsFor(total, moves) {
    return [...moves.map(([move, count]) => ({ key: 1n, move, count })), { key: 1n, move: 0xffff, count: total }];
  }
  it("position under 100 games is never theory", () => {
    assert.equal(selectTheory(recordsFor(99, [[1, 99]]), BOOK_RULE).entries.length, 0);
    assert.equal(selectTheory(recordsFor(100, [[1, 100]]), BOOK_RULE).entries.length, 1);
  });
  it("a move under 20 games is not theory even above 1%", () => {
    const result = selectTheory(recordsFor(300, [[1, 281], [2, 19]]), BOOK_RULE); // 19 / 300 = 6.3%
    assert.deepEqual(result.entries.map((entry) => entry.move), [1]);
  });
  it("a move under 1% of the position is not theory even above 20 games", () => {
    const result = selectTheory(recordsFor(3000, [[1, 2910], [2, 29], [3, 30], [4, 31]]), BOOK_RULE); // 0.97%, 1.0%, 1.03%
    assert.deepEqual(result.entries.map((entry) => entry.move), [1, 3, 4]);
  });
  it("20 games and 20% pass; the 1% share is checked on top of the 20-game floor", () => {
    const result = selectTheory(recordsFor(100, [[1, 80], [2, 20]]), BOOK_RULE);
    assert.equal(result.entries.length, 2);
    // 1% of 1000 is only 10 games: the 20-game floor still decides.
    assert.deepEqual(selectTheory(recordsFor(1000, [[1, 981], [2, 19]]), BOOK_RULE).entries.map((entry) => entry.move), [1]);
  });
});

describe("CountStore", () => {
  it("merges spilled runs exactly like the in-memory count", () => {
    const feed = (store) => {
      let seed = 11;
      for (let i = 0; i < 5000; i += 1) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        store.add(BigInt(seed % 97) * 2n ** 57n + 5n, (seed >> 8) % 6);
      }
    };
    const plain = new CountStore();
    feed(plain);
    const expected = [...plain.merged()];
    const spilling = new CountStore({ maxEntries: 40 });
    feed(spilling);
    assert.ok(spilling.spills > 10, `spilled ${spilling.spills} times`);
    try {
      assert.deepEqual([...spilling.merged()], expected);
    } finally {
      spilling.dispose();
    }
    // Sorted by (key, move) with the per-position total last.
    for (let i = 1; i < expected.length; i += 1) {
      const a = expected[i - 1];
      const b = expected[i];
      assert.ok(a.key < b.key || (a.key === b.key && a.move < b.move));
    }
  });
});

describe("buildBook", () => {
  // 3000 games: 1.e4 2975 times, 1.d4 25 times (0.83%: under 1%), then 20 plies of line.
  function mixedText() {
    let text = "";
    for (let i = 0; i < 2975; i += 1) {
      text += pgn(TEN_MOVES);
    }
    for (let i = 0; i < 25; i += 1) {
      text += pgn("d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Rc1 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5");
    }
    return text;
  }

  it("keeps theory by the shared rule and the decoded book answers by position", async () => {
    const result = await buildBook([source(mixedText())], OPTIONS);
    assert.equal(result.stats.kept, 3000);
    const book = decodeBook(gunzipSync(result.gz));
    assert.equal(book.maxPly, 40);
    const board = new Chess();
    for (const san of TEN_MOVES.split(" ")) {
      const key = bookKey(board.fen());
      const move = board.move(san);
      assert.equal(book.hasMove(key, move.from + move.to + (move.promotion ?? "")), true, san);
    }
    const keys = [bookKey(new Chess().fen())];
    assert.equal(book.hasMove(keys[0], "d2d4"), false, "25 of 3000 games is 0.83%");
    assert.equal(result.manifest.positions, 20);
    assert.equal(result.manifest.moves, 20);
    assert.equal(result.manifest.games, 3000);
    assert.equal(result.manifest.builtAt, "2024-02-01T00:00:00.000Z");
    assert.deepEqual(result.manifest.thresholds, { minPositionGames: 100, minMoveGames: 20, minMoveShare: 0.01 });
    assert.equal(result.manifest.gzipBytes, result.gz.length);
    assert.match(result.manifest.sha256, /^[0-9a-f]{64}$/);
  });

  it("filters games before counting", async () => {
    // 150 qualifying games, plus 400 that must not count (each would otherwise lift 1.d4 to theory).
    let text = "";
    for (let i = 0; i < 150; i += 1) {
      text += pgn(TEN_MOVES);
    }
    const junk = "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Rc1 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5";
    for (let i = 0; i < 60; i += 1) {
      text += pgn(junk, { WhiteElo: "2299" });
      text += pgn(junk, { BlackElo: "2000" });
      text += pgn(junk, { TimeControl: "60+0" });
      text += pgn(junk, { TimeControl: "-" });
      text += pgn(junk, { Termination: "Abandoned" });
      text += pgn(junk, { Variant: "Chess960" });
      text += pgn(junk.split(" ").slice(0, 16).join(" ")); // 8 full moves: under 10
    }
    const result = await buildBook([source(text)], OPTIONS);
    assert.equal(result.stats.kept, 150);
    assert.equal(result.stats.tooShort, 60);
    assert.deepEqual(result.stats.rejected, { elo: 120, speed: 120, variant: 60, aborted: 60 });
    assert.equal(decodeBook(result.raw).hasMove(bookKey(new Chess().fen()), "d2d4"), false);
    assert.equal(decodeBook(result.raw).hasMove(bookKey(new Chess().fen()), "e2e4"), true);
  });

  it("counts only up to the ply cap", async () => {
    let text = "";
    for (let i = 0; i < 120; i += 1) {
      text += pgn(TEN_MOVES);
    }
    const capped = await buildBook([source(text)], { ...OPTIONS, maxPly: 6 });
    assert.equal(capped.manifest.moves, 6);
    assert.equal(decodeBook(capped.raw).maxPly, 6);
    const full = await buildBook([source(text)], OPTIONS);
    assert.equal(full.manifest.moves, 20);
  });

  it("--max-games stops early", async () => {
    let text = "";
    for (let i = 0; i < 500; i += 1) {
      text += pgn(TEN_MOVES);
    }
    const result = await buildBook([source(text)], { ...OPTIONS, maxGames: 99 });
    assert.equal(result.stats.kept, 99);
    assert.equal(result.manifest.moves, 0, "99 games is under the 100-game position rule");
  });

  it("spilling to temp files gives the same bytes as counting in memory, and agrees with an independent recount", async () => {
    const chunks = [...syntheticPgn({ games: 700, seed: 1226 })].join("");
    // Weaken nothing: the oracle recounts from the same kept games with the same rule.
    const inMemory = await buildBook([source(chunks)], OPTIONS);
    const spilled = await buildBook([source(chunks)], { ...OPTIONS, maxMapEntries: 500 });
    assert.ok(spilled.stats.spills > 3, `spills ${spilled.stats.spills}`);
    assert.deepEqual(Buffer.from(spilled.raw), Buffer.from(inMemory.raw));
    assert.deepEqual({ ...spilled.manifest, sha256: 0, gzipBytes: 0 }, { ...inMemory.manifest, sha256: 0, gzipBytes: 0 });

    const book = decodeBook(inMemory.raw);
    const positions = new Map();
    for await (const game of readGames(source(chunks))) {
      if (headerRejection(game.headers, 2300) || lastMoveNumber(game.movetext) < 10) {
        continue;
      }
      const board = new Chess();
      for (const san of sanTokens(game.movetext, 40)) {
        const key = bookKey(board.fen());
        const move = board.move(san);
        const uci = move.from + move.to + (move.promotion ?? "");
        const entry = positions.get(key) ?? { total: 0, moves: new Map() };
        entry.total += 1;
        entry.moves.set(uci, (entry.moves.get(uci) ?? 0) + 1);
        positions.set(key, entry);
      }
    }
    let expected = 0;
    for (const [key, entry] of positions) {
      for (const [uci, count] of entry.moves) {
        const theory = entry.total >= 100 && count >= 20 && count >= 0.01 * entry.total;
        assert.equal(book.hasMove(key, uci), theory, `${key} ${uci} ${count}/${entry.total}`);
        expected += theory ? 1 : 0;
      }
    }
    assert.equal(book.entryCount, expected);
    assert.ok(expected > 0, "the synthetic mix must produce some theory");
  });

  it("is deterministic for the same input", async () => {
    const text = mixedText();
    const a = await buildBook([source(text)], OPTIONS);
    const b = await buildBook([source(text)], OPTIONS);
    assert.deepEqual(Buffer.from(a.gz), Buffer.from(b.gz));
    assert.equal(a.manifest.sha256, b.manifest.sha256);
    assert.equal(encodeMove("e2e4") >= 0, true);
  });
});

describe("CLI helpers", () => {
  it("parses flags and defaults", () => {
    const args = parseArgs(["a.pgn.zst", "-", "--out-dir", "out", "--version", "3", "--max-games", "10", "--months", "2024-01,2024-02"]);
    assert.deepEqual(args.inputs, ["a.pgn.zst", "-"]);
    assert.equal(args.version, 3);
    assert.equal(args.maxGames, 10);
    assert.equal(args.minElo, 2300);
    assert.equal(args.maxPly, 40);
    assert.deepEqual(args.months, ["2024-01", "2024-02"]);
    assert.throws(() => parseArgs(["a.pgn"]), /usage/);
    assert.throws(() => parseArgs(["a.pgn", "--out-dir", "o", "--version", "x"]), /positive integer/);
    assert.throws(() => parseArgs(["a.pgn", "--out-dir", "o", "--version", "1", "--max-ply", "300"]), /at most 255/);
    assert.throws(() => parseArgs(["a.pgn", "--bogus"]), /usage/);
  });
  it("writes the app manifest module", () => {
    const source = appManifestSource({ version: 2, file: "opening-book-v2.bin.gz" });
    assert.match(source, /export const OPENING_BOOK_MANIFEST = \{/);
    assert.match(source, /"version": 2/);
  });
});
