import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { bookKey } from "@/src/chess/opening-book";
import { decodeCountsBook, encodeCountsBook } from "@/src/chess/opening-book-counts-format";
import { encodeMove } from "@/src/chess/opening-book-format";
import { START_FEN } from "@/src/chess/tree";

const loadCountsBook = mock.fn(async () => null as ReturnType<typeof decodeCountsBook> | null);
mock.module("./opening-book-counts.ts", { namedExports: { loadCountsBook } });
const { loadVariationBook } = await import("./variation-book.ts");

const options = { startUci: [], color: "white", level: "beginner" } as const;

test("reports unavailable when the counts book is missing", async () => {
  assert.deepEqual(await loadVariationBook({ ...options, startUci: ["e2e4"] }), { unavailable: true });
});

test("builds the variation from the loaded counts", async () => {
  const bytes = encodeCountsBook([
    { key: bookKey(START_FEN), move: encodeMove("e2e4"), count: 20, total: 100 },
  ], { maxPly: 40 });
  loadCountsBook.mock.mockImplementationOnce(async () => decodeCountsBook(bytes));
  const result = await loadVariationBook(options);
  assert.ok("tree" in result);
  assert.equal(result.tree.children[0].uci, "e2e4");
  assert.equal(result.lines, 1);
  assert.equal(result.userMoves, 1);
});
