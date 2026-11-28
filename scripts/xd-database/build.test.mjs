// scripts/xd-database/build.test.mjs
// SIG-1449: the database build end to end on hand-made PGN: filters and
// de-duplication, tree counts and results, the minimum-games cut, top games,
// the game store round trip, the player index and byte-identical output.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { after, before, describe, it } from "node:test";
import { Chess } from "chess.js";
import { bookKey } from "../../src/chess/opening-book.ts";
import { encodeMove } from "../../src/chess/opening-book-format.ts";
import { XdDatabaseReader } from "../../src/lib/xd-database/reader.ts";
import { linesOf } from "../opening-book/pgn.mjs";
import { otb } from "../opening-book/test-helpers.mjs";
import { buildDatabase, dateNumber, parseArgs } from "./build.mjs";
import { checkSample } from "./inspect.mjs";
import { localSource } from "./local-source.mjs";

const RUY = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5";
const SICILIAN = "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6";
const QGD = "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7";
const SOLO = "b3 e5 Bb2 Nc6 e3 d5";

function fenAfter(sans) {
  const board = new Chess();
  for (const san of sans.split(" ").filter(Boolean)) {
    board.move(san);
  }
  return board.fen();
}

function code(fenBefore, san) {
  const move = new Chess(fenBefore).move(san);
  return encodeMove(move.from + move.to + (move.promotion ?? ""));
}

function corpus() {
  return [
    otb(RUY, { White: "Carlsen, Magnus", WhiteFideId: "1503014", Black: "Giri, Anish", BlackFideId: "24116068", WhiteElo: "2830", BlackElo: "2760", Result: "1-0", Date: "2023.01.20", Round: "1" }),
    otb(RUY, { White: "Giri, Anish", BlackFideId: "1503014", Black: "Carlsen, M", WhiteElo: "2750", BlackElo: "2840", Result: "1/2-1/2", Date: "2024.05.02", Round: "2" }),
    // Name only: merged into the FIDE identity of Carlsen, Magnus.
    otb(RUY, { White: "Carlsen, Magnus", Black: "Nakamura, Hikaru", WhiteElo: "2850", BlackElo: "2780", Result: "0-1", Date: "2025.03.03", Round: "3" }),
    otb(SICILIAN, { White: "Caruana, Fabiano", Black: "Nakamura, Hikaru", WhiteElo: "2800", BlackElo: "2790", Result: "1-0", Date: "2022.07.07", Round: "1" }),
    otb(SICILIAN, { White: "Caruana, Fabiano", Black: "So, Wesley", WhiteElo: "2790", BlackElo: "2770", Result: "0-1", Date: "2021.07.07", Round: "4" }),
    otb(QGD, { White: "Ding, Liren", Black: "Nepomniachtchi, Ian", WhiteElo: "2780", BlackElo: "2790", Result: "1/2-1/2", Date: "2023.04.10", Round: "5" }),
    otb(SOLO, { White: "Larsen, Bent", Black: "Spassky, Boris", WhiteElo: "2620", BlackElo: "2690", Result: "0-1", Date: "1970.03.31", Round: "1" }),
    // Rejected: rated under 1800, an online game, an unfinished game.
    otb(RUY, { White: "Low, A", Black: "Low, B", WhiteElo: "1700", BlackElo: "1600", Date: "2020.01.01" }),
    otb(RUY, { White: "Online, A", Black: "Online, B", Site: "chess.com INT", Date: "2020.01.01" }),
    otb(RUY, { White: "Open, A", Black: "Open, B", Result: "*", Date: "2020.01.01" }),
    // A relayed tournament: kept although Site names lichess.org.
    otb(QGD, { White: "Gukesh, D", Black: "Firouzja, Alireza", WhiteElo: "2790", BlackElo: "2760", Result: "1-0", Date: "2024.04.20", Round: "9", Site: "lichess.org", Source: "LichessBroadcastAPI" }),
  ].join("");
}

// The first Ruy Lopez game again, from a second collection: a duplicate.
const DUPLICATE = otb(RUY, { White: "Carlsen,M.", Black: "Giri, A", WhiteElo: "2830", BlackElo: "2760", Result: "1-0", Date: "2023.01.20", Round: "1" });

function sources(...texts) {
  return texts.map((text) => linesOf(Readable.from([text])));
}

const BASE = { version: 2, buildDate: "2026-11-23T00:00:00.000Z", release: "test", pageBytes: 64, bucketBits: 2 };

describe("xd-database build", () => {
  let root;
  let manifest;
  let reader;

  before(async () => {
    root = mkdtempSync(join(tmpdir(), "xd-build-"));
    manifest = await buildDatabase(sources(corpus(), DUPLICATE), { ...BASE, outDir: join(root, "a"), workers: 2 });
    reader = new XdDatabaseReader(localSource(join(root, "a", "v2")));
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it("keeps rated over-the-board games, drops the rest and the duplicate", () => {
    assert.equal(manifest.stats.gamesRead, 12);
    assert.equal(manifest.stats.gamesKept, 8);
    assert.equal(manifest.stats.duplicates, 1);
    assert.deepEqual(manifest.stats.rejected, { elo: 1, online: 1, result: 1 });
    assert.equal(manifest.stats.illegalGames, 0);
  });

  it("keeps rated and unrated OTB games and ranks the fully unrated game last", async () => {
    const pgn = [
      otb(RUY, { WhiteElo: "2000", BlackElo: "1500", Round: "1" }),
      otb(RUY, { WhiteElo: undefined, BlackElo: undefined, Round: "2", Date: "2025.01.01" }),
      otb(RUY, { WhiteElo: "1700", BlackElo: "1600", Round: "3" }),
      otb(RUY, { WhiteElo: "2400", BlackElo: undefined, Round: "4" }),
    ].join("");
    const outDir = join(root, "ratings");
    const built = await buildDatabase(sources(pgn), { ...BASE, outDir, workers: 1 });
    assert.equal(built.rules.minElo, 1800);
    assert.equal(built.rules.ratingRule, "anyAtLeast");
    assert.equal(built.stats.gamesKept, 3);
    assert.deepEqual(built.stats.rejected, { elo: 1 });

    const database = new XdDatabaseReader(localSource(join(outDir, "v2")));
    const start = await database.positionByFen(new Chess().fen());
    const top = await database.gamesById(start.gameIds);
    assert.deepEqual(top.map(({ game }) => [game.whiteElo, game.blackElo]), [
      [2400, null], [2000, 1500], [null, null],
    ]);
    assert.deepEqual((await database.positionGames(start, 0, 3)).map(({ id }) => id), start.gameIds);
  });

  it("counts every game at the start position with results per move", async () => {
    const start = await reader.position(bookKey(new Chess().fen()));
    assert.equal(start.total, 8);
    const startFen = new Chess().fen();
    const e4 = start.moves.find((m) => m.code === code(startFen, "e4"));
    assert.deepEqual({ white: e4.white, draws: e4.draws, black: e4.black }, { white: 2, draws: 1, black: 2 });
    assert.equal(e4.lastYear, 2025);
    assert.equal(e4.averageRating, Math.round((2795 + 2795 + 2815 + 2795 + 2780) / 5));
    // Moves are sorted by games played; b3 (one game) comes last.
    assert.deepEqual(start.moves.map((m) => m.white + m.draws + m.black), [5, 2, 1]);
    assert.equal(start.gameIds.length, 8);
  });

  it("orders top games by average rating, then the newest", async () => {
    const start = await reader.position(bookKey(new Chess().fen()));
    const games = await reader.gamesById(start.gameIds);
    const keys = games.map(({ game }) => ({ rating: ((game.whiteElo ?? 0) + (game.blackElo ?? 0)) / 2, date: game.date ?? "" }));
    for (let i = 1; i < keys.length; i += 1) {
      const [prev, next] = [keys[i - 1], keys[i]];
      assert.ok(prev.rating > next.rating || (prev.rating === next.rating && prev.date >= next.date), `out of order at ${i}`);
    }
  });

  it("drops positions reached by fewer games than the minimum", async () => {
    assert.equal(await reader.positionByFen(fenAfter("b3")), null);
    const sicilian = await reader.positionByFen(fenAfter(SICILIAN));
    assert.equal(sicilian.total, 2);
    assert.equal(sicilian.moves.length, 0, "the games end here, no move follows");
  });

  it("stores the games with their headers and moves", async () => {
    const all = await reader.gamesById([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(all.length, 8, "id 8 is out of range");
    assert.equal(all[0].game.white, "Carlsen, Magnus");
    assert.equal(all[0].game.whiteFideId, 1503014);
    assert.equal(all[0].game.moves, RUY);
    assert.equal(all[0].game.date, "2023.01.20");
    assert.equal(all[7].game.site, "lichess.org");
    assert.ok(!JSON.stringify(all).includes("LichessBroadcastAPI"), "the source tag is not stored");
  });

  it("indexes players by FIDE id, merges a name-only spelling, newest games first", async () => {
    const [carlsen] = await reader.searchPlayers("Carlsen");
    assert.equal(carlsen.fideId, 1503014);
    assert.equal(carlsen.count, 3);
    assert.equal(carlsen.firstYear, 2023);
    assert.equal(carlsen.lastYear, 2025);
    const ids = await reader.playerGameIds(carlsen, 0, 10);
    const years = (await reader.gamesById(ids.map(({ id }) => id))).map(({ game }) => game.date);
    assert.deepEqual(years, ["2025.03.03", "2024.05.02", "2023.01.20"]);
    assert.deepEqual(ids, [{ id: 2, color: "white" }, { id: 1, color: "black" }, { id: 0, color: "white" }]);
    assert.deepEqual(await reader.playerGameIds(carlsen, 1, 1), [ids[1]]);
    assert.equal((await reader.playerById(carlsen.id)).fideId, carlsen.fideId);
    const nak = await reader.searchPlayers("naka");
    assert.equal(nak.length, 1);
    assert.equal(nak[0].count, 2);
    assert.deepEqual(await reader.searchPlayers("zzz"), []);
  });

  it("stores every position game in top-game order with filter metadata", async () => {
    const start = await reader.positionByFen(new Chess().fen());
    const rows = await reader.positionGames(start, 0, start.total + 1);
    assert.equal(rows.length, 8);
    assert.deepEqual(rows.map(({ id }) => id), start.gameIds);
    assert.deepEqual(rows[0], { id: 2, whiteElo: 2850, blackElo: 2780, year: 2025, result: "0-1" });
    const ruy = await reader.positionByFen(fenAfter("e4 e5 Nf3"));
    assert.deepEqual((await reader.positionGames(ruy, 1, 10)).map(({ id }) => id), [1, 0]);
    assert.equal(manifest.formatVersion, 2);
  });

  it("rejects indexes written in format version 1", async () => {
    const source = localSource(join(root, "a", "v2"));
    const v1 = new XdDatabaseReader(async (file, range) => {
      const bytes = await source(file, range);
      if (file.endsWith(".idx")) new DataView(bytes.buffer, bytes.byteOffset).setUint32(4, 1, true);
      return bytes;
    });
    await assert.rejects(v1.positionByFen(new Chess().fen()), /format version 1, expected 2/);
    await assert.rejects(v1.game(0), /format version 1, expected 2/);
    await assert.rejects(v1.searchPlayers("carlsen"), /format version 1, expected 2/);
  });

  it("passes its own sample check", async () => {
    const result = await checkSample(reader, 8, manifest);
    assert.deepEqual(result.errors, []);
    assert.equal(result.checked, 8);
  });

  it("writes byte-identical files whatever the worker count", async () => {
    const other = await buildDatabase(sources(corpus(), DUPLICATE), { ...BASE, outDir: join(root, "b"), workers: 3 });
    for (const [name, file] of Object.entries(manifest.files)) {
      assert.equal(other.files[name].sha256, file.sha256, name);
    }
    assert.deepEqual(readFileSync(join(root, "a", "v2", "tree.bin")), readFileSync(join(root, "b", "v2", "tree.bin")));
  });

  it("fails without output when fewer games than --min-games-read were read", async () => {
    await assert.rejects(
      buildDatabase(sources(corpus()), { ...BASE, outDir: join(root, "c"), workers: 1, minGamesRead: 1000 }),
      /fewer than --min-games-read/,
    );
    for (const name of ["games.bin", "tree.bin", "manifest.json"]) {
      assert.ok(!existsSync(join(root, "c", "v2", name)), name);
    }
  });
});

describe("parseArgs and dateNumber", () => {
  it("parses the defaults and rejects bad values", () => {
    const args = parseArgs(["a.pgn", "--out-dir", "out", "--version", "2"]);
    assert.equal(args.maxPly, 50);
    assert.equal(args.minElo, 1800);
    assert.equal(args.minGames, 2);
    assert.equal(args.topGames, 50);
    assert.throws(() => parseArgs(["a.pgn", "--out-dir", "out"]), /usage/);
    assert.throws(() => parseArgs(["a.pgn", "--out-dir", "out", "--version", "1", "--max-ply", "300"]), /255/);
    assert.throws(() => parseArgs(["a.pgn", "--out-dir", "out", "--version", "1", "--bogus"]), /usage/);
  });

  it("reads PGN dates with unknown parts", () => {
    assert.equal(dateNumber("2019.03.04"), 20190304);
    assert.equal(dateNumber("2019.??.??"), 20190000);
    assert.equal(dateNumber("????.??.??"), 0);
    assert.equal(dateNumber(undefined), 0);
  });
});
