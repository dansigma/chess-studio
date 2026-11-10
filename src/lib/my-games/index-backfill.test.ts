import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runMyGamesBackfill, type BackfillBatch } from "./index-backfill.ts";

function scripted(batches: BackfillBatch[]) {
  let calls = 0;
  return {
    post: async () => {
      const batch = batches[Math.min(calls, batches.length - 1)];
      calls += 1;
      return batch;
    },
    calls: () => calls,
  };
}

const signal = new AbortController().signal;

describe("runMyGamesBackfill", () => {
  it("runs batches until nothing is left and reports progress", async () => {
    const { post, calls } = scripted([
      { ok: true, indexed: 25, remaining: 30 },
      { ok: true, indexed: 25, remaining: 5 },
      { ok: true, indexed: 5, remaining: 0 },
    ]);
    const progress: Array<number | null> = [];
    const outcome = await runMyGamesBackfill({ post, signal, onProgress: (r) => progress.push(r) });
    assert.deepEqual(outcome, { status: "done", indexed: 55 });
    assert.deepEqual(progress, [30, 5, 0]);
    assert.equal(calls(), 3);
  });

  it("stops when a batch indexes nothing", async () => {
    const { post, calls } = scripted([{ ok: true, indexed: 0, remaining: 2 }]);
    assert.deepEqual(await runMyGamesBackfill({ post, signal }), { status: "stalled", indexed: 0, remaining: 2 });
    assert.equal(calls(), 1);
  });

  it("treats a signed-out user as done and reports other errors", async () => {
    assert.equal((await runMyGamesBackfill({ post: scripted([{ ok: false, status: 401, message: "x" }]).post, signal })).status, "done");
    assert.deepEqual(
      await runMyGamesBackfill({ post: scripted([{ ok: false, status: 429, message: "Too many" }]).post, signal }),
      { status: "error", indexed: 0, message: "Too many" },
    );
  });

  it("respects the call cap and abort", async () => {
    const { post, calls } = scripted([{ ok: true, indexed: 1, remaining: 99 }]);
    assert.equal((await runMyGamesBackfill({ post, signal, maxCalls: 3 })).status, "stalled");
    assert.equal(calls(), 3);
    const controller = new AbortController();
    controller.abort();
    assert.equal((await runMyGamesBackfill({ post, signal: controller.signal })).status, "aborted");
  });
});
