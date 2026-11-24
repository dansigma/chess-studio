import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN } from "@/src/chess/tree";
import type { SharedEngineLease } from "@/src/engine/shared-engine";
import { collectPositionPack, type PackPosition } from "./collect-pack";

const position: PackPosition = {
  fen: START_FEN, sanLine: [], lineFens: [START_FEN], engineBuild: "lite", engineThreads: 1,
};

function fakeEngine() {
  let released = 0;
  let subscriptions = 0;
  const acquire = (slot: SharedEngineLease["slot"], build: SharedEngineLease["build"]): SharedEngineLease => {
    assert.equal(slot, "ask");
    return {
      slot, build, stop() {}, restart() {},
      analyze(...args) { assert.deepEqual(args, [position.fen, 18, 3, 1]); },
      subscribe() { subscriptions++; return () => { subscriptions--; }; },
      release() { released++; },
    };
  };
  return { acquire, stats: () => ({ released, subscriptions }) };
}

test("omits timed-out sources and still returns completed explorer data", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const engine = fakeEngine();
  const hanging: AbortSignal[] = [];
  t.mock.method(globalThis, "fetch", (url: string, init: RequestInit) => {
    if (url.startsWith("/api/explorer?")) {
      const params = new URL(url, "https://example.test").searchParams;
      assert.equal(params.get("speeds"), "blitz,rapid,classical");
      assert.equal(params.has("rating"), false);
      return Promise.resolve(Response.json({
        fen: position.fen, source: "lichess", opening: null,
        white: 1, draws: 0, black: 0, games: [],
        moves: [{ uci: "e2e4", san: "e4", games: 1, white: 1, draws: 0, black: 0, averageRating: null }],
      }));
    }
    hanging.push(init.signal!);
    return new Promise<Response>(() => {});
  });

  const pending = collectPositionPack(position, new AbortController().signal, engine.acquire);
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(4000);
  const pack = await pending;
  assert.equal(pack.lichess?.[0].san, "e4");
  assert.equal(pack.fen, position.fen);
  assert.equal(pack.engine, undefined);
  assert.equal(pack.xd, undefined);
  assert.equal(pack.xdGames, undefined);
  assert.equal(hanging.length, 2);
  assert.ok(hanging.every((signal) => signal.aborted));
  assert.deepEqual(engine.stats(), { released: 1, subscriptions: 0 });
});

test("aborting collection releases the engine and aborts in-flight fetches", async (t) => {
  const engine = fakeEngine();
  const controller = new AbortController();
  const requests: AbortSignal[] = [];
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    requests.push(init.signal!);
    return new Promise<Response>(() => {});
  });

  const pending = collectPositionPack(position, controller.signal, engine.acquire);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(requests.length, 3);
  assert.ok(requests.every((signal) => signal.aborted));
  assert.deepEqual(engine.stats(), { released: 1, subscriptions: 0 });
});
