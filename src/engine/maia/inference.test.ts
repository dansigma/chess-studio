import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMaia, type RunMaiaModel } from "./inference.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function fakeModel(): { run: RunMaiaModel; calls: () => number } {
  let calls = 0;
  const run: RunMaiaModel = async () => {
    calls++;
    // Distinct logits so the ranking is deterministic.
    return Float32Array.from({ length: 4096 + 256 }, (_, index) => index / 1000);
  };
  return { run, calls: () => calls };
}

for (const lines of [1, 3, 5]) {
  test(`Maia returns the ${lines} most likely moves from one model pass`, async () => {
    const { run, calls } = fakeModel();
    const { moves } = await analyzeMaia({ fens: [START], elo: 1500, lines }, run);
    assert.equal(moves.length, lines);
    assert.equal(calls(), 1);
    assert.ok(moves.every((move, index) => index === 0 || moves[index - 1].prob >= move.prob));
  });
}

test("Maia rejects a model whose move output is smaller than the vocabulary", async () => {
  const run: RunMaiaModel = async () => new Float32Array(10);
  await assert.rejects(analyzeMaia({ fens: [START], elo: 1500, lines: 3 }, run), /vocabulary/);
});

test("Maia skips the model when the side to move has no legal move", async () => {
  let calls = 0;
  const run: RunMaiaModel = async () => { calls++; return new Float32Array(); };
  const stalemate = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";
  assert.deepEqual(await analyzeMaia({ fens: [stalemate], elo: 1500, lines: 3 }, run), { moves: [] });
  assert.equal(calls, 0);
});
