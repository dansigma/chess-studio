// SIG-1229: the deployed manifest keeps the shape the app (and the union tool) rely on.
import assert from "node:assert/strict";
import test from "node:test";
import { OPENING_BOOK_MANIFEST } from "./opening-book-manifest.ts";

test("version and file name agree and are what the review cache key and the loader use", () => {
  assert.ok(Number.isInteger(OPENING_BOOK_MANIFEST.version) && OPENING_BOOK_MANIFEST.version >= 1);
  assert.equal(OPENING_BOOK_MANIFEST.file, `opening-book-v${OPENING_BOOK_MANIFEST.version}.bin.gz`);
  assert.equal(OPENING_BOOK_MANIFEST.format, 1);
});
