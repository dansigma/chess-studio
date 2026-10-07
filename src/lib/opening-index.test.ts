import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN } from "../chess/tree.ts";
import { lookupOpeningIndex } from "./opening-index.ts";

// The repo ships no data/opening-index.sqlite, so the lookup must take the
// missing-file null path (openIndex caches null after the first call, which
// is fine — the assertion is the same on every call).
test("lookupOpeningIndex returns null when the sqlite index file is missing", () => {
  assert.equal(lookupOpeningIndex(START_FEN), null);
});
