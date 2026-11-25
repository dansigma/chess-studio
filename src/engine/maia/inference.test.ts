import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMaia, type RunMaiaModel } from "./inference.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function fakeModel(): { run: RunMaiaModel; valueBatches: number[] } {
  const valueBatches: number[] = [];
  const run: RunMaiaModel = async (_tokens, batch, _elo, output) => {
    if (output === "value_logits") {
      valueBatches.push(batch);
      return new Float32Array(batch * 3);
    }
    // Distinct logits so the ranking is deterministic.
    return Float32Array.from({ length: 4096 + 256 }, (_, index) => index / 1000);
  };
  return { run, valueBatches };
}

for (const lines of [1, 3, 5]) {
  test(`Maia returns and scores only the ${lines} most likely moves`, async () => {
    const { run, valueBatches } = fakeModel();
    const { moves } = await analyzeMaia({ fens: [START], elo: 1500, lines }, run);
    assert.equal(moves.length, lines);
    assert.deepEqual(valueBatches, [lines]);
    assert.ok(moves.every((move, index) => index === 0 || moves[index - 1].prob >= move.prob));
  });
}

test("Maia rejects a model whose move output is smaller than the vocabulary", async () => {
  const run: RunMaiaModel = async () => new Float32Array(10);
  await assert.rejects(analyzeMaia({ fens: [START], elo: 1500, lines: 3 }, run), /vocabulary/);
});
