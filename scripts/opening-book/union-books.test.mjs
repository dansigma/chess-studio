// scripts/opening-book/union-books.test.mjs
// SIG-1229: merging books, the merged manifest and the app manifest module.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import { Chess } from "chess.js";
import { bookKey } from "../../src/chess/opening-book.ts";
import { decodeBook, encodeBook, encodeMove } from "../../src/chess/opening-book-format.ts";
import { appManifestSource, buildBook, writeOutputs } from "./build-book.mjs";
import { iterateBook, manifestPathFor, runUnion, unionBooks } from "./union-books.mjs";
import { ENGLISH, QGD, TEN_MOVES, many, otb, pgn, source, who } from "./test-helpers.mjs";

const START = new Chess().fen();
const has = (book, fen, uci) => book.hasMove(bookKey(fen), uci);
const base = { version: 3, maxPly: 40, buildDate: "2026-11-01T00:00:00.000Z" };

async function threeBuilds() {
  // lichess: 1.e4 line (150 games); masters: 1.d4 line by 150 different players, plus the e4 line
  // by 5 players; correspondence: 1.c4 line by 150 different players.
  const lichess = await buildBook([source(many(150, (i) => pgn(TEN_MOVES, { Site: `https://lichess.org/${i}` })))], { ...base, profile: "lichess", months: ["2026-05", "2026-06"], files: ["a.pgn.zst"] });
  const masters = await buildBook(
    [source(many(150, (i) => otb(QGD, { White: `${who("W", i)}, W`, Black: `${who("B", i)}, B`, Round: String(i) })) + many(150, (i) => otb(TEN_MOVES, { White: `${who("M", i % 5)}, M`, Black: `${who("N", i)}, N`, Date: "2010.01.01", Round: String(i) })))],
    { ...base, profile: "masters", files: ["chess-results.pgn"] },
  );
  const corr = await buildBook(
    [source(many(150, (i) => otb(ENGLISH, { Event: "ICCF Webserver Open", Site: "ICCF", White: `${who("C", i)}, C`, Black: `${who("D", i)}, D`, Round: String(i) })))],
    { ...base, profile: "correspondence", files: ["aj-corr.pgn"] },
  );
  return { lichess, masters, corr };
}

const asInput = (result) => ({ raw: result.raw, manifest: result.manifest });

describe("unionBooks", () => {
  it("a pair is in the output if it is theory in any input; the merged manifest lists every source", async () => {
    const { lichess, masters, corr } = await threeBuilds();
    const union = unionBooks([lichess, masters, corr].map(asInput), base);
    const book = decodeBook(union.raw);
    // e4 line: from the lichess book (and the masters book has the e4 line's replies by many players)
    assert.equal(has(book, START, "e2e4"), true);
    assert.equal(has(book, START, "d2d4"), true, "masters");
    assert.equal(has(book, START, "c2c4"), true, "correspondence");
    // every pair of every input is in the union
    for (const result of [lichess, masters, corr]) {
      for (const { key, moves } of iterateBook(result.raw)) {
        for (const move of moves) {
          assert.ok(book.movesFor(key).includes(decodeUci(move)), `${key} ${move}`);
        }
      }
    }
    // nothing outside the inputs
    const inputPairs = new Set([lichess, masters, corr].flatMap((result) => [...iterateBook(result.raw)].flatMap(({ key, moves }) => moves.map((move) => `${key}:${move}`))));
    assert.equal(union.manifest.moves, inputPairs.size);
    assert.equal(book.entryCount, inputPairs.size);

    const { manifest } = union;
    assert.equal(manifest.version, 3);
    assert.equal(manifest.file, "opening-book-v3.bin.gz");
    assert.equal(manifest.profile, "union");
    assert.equal(manifest.games, lichess.manifest.games + masters.manifest.games + corr.manifest.games);
    assert.equal(manifest.gamesRead, 150 + 300 + 150 - 0);
    assert.deepEqual(manifest.months, ["2026-05", "2026-06"]);
    assert.equal(manifest.maxPly, 40);
    assert.equal(manifest.bytes, union.raw.length);
    assert.equal(manifest.gzipBytes, union.gz.length);
    assert.equal(manifest.sources.length, 3);
    assert.deepEqual(manifest.sources.map((source) => source.profile), ["lichess", "masters", "correspondence"]);
    assert.deepEqual(manifest.sources.map((source) => source.files), [["a.pgn.zst"], ["chess-results.pgn"], ["aj-corr.pgn"]]);
    assert.equal(manifest.sources[1].thresholds.minDistinctPlayers, 5);
    assert.equal(manifest.sources[1].minElo, 2100);
    assert.equal(manifest.sources[2].minElo, 2300);
    assert.equal(manifest.sources[0].games, 150);
    for (const entry of manifest.sources) {
      assert.ok(Number.isInteger(entry.uniqueMoves));
      assert.equal(typeof entry.sha256, "string");
    }
    assert.ok(manifest.sources[2].uniqueMoves > 0, "the English line is only in the correspondence book");
  });

  it("carries license and attribution per source and lists the distinct licenses", async () => {
    const { lichess, masters, corr } = await threeBuilds();
    masters.manifest.license = "CC BY-SA 4.0";
    masters.manifest.attribution = "Lumbra's GigaBase, Lichess Broadcast subset";
    corr.manifest.license = "CC BY-SA 4.0";
    const { manifest } = unionBooks([lichess, masters, corr].map(asInput), base);
    assert.deepEqual(manifest.licenses, ["CC BY-SA 4.0"]);
    assert.equal(manifest.sources[1].attribution, "Lumbra's GigaBase, Lichess Broadcast subset");
    assert.equal(manifest.sources[0].license, undefined);
  });

  it("is deterministic and independent of the order of inputs, apart from the sources list", async () => {
    const { lichess, masters, corr } = await threeBuilds();
    const a = unionBooks([lichess, masters, corr].map(asInput), base);
    const b = unionBooks([corr, lichess, masters].map(asInput), base);
    assert.deepEqual(Buffer.from(a.raw), Buffer.from(b.raw));
  });

  it("takes the largest ply cap and refuses a single book", async () => {
    const small = { raw: encodeBook([{ key: 1n, move: encodeMove("e2e4") }], { maxPly: 24 }), manifest: { months: [] } };
    const large = { raw: encodeBook([{ key: 2n, move: encodeMove("d2d4") }], { maxPly: 40 }), manifest: { months: [] } };
    const union = unionBooks([small, large], base);
    assert.equal(decodeBook(union.raw).maxPly, 40);
    assert.equal(union.manifest.sources[0].profile, "lichess", "books built before profiles existed are lichess books");
    assert.throws(() => unionBooks([small], base), /at least two/);
  });

  it("iterateBook agrees with the app's decoder", () => {
    const entries = [];
    for (let i = 0; i < 400; i += 1) {
      entries.push({ key: BigInt(i) * 0x9e3779b97f4a7c15n, move: encodeMove(i % 2 ? "e2e4" : "d2d4") }, { key: BigInt(i) * 0x9e3779b97f4a7c15n, move: encodeMove("g1f3") });
    }
    const raw = encodeBook(entries, { maxPly: 40 });
    const book = decodeBook(raw);
    let groups = 0;
    for (const { key, moves } of iterateBook(raw)) {
      groups += 1;
      assert.deepEqual(book.movesFor(key).map(encodeMove).sort((a, b) => a - b), [...moves].sort((a, b) => a - b));
    }
    assert.equal(groups, book.keyCount);
    assert.throws(() => [...iterateBook(new Uint8Array(20))], /magic/);
  });
});

function decodeUci(code) {
  const square = (index) => String.fromCharCode(97 + (index % 8)) + String.fromCharCode(49 + Math.floor(index / 8));
  return square(code & 63) + square((code >> 6) & 63) + ["", "n", "b", "r", "q"][code >> 12];
}

describe("runUnion (files)", () => {
  it("reads sibling manifests, writes the book, its manifest and a valid app manifest module", async () => {
    const dir = mkdtempSync(join(tmpdir(), "union-test-"));
    const { lichess, masters } = await threeBuilds();
    const paths = [];
    for (const [name, result] of [["lichess", lichess], ["masters", masters]]) {
      const outDir = join(dir, name);
      writeOutputs(result, { outDir, version: 3 });
      paths.push(join(outDir, "opening-book-v3.bin.gz"));
    }
    const out = join(dir, "out");
    const app = join(dir, "opening-book-manifest.ts");
    const result = runUnion([...paths, "--out-dir", out, "--version", "3", "--app-manifest", app, "--build-date", "2026-11-02T00:00:00.000Z"]);
    assert.ok(existsSync(join(out, "opening-book-v3.bin.gz")));
    const written = JSON.parse(readFileSync(join(out, "opening-book-v3.manifest.json"), "utf8"));
    assert.equal(written.sha256, result.manifest.sha256);
    assert.equal(written.sources.length, 2);
    assert.equal(decodeBook(gunzipSync(readFileSync(join(out, "opening-book-v3.bin.gz")))).entryCount, result.manifest.moves);

    // The app reads the manifest as a TypeScript module: the generated file must load and keep version/file.
    const loaded = await import(pathToFileURL(app).href);
    assert.equal(loaded.OPENING_BOOK_MANIFEST.version, 3);
    assert.equal(loaded.OPENING_BOOK_MANIFEST.file, "opening-book-v3.bin.gz");
    assert.equal(loaded.OPENING_BOOK_MANIFEST.sources.length, 2);
    assert.match(appManifestSource(written), /as const;\n$/);
  });

  it("needs the manifest next to each book, and a version and output directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "union-test-"));
    const { lichess } = await threeBuilds();
    writeOutputs(lichess, { outDir: dir, version: 3 });
    const book = join(dir, "opening-book-v3.bin.gz");
    const lone = join(dir, "other", "opening-book-v9.bin.gz");
    writeFileSync(join(dir, "x.bin.gz"), "");
    assert.equal(manifestPathFor(book), join(dir, "opening-book-v3.manifest.json"));
    assert.throws(() => runUnion([book, join(dir, "x.bin.gz"), "--out-dir", join(dir, "o"), "--version", "4"]), /manifest not found/);
    assert.throws(() => runUnion([book, lone]), /usage/);
    assert.throws(() => runUnion([book, "--out-dir", "o", "--version", "4"]), /usage/);
  });
});
