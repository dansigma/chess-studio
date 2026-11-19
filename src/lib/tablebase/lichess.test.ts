import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchTablebase, TABLEBASE_OUTCOMES } from "./lichess";

const signal = new AbortController().signal;
const fen = (file: number, counters = "0 1") => {
  const pawnRank = [file || "", "P", 7 - file || ""].join("");
  return `4k3/8/8/8/8/8/${pawnRank}/4K3 w - - ${counters}`;
};
const move = { uci: "a2a3", san: "a3", category: "loss", dtz: -12, dtm: null };
const payload = { category: "win", dtz: 13, dtm: null, moves: [move] };

test("maps success, keeps move order and reuses results across move counters", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(new URL(url).searchParams.get("fen"), fen(0));
    return Response.json(payload);
  });
  const result = await fetchTablebase(fen(0), signal);
  assert.deepEqual(result, { ...payload, available: true, bestMove: move });
  assert.equal(await fetchTablebase(fen(0, "42 90"), signal), result);
  assert.equal(fetch.mock.callCount(), 1);
});

test("maps all eight categories, including 50-move draws and opponent results", async (t) => {
  const categories = [
    ["win", "Win", "Loss"],
    ["loss", "Loss", "Win"],
    ["draw", "Draw", "Draw"],
    ["cursed-win", "Draw", "Draw"],
    ["blessed-loss", "Draw", "Draw"],
    ["maybe-win", "Possible win", "Possible loss"],
    ["maybe-loss", "Possible loss", "Possible win"],
    ["unknown", "Unknown", "Unknown"],
  ] as const;
  let index = 0;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ ...payload, category: categories[index][0], moves: [] }),
  );
  for (const [category, label, moveLabel] of categories) {
    const kingRank = [index || "", "K", 7 - index || ""].join("");
    const result = await fetchTablebase(`4k3/8/8/8/8/8/PP6/${kingRank} w - - 0 1`, signal);
    assert.deepEqual(result, { available: true, category, dtz: 13, dtm: null, moves: [], bestMove: null });
    assert.equal(TABLEBASE_OUTCOMES[category].label, label);
    assert.equal(TABLEBASE_OUTCOMES[category].moveLabel, moveLabel);
    index++;
  }
});

test("passes a five-second timeout signal through to fetch", async (t) => {
  const timeout = new AbortController();
  const timer = t.mock.method(AbortSignal, "timeout", () => timeout.signal);
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const requestSignal = init.signal!;
    timeout.abort(new DOMException("Timed out", "TimeoutError"));
    requestSignal.throwIfAborted();
    throw new Error("Expected abort");
  });
  assert.deepEqual(await fetchTablebase(fen(1), signal), { available: false, reason: "timeout" });
  assert.deepEqual(timer.mock.calls[0].arguments, [5000]);
});

for (const [reason, response] of [
  ["network", () => { throw new TypeError("offline"); }],
  ["http-400", () => new Response("illegal", { status: 400 })],
  ["http-503", () => new Response("", { status: 503 })],
  ["invalid-response", () => new Response("{")],
  ["invalid-response", () => Response.json({ ...payload, moves: [{}] })],
] as const) {
  test(`returns unavailable for ${reason}`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => response());
    assert.deepEqual(await fetchTablebase(fen(1), signal), { available: false, reason });
  });
}

test("429 pauses new requests for 60 seconds and still serves cached positions", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 429 }));
  const rateLimited = { available: false, reason: "rate-limited" };
  assert.deepEqual(await fetchTablebase(fen(2), signal), rateLimited);
  assert.equal((await fetchTablebase(fen(0), signal)).available, true);
  now += 59_999;
  assert.deepEqual(await fetchTablebase(fen(3), signal), rateLimited);
  assert.equal(fetch.mock.callCount(), 1);
  now++;
  assert.deepEqual(await fetchTablebase(fen(3), signal), rateLimited);
  assert.equal(fetch.mock.callCount(), 2);
});

test("429 falls back to an entry cached by a concurrent request", async (t) => {
  t.mock.method(Date, "now", () => Date.UTC(2100, 0, 1));
  let limit!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { limit = resolve; });
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(payload));
  fetch.mock.mockImplementationOnce(() => pending);
  const first = fetchTablebase(fen(4), signal);
  const cached = await fetchTablebase(fen(4), signal);
  limit(new Response(null, { status: 429 }));
  assert.equal(await first, cached);
});
