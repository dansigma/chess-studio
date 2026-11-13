import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryFromPgn } from "./user-files";

// SIG-1323 review: the Files-panel path (importFileDatabase → libraryFromPgn)
// uses the same 5,000-game cap as the Library import, not the old 500.
test("libraryFromPgn keeps more than 500 games (same cap as the Library import)", () => {
  const game = (i: number) => `[White "W${i}"]\n[Black "B${i}"]\n[Result "*"]\n\n1. e4 e5 *`;
  const pgn = Array.from({ length: 600 }, (_, i) => game(i)).join("\n\n");
  const db = libraryFromPgn("Big", pgn, null);
  assert.equal(db.games.length, 600);
});
