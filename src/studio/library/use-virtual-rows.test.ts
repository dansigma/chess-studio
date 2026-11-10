import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVirtualWindow, nearEnd, scrollTopToReveal } from "./use-virtual-rows";
import { moveSelection, nextSort, visibleColumns, LIBRARY_COLUMNS } from "./library-columns";

test("window covers the viewport plus overscan", () => {
  const w = computeVirtualWindow({ count: 5000, rowHeight: 28, scrollTop: 2800, viewportHeight: 280, overscan: 5 });
  assert.equal(w.start, 95);
  assert.equal(w.end, 115);
  assert.equal(w.offsetTop, 95 * 28);
  assert.equal(w.totalHeight, 5000 * 28);
});

test("window clamps at both ends and handles empty lists", () => {
  assert.deepEqual(computeVirtualWindow({ count: 3, rowHeight: 28, scrollTop: 0, viewportHeight: 280 }).end, 3);
  assert.equal(computeVirtualWindow({ count: 0, rowHeight: 28, scrollTop: 0, viewportHeight: 280 }).end, 0);
  const last = computeVirtualWindow({ count: 100, rowHeight: 10, scrollTop: 99999, viewportHeight: 100, overscan: 2 });
  assert.equal(last.end, 100);
});

test("scrollTopToReveal keeps the row in view", () => {
  const base = { rowHeight: 28, viewportHeight: 280 };
  assert.equal(scrollTopToReveal({ ...base, index: 3, scrollTop: 0 }), 0);
  assert.equal(scrollTopToReveal({ ...base, index: 20, scrollTop: 0 }), 21 * 28 - 280);
  assert.equal(scrollTopToReveal({ ...base, index: 1, scrollTop: 280 }), 28);
});

test("nearEnd triggers close to the loaded end", () => {
  assert.equal(nearEnd(45, 50), true);
  assert.equal(nearEnd(20, 50), false);
  assert.equal(nearEnd(0, 0), false);
});

test("moveSelection and nextSort", () => {
  assert.equal(moveSelection("ArrowDown", -1, 5), 0);
  assert.equal(moveSelection("ArrowDown", 4, 5), 4);
  assert.equal(moveSelection("ArrowUp", 0, 5), 0);
  assert.equal(moveSelection("x", 0, 5), null);
  const white = LIBRARY_COLUMNS[0]!;
  assert.deepEqual(nextSort({ key: "date", direction: "desc" }, white), { key: "white", direction: "asc" });
  assert.deepEqual(nextSort({ key: "white", direction: "asc" }, white), { key: "white", direction: "desc" });
});

test("narrow panels hide Elo and Event", () => {
  assert.equal(visibleColumns(1000).length, 8);
  assert.deepEqual(visibleColumns(400).map((c) => c.key), ["white", "black", "result", "eco", "plyCount"]);
});
