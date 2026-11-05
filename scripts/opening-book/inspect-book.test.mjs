// scripts/opening-book/inspect-book.test.mjs
// SIG-1229: the explorer comparison retries until the answer is complete and
// never counts a partial one.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explorerPlies } from "./inspect-book.mjs";

function scripted(answers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const next = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (next instanceof Error) {
      throw next;
    }
    return { json: async () => next };
  };
  return { calls, fetchImpl };
}

const partial = { available: true, partial: true, plies: 6 };
const complete = (plies) => ({ available: true, partial: false, plies });

describe("explorerPlies", () => {
  it("retries a partial answer until complete and reports the retries", async () => {
    const { calls, fetchImpl } = scripted([partial, partial, complete(11)]);
    const waits = [];
    const result = await explorerPlies("http://x/api", ["e2e4"], { fetchImpl, delayMs: 7, sleep: async (ms) => waits.push(ms) });
    assert.deepEqual(result, { plies: 11, retries: 2, status: "complete" });
    assert.equal(calls.length, 3);
    assert.deepEqual(waits, [7, 7]);
    assert.deepEqual(calls[0].body, { moves: ["e2e4"] });
  });

  it("a complete first answer needs no retry and no wait", async () => {
    const { fetchImpl } = scripted([complete(9)]);
    const result = await explorerPlies("u", [], { fetchImpl, sleep: async () => assert.fail("must not wait") });
    assert.deepEqual(result, { plies: 9, retries: 0, status: "complete" });
  });

  it("never returns the length of a partial answer, even after the retries run out", async () => {
    const { calls, fetchImpl } = scripted([partial]);
    const result = await explorerPlies("u", [], { fetchImpl, retries: 3, sleep: async () => undefined });
    assert.deepEqual(result, { plies: null, retries: 3, status: "partial" });
    assert.equal(calls.length, 4);
  });

  it("unavailable answers and network errors are retried too and end as unavailable", async () => {
    const { fetchImpl } = scripted([{ available: false }, new Error("offline"), complete(4)]);
    const done = await explorerPlies("u", [], { fetchImpl, sleep: async () => undefined });
    assert.deepEqual(done, { plies: 4, retries: 2, status: "complete" });
    const down = await explorerPlies("u", [], { fetchImpl: scripted([new Error("offline")]).fetchImpl, retries: 1, sleep: async () => undefined });
    assert.deepEqual(down, { plies: null, retries: 1, status: "unavailable" });
  });
});
