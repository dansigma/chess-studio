import assert from "node:assert/strict";
import test from "node:test";
import { chapterIndex, chapterParam } from "./chapter-param.ts";

test("chapterParam: 1-based chapter positions round-trip through the URL", () => {
  assert.equal(chapterParam(0), "1");
  assert.equal(chapterParam(1), "2");
  for (let index = 0; index < 4; index += 1) {
    assert.equal(chapterIndex(chapterParam(index), 4), index);
  }
});

test("chapterIndex: missing, malformed or out-of-range values open the grid", () => {
  for (const value of [null, undefined, "", "0", "-1", "2.5", "abc", "5", "1e2"]) {
    assert.equal(chapterIndex(value, 4), null, String(value));
  }
  assert.equal(chapterIndex("4", 4), 3);
  assert.equal(chapterIndex("1", 0), null);
});
