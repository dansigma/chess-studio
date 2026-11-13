import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePgnCollectionAsync } from "./pgn-games";

const game = (n: number) => `[Event "g${n}"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n\n`;
const junk = (n: number) => `[Event "bad${n}"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n*\n\n`;
const many = (count: number) => Array.from({ length: count }, (_, i) => game(i)).join("");

test("parses all games, reports progress per batch and ends at done === total", async () => {
  const calls: Array<{ done: number; total: number }> = [];
  const result = await parsePgnCollectionAsync(many(120), { batchSize: 50, onProgress: (p) => calls.push(p) });
  assert.equal(result.games.length, 120);
  assert.deepEqual(result.unreadable, 0);
  assert.equal(result.overLimit, 0);
  assert.deepEqual(calls[0], { done: 0, total: 120 });
  assert.deepEqual(calls.at(-1), { done: 120, total: 120 });
  assert.ok(calls.length >= 4);
});

test("counts unreadable games apart from over-limit ones", async () => {
  const result = await parsePgnCollectionAsync(game(1) + junk(1) + game(2) + junk(2), { batchSize: 2 });
  assert.equal(result.games.length, 2);
  assert.equal(result.unreadable, 2);
  assert.equal(result.overLimit, 0);
});

test("stops at the limit and reports the rest as over the limit", async () => {
  const result = await parsePgnCollectionAsync(many(30), { limit: 10, batchSize: 4 });
  assert.equal(result.games.length, 10);
  assert.equal(result.overLimit, 20);
  assert.equal(result.unreadable, 0);
});

test("the default limit is 5,000 games", async () => {
  const result = await parsePgnCollectionAsync(many(5003), { batchSize: 500 });
  assert.equal(result.games.length, 5000);
  assert.equal(result.overLimit, 3);
});

test("abort mid-file throws AbortError", async () => {
  const controller = new AbortController();
  await assert.rejects(
    parsePgnCollectionAsync(many(200), {
      batchSize: 20,
      signal: controller.signal,
      onProgress: ({ done }) => {
        if (done >= 40) controller.abort();
      },
    }),
    (error: Error) => error.name === "AbortError",
  );
});

test("an already aborted signal throws before parsing", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(parsePgnCollectionAsync(many(3), { signal: controller.signal }), { name: "AbortError" });
});
