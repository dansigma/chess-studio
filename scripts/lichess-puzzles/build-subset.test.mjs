// scripts/lichess-puzzles/build-subset.test.mjs
// SIG-1042: fixture tests for the Lichess subset pipeline. Covers first-move
// application + SAN conversion, even-length and illegal drops, theme mapping
// and skipping, popularity/plays filters, determinism, and the odd-length /
// legal-replay invariant (plus compilePuzzle acceptance) on every output row.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { mapThemes } from "./map-themes.mjs";
import {
  OUTPUT_HEADER,
  balanceSubset,
  buildSubset,
  convertRow,
  pgTextArray,
  splitCsvLine,
  toOutputRow,
} from "./build-subset.mjs";
import { compilePuzzle } from "../../src/puzzles/engine.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "fixtures", "puzzles.csv");

function fixtureRecords() {
  const lines = readFileSync(fixture, "utf8").trim().split("\n");
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const fields = splitCsvLine(line);
    return Object.fromEntries(header.map((name, i) => [name, fields[i] ?? ""]));
  });
}

function byId(records) {
  return Object.fromEntries(records.map((record) => [record.PuzzleId, record]));
}

describe("map-themes", () => {
  it("maps the decided 1:1 subset and drops unmapped tags", () => {
    assert.deepEqual(mapThemes(["pin", "middlegame", "quietMove"]), ["pin", "middlegame"]);
    assert.deepEqual(mapThemes(["mate", "mateIn1", "backRankMate"]), ["mate", "mateIn1", "backRank"]);
    assert.deepEqual(mapThemes(["short", "long"]), []);
  });

  it("dedupes while preserving first-seen order", () => {
    assert.deepEqual(mapThemes(["fork", "fork", "middlegame"]), ["fork", "middlegame"]);
  });
});

describe("convertRow on the fixture", () => {
  it("has exactly 12 fixture rows", () => {
    assert.equal(fixtureRecords().length, 12);
  });

  it("applies the first UCI move and converts the rest to SAN", () => {
    const records = byId(fixtureRecords());
    const fork = convertRow(records["qgd-fork-01"]);
    assert.deepEqual(fork.moves, ["d5", "c4", "e6"]);
    assert.equal(fork.fen, "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1");
    assert.deepEqual(fork.themes, ["fork", "middlegame"]);
    const castle = convertRow(records["mixed-keep-06"]);
    assert.deepEqual(castle.moves, ["O-O"]);
    const promo = convertRow(records["promo-09"]);
    assert.deepEqual(promo.moves, ["c8=Q"]);
  });

  it("drops even-length remaining lines", () => {
    assert.equal(convertRow(byId(fixtureRecords())["even-drop-03"]), null);
  });

  it("drops illegal lines", () => {
    assert.equal(convertRow(byId(fixtureRecords())["illegal-drop-04"]), null);
  });

  it("skips puzzles with no mapped theme but keeps mixed mapped+unmapped", () => {
    const records = byId(fixtureRecords());
    assert.equal(convertRow(records["unmapped-skip-05"]), null);
    assert.deepEqual(convertRow(records["mixed-keep-06"]).themes, ["sacrifice", "middlegame"]);
    assert.deepEqual(convertRow(records["mate-scholar-10"]).themes, ["mate", "mateIn1", "backRank"]);
  });

  it("applies the popularity and plays filters", () => {
    const records = byId(fixtureRecords());
    assert.equal(convertRow(records["lowpop-filter-07"]), null);
    assert.equal(convertRow(records["lowplays-filter-08"]), null);
  });
});

describe("buildSubset on the fixture", () => {
  async function run(size = 100, seed = 1042) {
    const dir = mkdtempSync(join(tmpdir(), "puzzles-"));
    const out = join(dir, "out.csv");
    const stats = await buildSubset(fixture, out, size, seed);
    return { out, stats, text: readFileSync(out, "utf8") };
  }

  function parseOutput(text) {
    const lines = text.trim().split("\n");
    assert.equal(lines[0], OUTPUT_HEADER);
    return lines.slice(1);
  }

  it("keeps the 7 convertible rows and drops the other 5", async () => {
    const { stats, text } = await run();
    assert.equal(stats.candidates, 7);
    assert.equal(stats.picked, 7);
    const ids = parseOutput(text).map((line) => splitCsvLine(line)[0]);
    assert.deepEqual(
      [...ids].sort(),
      [
        "ital-pin-02",
        "mate-scholar-10",
        "mate2-line-11",
        "mixed-keep-06",
        "promo-09",
        "qgd-fork-01",
        "skewer-band-12",
      ].sort(),
    );
  });

  it("is deterministic with the same seed", async () => {
    const first = await run();
    const second = await run();
    assert.equal(second.text, first.text);
  });

  it("respects --size by balancing across bands and themes", async () => {
    const { text, stats } = await run(3);
    assert.equal(stats.picked, 3);
    assert.equal(parseOutput(text).length, 3);
  });

  it("every moves array has odd length and replays legally, accepted by compilePuzzle", async () => {
    const { text } = await run();
    for (const line of parseOutput(text)) {
      const [id, fen, movesLiteral] = splitCsvLine(line);
      const sans = [...movesLiteral.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
        m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
      );
      assert.ok(sans.length % 2 === 1, `${id} must have an odd line`);
      const chess = new Chess(fen);
      assert.ok(!chess.isCheck(), `${id} solver must not start in check`);
      for (const san of sans) {
        assert.ok(chess.move(san), `${id} rejected ${san}`);
      }
      const record = { id, fen, moves: sans, rating: 1500, themes: [] };
      compilePuzzle(record);
    }
  });

  it("emits Postgres array literals that survive a CSV round-trip", () => {
    assert.equal(pgTextArray(["O-O", "Qh4#"]), '{"O-O","Qh4#"}');
    assert.equal(pgTextArray(["exd8=Q+"]), '{"exd8=Q+"}');
    // Postgres text[] input accepts both {mate} and {"mate"}; the script
    // always quotes, so the round-trip preserves the quoted form.
    const row = toOutputRow({
      id: "x",
      fen: "f",
      moves: ["O-O"],
      rating: 1500,
      themes: ["mate"],
      popularity: 90,
      nbPlays: 600,
    });
    assert.deepEqual(splitCsvLine(row), ["x", "f", '{"O-O"}', "1500", '{"mate"}', "90", "600"]);
  });
});

describe("balanceSubset", () => {
  it("returns a seeded shuffle when everything fits", () => {
    const candidates = [
      { id: "a", rating: 1500, themes: ["fork"] },
      { id: "b", rating: 1600, themes: ["pin"] },
    ];
    const once = balanceSubset(candidates, 10, 7).map((c) => c.id);
    assert.deepEqual(balanceSubset(candidates, 10, 7).map((c) => c.id), once);
    assert.deepEqual([...once].sort(), ["a", "b"]);
  });
});
