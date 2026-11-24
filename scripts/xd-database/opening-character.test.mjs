import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Chess } from "chess.js";
import { openingAnchorKey } from "../../src/lib/line-opening.ts";
import { measureAxes, pawnStructure, percentileProfiles } from "./opening-character-lib.mjs";

const closed = pawnStructure("4k3/8/8/3pp3/3PP3/8/8/4K3");
const open = pawnStructure("4k3/8/8/2p5/3P4/8/8/4K3");
const game = (overrides = {}) => ({
  result: "1-0", moves: Array(40).fill("e2e4"), anchorPly: 1, structure: [closed],
  queenlessPly: null, ...overrides,
});

test("measures French-like pawn rams, file asymmetry and pawn tension", () => {
  assert.deepEqual(closed, { locked: 2, asymmetric: 0, tension: 2 });
  assert.deepEqual(open, { locked: 0, asymmetric: 2, tension: 1 });
  assert.ok(measureAxes([game()]).closed > measureAxes([game({ structure: [open] })]).closed);
});

test("measures outcomes and early queen removals among eligible games", () => {
  const early = game({ queenlessPly: 12, moves: Array(12).fill("e2e4"), result: "1/2-1/2" });
  const short = game({ moves: Array(38).fill("e2e4"), result: "0-1" });
  const sample = [...Array(15).fill(early), ...Array(5).fill(game()), ...Array(10).fill(short)];
  const axes = measureAxes(sample);
  assert.equal(axes.decisive, 0.5);
  assert.equal(axes.whiteScore, 12.5 / 30);
  assert.equal(axes.endgame, 0.75);
  assert.equal(measureAxes(sample.slice(1)).endgame, null);
});

test("breadth increases when sampled games split into many continuations", () => {
  const main = Array(6).fill(game({ moves: ["e2e4", "e7e5", "g1f3"] }));
  const systems = ["e7e5", "e7e6", "c7c5", "c7c6", "d7d6", "d7d5"]
    .map((reply) => game({ moves: ["e2e4", reply] }));
  assert.equal(measureAxes(main).breadth, -2);
  assert.equal(measureAxes(systems).breadth + 0, 0);
  assert.equal(measureAxes(main.slice(0, 3)).breadth + 0, 0);
});

test("ranks eligible anchors, averaging ties and skipping null axes", () => {
  const samples = new Map([
    ["closed", Array(30).fill(game())],
    ["tie", Array(30).fill(game())],
    ["open", Array(30).fill(game({ result: "1/2-1/2", structure: [open], moves: ["e2e4"] }))],
    ["sparse", Array(29).fill(game())],
  ]);
  const profiles = percentileProfiles(samples);
  assert.deepEqual(profiles.closed, { n: 30, decisive: 75, closed: 75, breadth: 25, endgame: 50 });
  assert.deepEqual(profiles.tie, profiles.closed);
  assert.deepEqual(profiles.open, { n: 30, decisive: 0, closed: 0, breadth: 100, endgame: null });
  assert.equal(profiles.sparse, undefined);
  assert.equal(percentileProfiles(new Map([["only", samples.get("closed")]])).only.closed, 50);
});

function pgn(round, moves, { result = "1-0", date = "2010.01.01", elo = 2400, site = "Club" } = {}) {
  return `[Event "Open"]
[Site "${site}"]
[Date "${date}"]
[Round "${round}"]
[White "A, Alice"]
[Black "B, Bob"]
[WhiteElo "${elo}"]
[BlackElo "2400"]
[Result "${result}"]

${moves} ${result}

`;
}

function anchor(...sans) {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return openingAnchorKey(chess.fen());
}

test("CLI streams, filters and caps a synthetic PGN release", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "opening-character-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const inputs = [join(dir, "first.pgn"), join(dir, "second.pgn")];
  const out = join(dir, "profiles.json");
  const common = Array.from({ length: 205 }, (_, i) => pgn(i + 1, "1. e4 e5 2. Nf3 Nc6", {
    result: i % 2 ? "1-0" : "1/2-1/2",
  }));
  const queenTrades = Array.from({ length: 30 }, (_, i) =>
    pgn(i + 1, i < 20 ? "1. d4 d5 2. e4 dxe4 3. Nc3 e5 4. dxe5 Qxd1+ 5. Kxd1" : "1. d4 d5"));
  const rare = Array.from({ length: 29 }, (_, i) => pgn(i + 1, "1. c4 c5"));
  writeFileSync(inputs[0], [...common.slice(0, 100), ...queenTrades, ...rare].join(""));
  writeFileSync(inputs[1], [
    ...common.slice(99), pgn(30, "1. c4 c5", { elo: 2299 }),
    pgn(31, "1. c4 c5", { date: "1999.12.31" }), pgn(32, "1. c4 c5", { site: "lichess.org" }),
    pgn(33, "1. c4 c5 2. Qh8"), common[0],
  ].join(""));
  const run = (sources) => {
    execFileSync(process.execPath, [
      "--import", "./scripts/test-resolve.mjs", "scripts/xd-database/opening-character.mjs",
      ...sources, "--out", out,
    ]);
    return JSON.parse(readFileSync(out, "utf8"));
  };
  const data = run(inputs);
  assert.equal(data.version, 1);
  assert.equal(data.params.minElo, 2300);
  assert.equal(data.profiles[anchor("e4")].n, 200);
  assert.equal(data.profiles[anchor("e4", "e5")].n, 200);
  assert.equal(data.profiles[anchor("d4")].endgame, 50);
  assert.equal(data.profiles[anchor("c4")], undefined);
  assert.deepEqual(run(inputs.toReversed()).profiles, data.profiles);
});
