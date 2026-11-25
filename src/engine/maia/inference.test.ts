import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMaia, chancesFromValue, type RunMaiaModel } from "./inference.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function fakeModel(): { run: RunMaiaModel; calls: () => number } {
  let calls = 0;
  const run: RunMaiaModel = async () => {
    calls++;
    // Distinct logits so the ranking is deterministic.
    return {
      moveLogits: Float32Array.from({ length: 4096 + 256 }, (_, index) => index / 1000),
      valueLogits: Float32Array.of(0, 0, 0),
    };
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
  const run: RunMaiaModel = async () => ({ moveLogits: new Float32Array(10), valueLogits: new Float32Array(3) });
  await assert.rejects(analyzeMaia({ fens: [START], elo: 1500, lines: 3 }, run), /vocabulary/);
});

test("Maia skips the model when the side to move has no legal move", async () => {
  let calls = 0;
  const run: RunMaiaModel = async () => {
    calls++;
    return { moveLogits: new Float32Array(), valueLogits: new Float32Array() };
  };
  const stalemate = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";
  assert.deepEqual(await analyzeMaia({ fens: [stalemate], elo: 1500, lines: 3 }, run), { moves: [], chances: null });
  assert.equal(calls, 0);
});

test("position chances map the side to move's [loss, draw, win] to White and Black", () => {
  const logits = Float32Array.of(Math.log(0.2), Math.log(0.3), Math.log(0.5));
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
  const white = chancesFromValue(logits, "w");
  assert.ok(white);
  near(white.white, 0.5); near(white.draw, 0.3); near(white.black, 0.2);
  const black = chancesFromValue(logits, "b");
  assert.ok(black);
  near(black.white, 0.2); near(black.draw, 0.3); near(black.black, 0.5);
  assert.equal(chancesFromValue(new Float32Array(2), "w"), null);
});

test("Maia returns the position chances from the same pass as the moves", async () => {
  const run: RunMaiaModel = async () => ({
    moveLogits: Float32Array.from({ length: 4096 + 256 }, (_, index) => index / 1000),
    valueLogits: Float32Array.of(Math.log(0.11), Math.log(0.74), Math.log(0.15)),
  });
  const { chances } = await analyzeMaia({ fens: [START], elo: 2600, lines: 3 }, run);
  assert.ok(chances);
  assert.ok(Math.abs(chances.white - 0.15) < 1e-6 && Math.abs(chances.black - 0.11) < 1e-6);
});
