import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useTablebase } from "./useTablebase";

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

test("debounces eligible positions, cancels previous lookups and hides stale results", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  t.mock.method(globalThis, "fetch", (_: string, { signal }: { signal: AbortSignal }) =>
    new Promise<Response>((resolve) => calls.push({ signal, resolve })),
  );
  const fens = [
    "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
    "4k3/8/8/8/8/8/8/4K2R w K - 0 1",
    "4k3/ppp5/8/8/8/8/PP6/4K3 w - - 0 1",
    "4k3/ppp5/8/8/8/8/PPP5/4K3 w - - 0 1",
  ];
  const { result, rerender } = renderHook(({ fen }) => useTablebase(fen), { initialProps: { fen: fens[0] } });
  t.mock.timers.tick(250);
  assert.equal(calls.length, 0);

  rerender({ fen: fens[1] });
  t.mock.timers.tick(249);
  rerender({ fen: fens[2] });
  t.mock.timers.tick(249);
  assert.equal(calls.length, 0);
  assert.equal(result.current, null);
  t.mock.timers.tick(1);
  assert.equal(calls.length, 1);

  rerender({ fen: fens[1] });
  assert.equal(calls[0].signal.aborted, true);
  t.mock.timers.tick(250);
  assert.equal(calls.length, 2);
  const response = () => Response.json({ category: "win", dtz: null, dtm: null, moves: [] });
  await act(async () => calls[0].resolve(response()));
  assert.equal(result.current, null);
  await act(async () => calls[1].resolve(response()));
  assert.deepEqual(result.current, {
    available: true, category: "win", dtz: null, dtm: null, moves: [], bestMove: null,
  });

  rerender({ fen: fens[3] });
  t.mock.timers.tick(250);
  assert.equal(calls.length, 2);
  assert.equal(result.current, null);
});
