import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN } from "../chess/tree.ts";
import { DEFAULT_EXPLORER_FILTERS } from "./explorer-filters.ts";
import { lookupFilesExplorer, searchFilesForPosition } from "./files-explorer.ts";
import type { FileDatabase } from "./user-files.ts";

const annotated: FileDatabase = {
  id: "db-1",
  remoteId: null,
  name: "Notes",
  folderId: null,
  games: [
    {
      id: "g1",
      white: "A",
      black: "B",
      result: "1-0",
      event: "Test",
      date: "2020.01.02",
      title: "A vs B",
      pgn: `[Event "Test"]
[White "A"]
[Black "B"]
[Result "1-0"]
[WhiteElo "2200"]
[BlackElo "2100"]
[Date "2020.01.02"]

1. e4 (1. d4 d5) 1... e5 1-0`,
    },
  ],
};

test("personal explorer indexes sidelines as well as the mainline", () => {
  const response = lookupFilesExplorer(annotated, START_FEN, DEFAULT_EXPLORER_FILTERS);
  const moves = response.moves.map((move) => move.san).sort();
  assert.deepEqual(moves, ["d4", "e4"]);
  assert.equal(response.white, 1);
  assert.equal(response.games.length, 1);
});

test("rating filter drops games below the threshold", () => {
  const response = lookupFilesExplorer(annotated, START_FEN, {
    ...DEFAULT_EXPLORER_FILTERS,
    minRating: 2500,
  });
  assert.equal(response.moves.length, 0);
  assert.equal(response.notice, "No games match these filters.");
});

const E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const C4_FEN = "rnbqkbnr/pppppppp/8/8/2P5/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";

function secondDb(): FileDatabase {
  return {
    id: "db-2",
    remoteId: null,
    name: "Second",
    folderId: null,
    games: [
      {
        id: "g2",
        white: "C",
        black: "D",
        result: "1/2-1/2",
        event: "Test",
        date: "2021.05.06",
        title: "C vs D",
        pgn: `[Event "Test"]
[White "C"]
[Black "D"]
[Result "1/2-1/2"]
[Date "2021.05.06"]

1. e4 e5 1/2-1/2`,
      },
    ],
  };
}

test("searchFilesForPosition lists every database containing the position", () => {
  const other = secondDb();
  const hits = searchFilesForPosition([annotated, other], E4_FEN);
  assert.equal(hits.length, 2);
  assert.deepEqual(
    hits.map((hit) => hit.databaseId),
    ["db-1", "db-2"],
  );
  assert.deepEqual(
    hits.map((hit) => hit.databaseName),
    ["Notes", "Second"],
  );
  assert.equal(hits[0]?.games.length, 1);
  assert.equal(hits[0]?.games[0]?.id, "g1");
  assert.equal(hits[1]?.games.length, 1);
  assert.equal(hits[1]?.games[0]?.id, "g2");
  // Row fields mirror the explorer listing.
  assert.equal(hits[0]?.games[0]?.whiteName, "A");
  assert.equal(hits[0]?.games[0]?.winner, "white");
  assert.equal(hits[0]?.games[0]?.year, 2020);
});

test("searchFilesForPosition returns empty when no database has the position", () => {
  const hits = searchFilesForPosition([annotated, secondDb()], C4_FEN);
  assert.deepEqual(hits, []);
});

test("searchFilesForPosition dedupes, skips invalid games, and cache-hits", () => {
  const duplicated: FileDatabase = {
    ...annotated,
    games: [...annotated.games, { ...annotated.games[0]! }],
  };
  const invalid: FileDatabase = {
    id: "db-bad",
    remoteId: null,
    name: "Bad",
    folderId: null,
    games: [
      {
        id: "bad-1",
        white: "",
        black: "",
        result: "*",
        event: "",
        date: "",
        title: "Bad",
        pgn: "",
      },
    ],
  };
  const first = searchFilesForPosition([duplicated, invalid], E4_FEN);
  assert.equal(first.length, 1);
  assert.equal(first[0]?.games.length, 1);
  const second = searchFilesForPosition([duplicated, invalid], E4_FEN);
  assert.deepEqual(second, first);
});
