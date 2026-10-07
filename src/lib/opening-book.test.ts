import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN } from "../chess/tree.ts";
import {
  bookGamesForPlayer,
  emptyExplorer,
  getBookGamePgn,
  lookupOpeningBook,
  searchBookPlayers,
} from "./opening-book.ts";

test("lookupOpeningBook on start position returns moves sorted by games desc", () => {
  const res = lookupOpeningBook("masters", START_FEN);
  assert.ok(res);
  assert.equal(res.source, "masters");
  assert.equal(res.fen, START_FEN);
  assert.ok(res.moves.length > 0);
  // Start position: e4 and d4 lines from the sample book must be present.
  const ucis = res.moves.map((move) => move.uci);
  assert.ok(ucis.includes("e2e4"));
  assert.ok(ucis.includes("d2d4"));
  // Sorted by games descending.
  const games = res.moves.map((move) => move.games);
  assert.deepEqual(games, [...games].sort((a, b) => b - a));
  // e4 appears in more sample games than c4, so e4 sorts first.
  assert.ok(games[0]! >= games[games.length - 1]!);
  // Move rows carry totals consistent with games.
  for (const move of res.moves) {
    assert.equal(move.games, move.white + move.draws + move.black);
  }
  // Start position has no ECO opening attached.
  assert.equal(res.opening, null);
  // Totals match the per-position counters (all sample games pass through
  // start; the games list itself is capped at 8 per position).
  const moveGames = res.moves.reduce((sum, move) => sum + move.games, 0);
  assert.equal(res.white + res.draws + res.black, moveGames);
  assert.ok(res.games.length <= 8);
  assert.ok(res.notice?.includes("LICHESS_TOKEN"));
});

test("lookupOpeningBook on unknown position returns null", () => {
  assert.equal(
    lookupOpeningBook(
      "masters",
      "rnbq1rk1/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 0 1",
    ),
    null,
  );
});

test("lookupOpeningBook after 1.e4 exposes ECO opening info", () => {
  const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
  const res = lookupOpeningBook("masters", afterE4);
  assert.ok(res);
  assert.ok(res.moves.length > 0);
  // At least one sample game reaches this position with ECO headers.
  assert.ok(res.opening);
  assert.ok(res.opening.eco.length > 0);
  assert.ok(res.opening.name.length > 0);
});

test("emptyExplorer returns the zeroed shape with the given notice", () => {
  const res = emptyExplorer("masters", START_FEN, "offline");
  assert.deepEqual(res, {
    source: "masters",
    fen: START_FEN,
    white: 0,
    draws: 0,
    black: 0,
    opening: null,
    moves: [],
    games: [],
    notice: "offline",
  });
});

test("getBookGamePgn round-trips sample ids and misses unknown ids", () => {
  const pgn = getBookGamePgn("book-opera");
  assert.ok(pgn?.includes("Paris Opera"));
  assert.equal(getBookGamePgn("book-nope"), null);
});

test("searchBookPlayers requires q length >= 2", () => {
  assert.deepEqual(searchBookPlayers(""), []);
  assert.deepEqual(searchBookPlayers("k"), []);
});

test("searchBookPlayers matches by substring, deduped per player", () => {
  const hits = searchBookPlayers("kasparov");
  assert.ok(hits.length >= 1);
  const names = hits.map((hit) => hit.username.toLowerCase());
  assert.ok(names.some((name) => name.includes("kasparov")));
  // One hit per distinct player name.
  assert.equal(new Set(names).size, names.length);
  // Case-insensitive.
  assert.deepEqual(
    searchBookPlayers("KASPAROV").map((hit) => hit.id),
    hits.map((hit) => hit.id),
  );
});

test("searchBookPlayers finds no one for unknown names", () => {
  assert.deepEqual(searchBookPlayers("xqzvpl nobody"), []);
});

test("bookGamesForPlayer returns Kasparov games with win side mapping", () => {
  const games = bookGamesForPlayer("kasparov");
  // book-ruy + book-sicilian (white wins) + book-kingsindian (black win).
  assert.ok(games.length >= 3);
  for (const game of games) {
    // Every Kasparov sample game is a win for Kasparov's side.
    assert.equal(game.playerResult, "win");
    assert.equal(game.winner, game.color);
  }
  // Both colors represented: white wins and the black-side win.
  assert.ok(games.some((game) => game.color === "white"));
  assert.ok(games.some((game) => game.id === "book-kingsindian" && game.color === "black"));
});

test("bookGamesForPlayer maps black-side wins to win for the black player", () => {
  const games = bookGamesForPlayer("kasparov, garry");
  const blackWin = games.find((game) => game.id === "book-kingsindian");
  assert.ok(blackWin);
  assert.equal(blackWin.color, "black");
  assert.equal(blackWin.playerResult, "win");
  assert.equal(blackWin.winner, "black");
});

test("bookGamesForPlayer returns empty for unknown players", () => {
  assert.deepEqual(bookGamesForPlayer("xqzvpl nobody"), []);
});
