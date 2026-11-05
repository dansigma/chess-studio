// SIG-1221: UCI parsing, the client against a scripted fake engine, ground-truth
// plumbing without Stockfish, and a real-Stockfish smoke test when one exists.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { addGroundTruth, cacheKey, main as groundTruthMain, pvToSan } from "./ground-truth.mjs";
import { toJsonl } from "./schema.mjs";
import { UciEngine, collectLines, findStockfish, negateScore, parseInfoLine, scoreToCp } from "./uci.mjs";
import { here, fixtureItems } from "./test-helpers.mjs";

const FAKE = join(here, "fixtures", "fake-uci.mjs");

describe("parseInfoLine", () => {
  it("reads depth, multipv, cp score and pv", () => {
    const info = parseInfoLine("info depth 18 seldepth 25 multipv 2 score cp -37 nodes 100 nps 5000 hashfull 3 time 12 pv e2e4 e7e5 g1f3");
    assert.deepEqual(info, { depth: 18, multipv: 2, score: { cp: -37 }, bound: null, pv: ["e2e4", "e7e5", "g1f3"] });
  });

  it("reads mate scores and bounds", () => {
    assert.deepEqual(parseInfoLine("info depth 5 score mate -2 pv a1a2").score, { mate: -2 });
    assert.equal(parseInfoLine("info depth 5 score cp 40 lowerbound pv a1a2").bound, "lowerbound");
    assert.equal(parseInfoLine("info depth 5 score cp 40 upperbound pv a1a2").bound, "upperbound");
  });

  it("defaults multipv to 1 and ignores lines without a score or pv", () => {
    assert.equal(parseInfoLine("info depth 3 score cp 1 pv a1a2").multipv, 1);
    assert.equal(parseInfoLine("info string NNUE enabled"), null);
    assert.equal(parseInfoLine("info depth 3 currmove e2e4 currmovenumber 1"), null);
    assert.equal(parseInfoLine("bestmove e2e4"), null);
    assert.equal(parseInfoLine("info depth 3 score cp abc pv e2e4"), null);
  });
});

describe("scores and lines", () => {
  it("compares mates above any centipawn value and nearer mates above farther", () => {
    assert.ok(scoreToCp({ mate: 3 }) > scoreToCp({ cp: 5000 }));
    assert.ok(scoreToCp({ mate: 2 }) > scoreToCp({ mate: 5 }));
    assert.ok(scoreToCp({ mate: -2 }) < scoreToCp({ mate: -5 }));
    assert.equal(scoreToCp(null), null);
  });

  it("negates scores for the other side", () => {
    assert.deepEqual(negateScore({ cp: 30 }), { cp: -30 });
    assert.deepEqual(negateScore({ mate: -1 }), { mate: 1 });
    assert.equal(negateScore(null), null);
  });

  it("keeps the deepest exact line per MultiPV rank", () => {
    const lines = collectLines(
      [
        "info depth 1 multipv 1 score cp 10 pv a b",
        "info depth 2 multipv 1 score cp 99 lowerbound pv a b",
        "info depth 2 multipv 2 score cp 5 pv c d",
        "info depth 2 multipv 1 score cp 30 pv a b c",
      ].map(parseInfoLine),
    );
    assert.deepEqual(lines.map((l) => [l.rank, l.depth, l.score]), [[1, 2, { cp: 30 }], [2, 2, { cp: 5 }]]);
  });
});

describe("UciEngine with a fake engine process", () => {
  it("handshakes, runs MultiPV 3 and returns lines from the side to move", async () => {
    const engine = await UciEngine.start(FAKE);
    assert.equal(engine.name, "FakeFish 1.0");
    const result = await engine.analyze("4k3/8/8/8/8/8/8/4K3 w - - 0 1", { depth: 4, multipv: 3 });
    await engine.quit();
    assert.equal(result.bestmove, "e2e4");
    assert.deepEqual(result.lines.map((l) => [l.rank, l.score, l.pv[0]]), [
      [1, { cp: 30 }, "e2e4"],
      [2, { cp: 20 }, "d2d4"],
      [3, { mate: 3 }, "g1f3"],
    ]);
  });

  it("supports searchmoves and positions with no move", async () => {
    const engine = await UciEngine.start(FAKE);
    const only = await engine.analyze("4k3/8/8/8/8/8/8/4K3 w - - 0 1", { depth: 4, multipv: 1, searchmoves: ["a2a3"] });
    assert.deepEqual(only.lines.map((l) => [l.score, l.pv]), [[{ cp: -40 }, ["a2a3", "e7e5"]]]);
    const none = await engine.analyze("MATED", { depth: 4, multipv: 1 });
    await engine.quit();
    assert.equal(none.bestmove, null);
  });

  it("fails clearly when the binary does not start", async () => {
    await assert.rejects(UciEngine.start(join(here, "fixtures", "missing-engine")), /ENOENT|exited/);
  });
});

describe("ground truth plumbing", () => {
  const item = fixtureItems().items.find((i) => i.id.endsWith(".g15.m3"));

  it("normalises scores to the mover and flags author disagreement (fake engine)", async () => {
    const engine = await UciEngine.start(FAKE);
    const source = { cache: { version: 1, engine: engine.name, entries: {} }, getEngine: async () => engine, dirty: 0 };
    const enriched = await addGroundTruth(item, source, { depth: 4, multipv: 3, thresholdCp: 50 });
    await engine.quit();
    assert.equal(enriched.engine.engine, "FakeFish 1.0");
    assert.equal(enriched.engine.bestmove, "e2e4");
    assert.deepEqual(enriched.engine.evalBefore, { cp: 30 });
    assert.deepEqual(enriched.engine.evalAfter.score, { cp: -30 }, "the position after the move is scored for the opponent, then negated");
    assert.deepEqual(enriched.engine.authorMoveScore, { cp: -40 }, "author move outside the top lines is searched with searchmoves");
    assert.ok(enriched.authorDisagrees.flag);
    assert.ok(Object.keys(source.cache.entries).length >= 3);
    assert.ok(cacheKey("a b c d e f", 4, 3).startsWith("a b c d|d4|pv3"));
  });

  it("uses the cache and never starts an engine when everything is cached", async () => {
    const { FIXTURE_CACHE, FIXTURE_DEPTH } = await import("./test-helpers.mjs");
    const { loadCache } = await import("./ground-truth.mjs");
    const source = { cache: loadCache(FIXTURE_CACHE), getEngine: async () => assert.fail("engine must not start") };
    const enriched = await addGroundTruth(item, source, { depth: FIXTURE_DEPTH, multipv: 3, thresholdCp: 50 });
    assert.ok(enriched.engine.lines.length > 0);
    assert.ok(enriched.engine.lines[0].pvSan.length > 0);
    assert.equal(typeof enriched.engine.lossCp, "number");
  });

  it("converts a PV to SAN and stops at the first illegal move", () => {
    assert.deepEqual(pvToSan("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", ["e2e4", "e7e5", "a1a5"]), ["e4", "e5"]);
  });

  it("the CLI fails with a clear message when a position needs an engine and none exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "valset-nosf-"));
    const itemsPath = join(dir, "items.jsonl");
    writeFileSync(itemsPath, toJsonl(fixtureItems().items.slice(0, 2)));
    const saved = process.env.STOCKFISH_PATH;
    process.env.STOCKFISH_PATH = join(dir, "no-such-stockfish");
    const messages = [];
    const error = console.error;
    console.error = (message) => messages.push(String(message));
    try {
      const code = await groundTruthMain([itemsPath, "--out", join(dir, "out.jsonl"), "--cache", join(dir, "cache.json"), "--depth", "4"]);
      assert.equal(code, 1);
    } finally {
      console.error = error;
      if (saved === undefined) delete process.env.STOCKFISH_PATH;
      else process.env.STOCKFISH_PATH = saved;
    }
    assert.match(messages.join("\n"), /No Stockfish binary found/);
  });

  it("findStockfish honours an explicit path, the env var and returns null for missing ones", () => {
    assert.equal(findStockfish(FAKE), FAKE);
    assert.equal(findStockfish(join(here, "nope")), null);
    assert.equal(findStockfish(undefined, { STOCKFISH_PATH: FAKE, PATH: "" }), FAKE);
    assert.equal(findStockfish(undefined, { STOCKFISH_PATH: join(here, "nope"), PATH: "" }), null);
  });
});

const realStockfish = findStockfish();
describe("real Stockfish", { skip: realStockfish ? false : "no Stockfish binary on this machine" }, () => {
  it("finds the mate in one at depth 6", async () => {
    const engine = await UciEngine.start(realStockfish);
    const result = await engine.analyze("4r1k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", { depth: 6, multipv: 3 });
    await engine.quit();
    assert.equal(result.bestmove, "e1e8");
    assert.deepEqual(result.lines[0].score, { mate: 1 });
  });
});
