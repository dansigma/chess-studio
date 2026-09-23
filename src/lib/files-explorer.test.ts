import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN } from "../chess/tree.ts";
import { DEFAULT_EXPLORER_FILTERS } from "./explorer-filters.ts";
import { lookupFilesExplorer } from "./files-explorer.ts";
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
