import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { fenFromShareSearch, shareBoardUrl } from "./share-board.ts";

const E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

test("a share link points at the studio with the position", () => {
  const url = shareBoardUrl("http://localhost:3000", `  ${E4}  `);
  assert.equal(url, `http://localhost:3000/studio?fen=${encodeURIComponent(E4).replaceAll("%20", "+")}`);
  assert.equal(fenFromShareSearch(new URL(url).search), new Chess(E4).fen());
});

test("a bad share link does not open a position", () => {
  assert.equal(fenFromShareSearch(""), null);
  assert.equal(fenFromShareSearch("?fen=not-a-position"), null);
});
