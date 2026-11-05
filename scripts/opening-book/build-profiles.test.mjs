// scripts/opening-book/build-profiles.test.mjs
// SIG-1229: the masters and correspondence profiles end to end: the
// distinct-players rule, de-duplication (also across files), unknown names,
// spilled builds, and an independent recount oracle over synthetic databases.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { bookKey } from "../../src/chess/opening-book.ts";
import { decodeBook } from "../../src/chess/opening-book-format.ts";
import { BOOK_RULE } from "../../src/chess/opening-theory.ts";
import { buildBook } from "./build-book.mjs";
import { syntheticPgn } from "./generate-synthetic-pgn.mjs";
import { readGames, sanTokens } from "./pgn.mjs";
import { normalizePlayer } from "./players.mjs";
import { profileRejection } from "./profiles.mjs";
import { ENGLISH, PET, QGD, TEN_MOVES, many, otb, source, who } from "./test-helpers.mjs";

const base = (profile, extra = {}) => ({ profile, version: 1, maxPly: 40, maxMapEntries: 3_000_000, buildDate: "2026-11-01T00:00:00.000Z", ...extra });
const has = (book, fen, uci) => book.hasMove(bookKey(fen), uci);

describe("masters: a move needs 5 distinct players", () => {
  it("one player repeating a pet line is not theory; the replies of 150 different opponents are", async () => {
    // Smith plays 1.b4 against 150 different opponents; 150 other games are 1.e4 between 150 pairs.
    const text =
      many(150, (i) => otb(PET, { White: "Smith, John", Black: `${who("Opponent", i)}, X` })) +
      many(150, (i) => otb(TEN_MOVES, { White: `${who("White", i)}, W`, Black: `${who("Black", i)}, B` }));
    const result = await buildBook([source(text)], base("masters"));
    const book = decodeBook(result.raw);
    const afterB4 = new Chess();
    afterB4.move("b4");
    assert.equal(has(book, new Chess().fen(), "e2e4"), true);
    assert.equal(has(book, new Chess().fen(), "b2b4"), false, "150 games, share 50%, but one player");
    assert.equal(has(book, afterB4.fen(), "e7e5"), true, "150 different opponents answered 1...e5");
    assert.deepEqual(result.manifest.thresholds, { minPositionGames: 100, minMoveGames: 20, minMoveShare: 0.01, minDistinctPlayers: 5 });
    assert.equal(result.manifest.profile, "masters");

    // The same data with the rule switched off keeps the pet line.
    const off = await buildBook([source(text)], base("masters", { minDistinctPlayers: 0 }));
    assert.equal(has(decodeBook(off.raw), new Chess().fen(), "b2b4"), true);
  });

  it("5 distinct players pass, 4 do not; one player written in several formats counts once", async () => {
    // 1.e4 is played in bulk by many players; 1.d4 by 4 players (5 name spellings of 4 people); 1.c4 by 5 players.
    const d4 = ["Carlsen, Magnus", "Magnus Carlsen", "Caruana, F", "Giri, Anish", "Nakamura, H."];
    const c4 = ["Carlsen, Magnus", "Caruana, F", "Giri, Anish", "Nakamura, H.", "Aronian, L"];
    const text =
      many(400, (i) => otb(TEN_MOVES, { White: `${who("W", i)}, W`, Black: `${who("B", i)}, B` })) +
      many(40, (i) => otb(QGD, { White: d4[i % 5], Black: `${who("Q", i)}, Q` })) +
      many(40, (i) => otb(ENGLISH, { White: c4[i % 5], Black: `${who("R", i)}, R` }));
    const result = await buildBook([source(text)], base("masters"));
    const book = decodeBook(result.raw);
    assert.equal(has(book, new Chess().fen(), "d2d4"), false, "4 distinct players");
    assert.equal(has(book, new Chess().fen(), "c2c4"), true, "5 distinct players");
  });

  it("unknown names never count as players", async () => {
    // 120 games of 1.d4 where White is unknown/"?": zero distinct players, however many games.
    const text =
      many(400, (i) => otb(TEN_MOVES, { White: `${who("W", i)}, W`, Black: `${who("B", i)}, B` })) +
      many(120, (i) => otb(QGD, { White: i % 2 ? "?" : "Unknown", Black: `${who("Q", i)}, Q`, Date: `2018.01.${String((i % 28) + 1).padStart(2, "0")}`, Round: String(i) }));
    const result = await buildBook([source(text)], base("masters"));
    const book = decodeBook(result.raw);
    assert.equal(has(book, new Chess().fen(), "d2d4"), false);
    const afterD4 = new Chess();
    afterD4.move("d4");
    assert.equal(has(book, afterD4.fen(), "d7d5"), true, "Black's 120 different players still count");
  });

  it("the player of a move is White on white's turns and Black on black's", async () => {
    // One fixed White (many opponents): White's moves fail, Black's replies pass. Reverse for a fixed Black.
    const text =
      many(120, (i) => otb(TEN_MOVES, { White: "Fixed, White", Black: `${who("B", i)}, B`, Date: `2001.01.${String((i % 28) + 1).padStart(2, "0")}`, Round: String(i) })) +
      many(120, (i) => otb(QGD, { White: `${who("W", i)}, W`, Black: "Fixed, Black", Date: `2002.01.${String((i % 28) + 1).padStart(2, "0")}`, Round: String(i) }));
    const book = decodeBook((await buildBook([source(text)], base("masters"))).raw);
    const afterE4 = new Chess();
    afterE4.move("e4");
    assert.equal(has(book, new Chess().fen(), "e2e4"), false);
    assert.equal(has(book, afterE4.fen(), "e7e5"), true);
    const afterD4 = new Chess();
    afterD4.move("d4");
    assert.equal(has(book, new Chess().fen(), "d2d4"), true);
    assert.equal(has(book, afterD4.fen(), "d7d5"), false);
  });
});

describe("masters: filters and de-duplication", () => {
  const game = (extra = {}) => otb(TEN_MOVES, { White: "Carlsen, Magnus", Black: "Caruana, Fabiano", ...extra });

  it("skips low or missing Elo, online games, unfinished games and short games, and counts them", async () => {
    const text =
      many(10, () => game({ WhiteElo: "2099", Date: "2020.01.01" })) +
      many(10, () => game({ BlackElo: undefined, Date: "2020.01.02" })) +
      many(10, () => game({ Site: "lichess.org", Date: "2020.01.03" })) +
      many(10, () => game({ Result: "*", Date: "2020.01.04" })) +
      otb(TEN_MOVES.split(" ").slice(0, 16).join(" ")) + // 8 full moves
      game({ Date: "2020.01.05" });
    const result = await buildBook([source(text)], base("masters"));
    assert.equal(result.stats.read, 42);
    assert.deepEqual(result.stats.rejected, { elo: 10, noElo: 10, online: 10, result: 10 });
    assert.equal(result.stats.tooShort, 1);
    assert.equal(result.stats.kept, 1);
  });

  it("de-duplicates by normalized players + Date + Round + moves, whatever the name format", async () => {
    const text =
      game({ Date: "2019.05.05", Round: "4" }) +
      game({ White: "Carlsen, M", Black: "Fabiano Caruana", Date: "2019.05.05", Round: "4" }) + // same game, other formats
      game({ White: "CARLSÉN, Magnus", Date: "2019.05.05", Round: "4" }) +
      game({ Date: "2019.05.06", Round: "4" }) + // another day
      game({ Date: "2019.05.05", Round: "5" }) + // another round
      game({ Date: "2019.05.05", Round: "4", White: "Giri, Anish" }) + // other player
      game({ Date: "2019.05.05", Round: "?" }); // no round: its own game
    const result = await buildBook([source(text)], base("masters"));
    assert.equal(result.stats.duplicates, 2);
    assert.equal(result.stats.kept, 5);
    assert.equal(result.manifest.duplicates, 2);
  });

  it("different moves on the same day between the same players are different games", async () => {
    const text = game({ Date: "2019.05.05", Round: "1" }) + otb(QGD, { White: "Carlsen, Magnus", Black: "Caruana, Fabiano", Date: "2019.05.05", Round: "1" });
    const result = await buildBook([source(text)], base("masters"));
    assert.equal(result.stats.duplicates, 0);
    assert.equal(result.stats.kept, 2);
  });

  it("two games differing only after the counted plies are the same game", async () => {
    const longer = `${TEN_MOVES} Nf1 Re8 Ng3 g6`; // 24 plies: beyond a --max-ply of 20
    const result = await buildBook(
      [source(game({ Date: "2019.05.05", Round: "4" }) + otb(longer, { White: "Carlsen, Magnus", Black: "Caruana, Fabiano", Date: "2019.05.05", Round: "4" }))],
      base("masters", { maxPly: 20 }),
    );
    assert.equal(result.stats.duplicates, 1);
  });

  it("unknown names are not part of the identity: Date + Round + moves still de-duplicate", async () => {
    const text = otb(TEN_MOVES, { White: "?", Black: "?", Date: "2011.02.03", Round: "2" }) + otb(TEN_MOVES, { White: "Unknown", Black: "-", Date: "2011.02.03", Round: "2" });
    const result = await buildBook([source(text)], base("masters"));
    assert.equal(result.stats.duplicates, 1);
  });

  it("several input files are de-duplicated together in one run", async () => {
    const fileA = game({ Date: "2019.05.05", Round: "4" }) + game({ Date: "2019.05.06", Round: "4" });
    const fileB = game({ White: "Magnus Carlsen", Black: "Caruana, F", Date: "2019.05.05", Round: "4" }) + game({ Date: "2019.05.07", Round: "4" });
    const result = await buildBook([source(fileA), source(fileB)], base("masters"));
    assert.equal(result.stats.read, 4);
    assert.equal(result.stats.duplicates, 1);
    assert.equal(result.stats.kept, 3);
  });

  it("reports duplicates per input file when collections overlap (Lumbra, AJ-OTB, Chess-Results)", async () => {
    const lumbra = game({ Date: "2019.05.05", Round: "4", Source: "LumbrasGigaBase" }) + game({ Date: "2019.05.06", Round: "4", Source: "TWIC" }) + game({ Date: "2019.05.09", Round: "4", Source: "LichessEliteDatabase" });
    const ajOtb = game({ White: "Carlsen,M.", Date: "2019.05.05", Round: "4" }) + game({ Date: "2019.06.01", Round: "1" });
    const results = game({ White: "Magnus Carlsen", Date: "2019.05.05", Round: "4" }) + game({ White: "Carlsen, M", Date: "2019.05.06", Round: "4" }) + game({ Date: "2019.07.01", Round: "1" });
    const result = await buildBook([source(lumbra), source(ajOtb), source(results)], base("masters", { sourceNames: ["lumbra.pgn", "aj-otb.pgn", "chess-results.pgn"] }));
    assert.deepEqual(result.manifest.inputs, [
      { file: "lumbra.pgn", read: 3, kept: 2, duplicates: 0 },
      { file: "aj-otb.pgn", read: 2, kept: 1, duplicates: 1 },
      { file: "chess-results.pgn", read: 3, kept: 1, duplicates: 2 },
    ]);
    assert.equal(result.stats.duplicates, 3);
    assert.equal(result.stats.rejected.online, 1, "the LichessEliteDatabase game");
    assert.equal(result.manifest.duplicates, 3);
  });

  it("the lichess profile does not de-duplicate", async () => {
    const text = many(3, () => game({ TimeControl: "180+0" }));
    const result = await buildBook([source(text)], base("lichess"));
    assert.equal(result.stats.duplicates, 0);
    assert.equal(result.stats.kept, 3);
  });
});

describe("correspondence profile", () => {
  const corr = (sans, extra = {}) => otb(sans, { Event: "ICCF Webserver Open", Site: "ICCF", WhiteElo: "2450", BlackElo: "2400", ...extra });

  it("keeps correspondence games, skips OTB and live play, with its own stats and Elo bar", async () => {
    const text =
      many(5, (i) => corr(TEN_MOVES, { White: `${who("W", i)}, W`, Black: `${who("B", i)}, B` })) +
      many(4, (i) => otb(TEN_MOVES, { White: `${who("X", i)}, W`, Black: `${who("Y", i)}, B`, Event: "Open 2019", Site: "Berlin GER" })) +
      many(3, (i) => corr(TEN_MOVES, { White: `${who("L", i)}, W`, Black: `${who("M", i)}, B`, TimeControl: "180+0" })) +
      many(2, (i) => corr(TEN_MOVES, { White: `${who("E", i)}, W`, Black: `${who("F", i)}, B`, WhiteElo: "2250" }));
    const result = await buildBook([source(text)], base("correspondence"));
    assert.equal(result.stats.kept, 5);
    assert.deepEqual(result.stats.rejected, { notCorrespondence: 7, elo: 2 });
    assert.equal(result.manifest.profile, "correspondence");
    assert.equal(result.manifest.minElo, 2300);
    assert.equal(result.manifest.thresholds.minDistinctPlayers, 5);
    assert.equal(result.manifest.speeds, undefined);
  });

  it("applies the same 5 distinct players rule", async () => {
    const text =
      many(150, (i) => corr(TEN_MOVES, { White: `${who("W", i)}, W`, Black: `${who("B", i)}, B` })) +
      many(150, (i) => corr(PET, { White: "Smith, John", Black: `${who("O", i)}, X` }));
    const book = decodeBook((await buildBook([source(text)], base("correspondence"))).raw);
    assert.equal(has(book, new Chess().fen(), "e2e4"), true);
    assert.equal(has(book, new Chess().fen(), "b2b4"), false);
  });
});

describe("spilling and the recount oracle", () => {
  /** Recounts a database with straightforward code and the same rule. */
  async function oracle(text, profile, minElo) {
    const positions = new Map();
    const seen = new Set();
    for await (const game of readGames(source(text), (headers) => profileRejection(profile, headers, { minElo }))) {
      if (game.rejected) {
        continue;
      }
      const tokens = sanTokens(game.movetext, 40);
      if (tokens.length < 19) {
        continue; // fewer than 10 full moves
      }
      const board = new Chess();
      const steps = [];
      for (const san of tokens) {
        const key = bookKey(board.fen());
        const move = board.move(san);
        steps.push([key, move.from + move.to + (move.promotion ?? "")]);
      }
      const round = game.headers.Round && !["?", "-"].includes(game.headers.Round) ? game.headers.Round : "";
      const id = [normalizePlayer(game.headers.White), normalizePlayer(game.headers.Black), game.headers.Date ?? "", round, steps.map((step) => step[1]).join(" ")].join("|");
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      steps.forEach(([key, uci], ply) => {
        const entry = positions.get(key) ?? { total: 0, moves: new Map() };
        entry.total += 1;
        const move = entry.moves.get(uci) ?? { count: 0, players: new Set() };
        move.count += 1;
        const name = normalizePlayer(ply % 2 === 0 ? game.headers.White : game.headers.Black);
        if (name) {
          move.players.add(name);
        }
        entry.moves.set(uci, move);
        positions.set(key, entry);
      });
    }
    return positions;
  }

  for (const [style, profile, minElo] of [["otb", "masters", 2100], ["corr", "correspondence", 2300]]) {
    it(`${profile}: a synthetic ${style} database matches the recount, and a spilled build is byte-identical`, async () => {
      const text = [...syntheticPgn({ games: 700, seed: 1229, style })].join("");
      const plain = await buildBook([source(text)], base(profile));
      const spilled = await buildBook([source(text)], base(profile, { maxMapEntries: 400 }));
      assert.ok(spilled.stats.spills > 5, `spills ${spilled.stats.spills}`);
      assert.deepEqual(Buffer.from(spilled.raw), Buffer.from(plain.raw));
      assert.deepEqual({ ...spilled.manifest, sha256: 0, gzipBytes: 0 }, { ...plain.manifest, sha256: 0, gzipBytes: 0 });
      assert.ok(plain.stats.duplicates > 0, "the generator emits duplicates with re-formatted names");

      const book = decodeBook(plain.raw);
      const counted = await oracle(text, profile, minElo);
      let expected = 0;
      let rejectedByPlayers = 0;
      for (const [key, entry] of counted) {
        for (const [uci, move] of entry.moves) {
          const enoughPlayers = move.players.size >= 5;
          const theory = entry.total >= BOOK_RULE.minPositionGames && move.count >= BOOK_RULE.minMoveGames && move.count >= BOOK_RULE.minMoveShare * entry.total && enoughPlayers;
          rejectedByPlayers += !enoughPlayers && entry.total >= 100 && move.count >= 20 ? 1 : 0;
          assert.equal(book.hasMove(key, uci), theory, `${key} ${uci} ${move.count}/${entry.total} players ${move.players.size}`);
          expected += theory ? 1 : 0;
        }
      }
      assert.equal(book.entryCount, expected);
      assert.ok(expected > 0, "some theory");
      assert.ok(rejectedByPlayers > 0, "the pet line is frequent enough to be cut only by the player rule");
    });
  }
});
