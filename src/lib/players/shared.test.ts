import assert from "node:assert/strict";
import test from "node:test";
import { isSource, mapWithConcurrency, playerResult, safeQuery } from "./shared.ts";

test("playerResult maps win/loss/draw for a given color", () => {
  assert.equal(playerResult("white", "white"), "win");
  assert.equal(playerResult("white", "black"), "loss");
  assert.equal(playerResult("black", "black"), "win");
  assert.equal(playerResult("black", "white"), "loss");
  assert.equal(playerResult("draw", "white"), "draw");
  assert.equal(playerResult(null, "white"), null);
});

test("safeQuery strips filter punctuation and trims to 48 characters", () => {
  assert.equal(safeQuery("  magnus  "), "magnus");
  assert.equal(safeQuery("a%b_c,d(e)f\"g"), "a b c d e f g");
  assert.equal(safeQuery("x".repeat(60)).length, 48);
});

test("isSource accepts only the three known providers", () => {
  assert.equal(isSource("lichess"), true);
  assert.equal(isSource("chesscom"), true);
  assert.equal(isSource("studio"), true);
  assert.equal(isSource("fide"), false);
  assert.equal(isSource(""), false);
});

test("mapWithConcurrency preserves input order when later items resolve first", async () => {
  const delays = [30, 5, 15, 1];
  const result = await mapWithConcurrency(delays, 4, async (ms, index) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return index;
  });
  assert.deepEqual(result, [0, 1, 2, 3]);
});

test("mapWithConcurrency never exceeds the limit", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const resolvers: Array<() => void> = [];
  const done = mapWithConcurrency([0, 1, 2, 3, 4], 2, async (item) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise<void>((resolve) => {
      resolvers.push(resolve);
    });
    inFlight -= 1;
    return item;
  });
  // Let both initial workers start.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(maxInFlight, 2);
  while (resolvers.length > 0) {
    const batch = resolvers.splice(0, resolvers.length);
    for (const resolve of batch) {
      resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.deepEqual(await done, [0, 1, 2, 3, 4]);
  assert.equal(maxInFlight, 2);
});

test("mapWithConcurrency finishes four items in about two waves at limit 2", async () => {
  const started: number[] = [];
  const t0 = Date.now();
  const result = await mapWithConcurrency([0, 1, 2, 3], 2, async (item) => {
    started.push(item);
    await new Promise((resolve) => setTimeout(resolve, 40));
    return item;
  });
  const elapsed = Date.now() - t0;
  assert.deepEqual(result, [0, 1, 2, 3]);
  assert.deepEqual(started.slice(0, 2).sort(), [0, 1]);
  assert.ok(elapsed < 160, `expected ~2 waves, took ${elapsed}ms`);
  assert.ok(elapsed >= 70, `expected parallel waves, took ${elapsed}ms`);
});

test("mapWithConcurrency handles empty input and clamps bad limits", async () => {
  assert.deepEqual(await mapWithConcurrency([], 2, async (x: number) => x), []);
  assert.deepEqual(await mapWithConcurrency([1, 2], 0, async (x) => x * 2), [2, 4]);
});

test("mapWithConcurrency propagates rejections", async () => {
  await assert.rejects(() =>
    mapWithConcurrency([1, 2, 3], 2, async (x) => {
      if (x === 2) {
        throw new Error("boom");
      }
      return x;
    }),
  );
});
