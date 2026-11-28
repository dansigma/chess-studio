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
    otb(RUY, { White: "Giri, Anish", WhiteFideId: "24116068", BlackFideId: "1503014", Black: "Carlsen, M", WhiteElo: "2750", BlackElo: "2840", Result: "1/2-1/2", Date: "2024.05.02", Round: "2" }),
    // Name only: merged into the FIDE identity of Carlsen, Magnus.
    otb(RUY, { White: "Carlsen, Magnus", Black: "Nakamura, Hikaru", BlackFideId: "2016192", WhiteElo: "2699", BlackElo: "2780", Result: "0-1", Date: "2025.03.03", Round: "3" }),
    otb(SICILIAN, { White: "Caruana, Fabiano", WhiteFideId: "2020009", Black: "Nakamura, Hikaru", BlackFideId: "2016192", WhiteElo: "2800", BlackElo: "2790", Result: "1-0", Date: "2022.07.07", Round: "1" }),
    otb(SICILIAN, { White: "Caruana, Fabiano", WhiteFideId: "2020009", Black: "So, Wesley", BlackFideId: "5202213", WhiteElo: "2790", BlackElo: "2770", Result: "0-1", Date: "2021.07.07", Round: "4" }),
    otb(QGD, { White: "Ding, Liren", WhiteFideId: "8603677", Black: "Nepomniachtchi, Ian", BlackFideId: "4168119", WhiteElo: "2780", BlackElo: "2790", Result: "1/2-1/2", Date: "2023.04.10", Round: "5" }),
    otb(SOLO, { White: "Larsen, Bent", Black: "Spassky, Boris", WhiteElo: "2620", BlackElo: "2690", Result: "0-1", Date: "1970.03.31", Round: "1" }),
    // Rejected: rated under 1800, an online game, an unfinished game.
    otb(RUY, { White: "Low, A", Black: "Low, B", WhiteElo: "1700", BlackElo: "1600", Date: "2020.01.01" }),
    otb(RUY, { White: "Online, A", Black: "Online, B", Site: "chess.com INT", Date: "2020.01.01" }),
    otb(RUY, { White: "Open, A", Black: "Open, B", Result: "*", Date: "2020.01.01" }),
    // A relayed tournament: kept although Site names lichess.org.
    otb(QGD, { White: "Gukesh, D", WhiteFideId: "46616543", Black: "Firouzja, Alireza", BlackFideId: "12573981", WhiteElo: "2790", BlackElo: "2760", Result: "1-0", Date: "2024.04.20", Round: "9", Site: "lichess.org", Source: "LichessBroadcastAPI" }),
  ].join("");
}

// The first Ruy Lopez game again, from a second collection: a duplicate.
const DUPLICATE = otb(RUY, { White: "Carlsen,M.", WhiteFideId: "1503014", Black: "Giri, A", BlackFideId: "24116068", WhiteElo: "2830", BlackElo: "2760", Result: "1-0", Date: "2023.01.20", Round: "1" });

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

  it("counts XD header rejections and keeps legitimate games", async () => {
    const onlineEvents = [
      "CCT2024-Event1-Div1-KO", "Champions Chess Tour", "Titled Tuesday", "Titled Arena",
      "Bullet Chess Championship", "Speed Chess Championship", "Chess.com Global Championship",
      "Lichess Marathon", "Online Olympiad", "Banter Blitz", "Arena Kings",
    ];
    const placeholders = ["NN", "N.N.", "N N", "?", "-", "Unknown", " Over Rated ", "", undefined];
    const headers = [
      { Event: "TRE 2026 TC G09", Date: "????.??.??", WhiteElo: "2867", BlackElo: "2889" },
      { Date: undefined },
      { Date: "0000.01.01" },
      ...onlineEvents.map((Event) => ({ Event, Site: "Unknown" })),
      { White: "NN", Black: "Over-Rated", WhiteElo: "2894", BlackElo: "2836", Date: "2003.??.??", Event: "Unknown", Site: "Unknown" },
      ...placeholders.map((Black) => ({ Black })),
      { WhiteElo: "2700", BlackFideId: "24116068" },
      { BlackElo: "2889", BlackFideId: "0" },
      { Event: "Tata Steel Masters", White: "Nnamdi", Black: "Ann", WhiteElo: "2750", WhiteFideId: "1503014" },
      { Event: "ACCT2024 Open", Date: "1858.??.??", WhiteElo: undefined, BlackElo: undefined },
      { Event: "Tata Steel Masters", Site: "https://lichess.org/broadcast/tata-steel" },
      { Event: "Titled Tuesday Invitational", Site: "lichess.org", Source: "LichessBroadcast" },
    ];
    const pgn = headers.map((tags, i) => otb(RUY, { Round: String(i + 1), ...tags })).join("");
    const outDir = join(root, "headers");
    const built = await buildDatabase(sources(pgn), { ...BASE, outDir, workers: 1 });
    assert.equal(built.stats.gamesRead, headers.length);
    assert.equal(built.stats.gamesKept, 4);
    assert.deepEqual(built.stats.rejected, {
      noYear: 3,
      online: onlineEvents.length,
      placeholderPlayer: placeholders.length + 1,
      implausibleRating: 2,
    });

    const database = new XdDatabaseReader(localSource(join(outDir, "v2")));
    const games = await database.gamesById([0, 1, 2, 3]);
    const [masters, historical, urlBroadcast, sourceBroadcast] = games.map(({ game }) => game);
    assert.equal(masters.whiteElo, 2750);
    assert.equal(masters.whiteFideId, 1503014);
    assert.equal(masters.white, "Nnamdi");
    assert.equal(masters.black, "Ann");
    assert.equal(historical.date, "1858.??.??");
    assert.equal(historical.whiteElo, null);
    assert.equal(historical.blackElo, null);
    assert.equal(urlBroadcast.site, "https://lichess.org/broadcast/tata-steel");
    assert.equal(sourceBroadcast.event, "Titled Tuesday Invitational");
  });

  it("counts every game at the start position with results per move", async () => {
    const start = await reader.position(bookKey(new Chess().fen()));
    assert.equal(start.total, 8);
    const startFen = new Chess().fen();
    const e4 = start.moves.find((m) => m.code === code(startFen, "e4"));
    assert.deepEqual({ white: e4.white, draws: e4.draws, black: e4.black }, { white: 2, draws: 1, black: 2 });
    assert.equal(e4.lastYear, 2025);
    assert.equal(e4.averageRating, Math.round((2795 + 2795 + 2740 + 2795 + 2780) / 5));
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
    assert.deepEqual(rows[0], { id: 1, whiteElo: 2750, blackElo: 2840, year: 2024, result: "1/2-1/2" });
    const ruy = await reader.positionByFen(fenAfter("e4 e5 Nf3"));
    assert.deepEqual((await reader.positionGames(ruy, 1, 10)).map(({ id }) => id), [0, 2]);
    assert.equal(manifest.formatVersion, 3);
  });

  it("rejects indexes written in format version 1", async () => {
    const source = localSource(join(root, "a", "v2"));
    const v1 = new XdDatabaseReader(async (file, range) => {
      const bytes = await source(file, range);
      if (file.endsWith(".idx")) new DataView(bytes.buffer, bytes.byteOffset).setUint32(4, 1, true);
      return bytes;
    });
    await assert.rejects(v1.positionByFen(new Chess().fen()), /format version 1, expected 2 through 3/);
    await assert.rejects(v1.game(0), /format version 1, expected 2 through 3/);
    await assert.rejects(v1.searchPlayers("carlsen"), /format version 1, expected 2 through 3/);
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

  it("resolves openings by position and preserves the source ECO across worker counts", async () => {
    const jobava = "d4 Nf6 Nc3 d5 Bf4 c5";
    const cases = [
      [`${jobava} e3 cxd4 exd4`, "B13", "D01", "Rapport-Jobava System"],
      [`${jobava} e3 cxd4 exd4`, "D00o", "D01", "Rapport-Jobava System"],
      [`${jobava} e3 cxd4 exd4`, undefined, "D01", "Rapport-Jobava System"],
      [`${jobava} e4 cxd4`, "A00", "D01", "Rapport-Jobava System"],
      [`${jobava} e3 e6`, "A45", "D01", "Rapport-Jobava System"],
      ["e4 b5", undefined, "B00", "King's Pawn Game"],
      ["e5", "A00", null, null],
    ];
    // Span several batches so workers can finish them out of source order.
    const count = 1501;
    const pgn = Array.from({ length: count }, (_, i) => {
      const [moves, ECO] = cases[i % cases.length];
      return otb(moves, { ECO, Round: String(i + 1) });
    }).join("");
    const build = (workers) => buildDatabase(sources(pgn), {
      ...BASE, outDir: join(root, `openings-${workers}`), workers, maxPly: 3,
    });
    const single = await build(1);
    const multi = await build(3);
    assert.deepEqual(single.files, multi.files);
    const unresolved = Math.floor(count / cases.length);
    assert.deepEqual(multi.stats.openings, { resolved: count - unresolved, unresolved });

    const database = new XdDatabaseReader(localSource(join(root, "openings-3", "v2")));
    const games = await database.gamesById(Array.from({ length: count }, (_, id) => id));
    assert.equal(games.length, count);
    for (const { id, game } of games) {
      const [moves, eco, openingEco, openingName] = cases[id % cases.length];
      assert.deepEqual([game.moves, game.eco, game.openingEco, game.openingName, game.round],
        [moves, eco ?? null, openingEco, openingName, String(id + 1)]);
    }
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
