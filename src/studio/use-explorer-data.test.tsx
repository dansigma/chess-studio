import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { useExplorerData } from "./use-explorer-data";

before(() => setupDom());
after(() => {
  cleanup();
  teardownDom();
});

test("publishes XD moves while games are pending across the shell and a second panel", async (t) => {
  const tree = Promise.withResolvers<Response>();
  const games = Promise.withResolvers<Response>();
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", (input: string, init?: RequestInit) => {
    if (init?.priority === "low") return Promise.resolve(Response.json({ total: 0, opening: null, moves: [] }));
    calls.push(input.split("?")[0]);
    return input.includes("/tree?") ? tree.promise : games.promise;
  });
  const { result } = renderHook(() => ({
    shell: useExplorerData("xadrez-digital", 0, true),
    panel: useExplorerData("xadrez-digital"),
  }));
  assert.deepEqual(calls, ["/api/xd-database/tree", "/api/xd-database/games"]);
  assert.equal(result.current.shell.gamesLoading, true);

  await act(async () => tree.resolve(Response.json({
    total: 12, opening: null,
    moves: [{ uci: "e2e4", white: 12, draws: 0, black: 0 }],
  })));
  assert.equal(result.current.shell.loading, false);
  assert.equal(result.current.shell.gamesLoading, true);
  assert.equal(result.current.shell.explorer?.moves[0].san, "e4");
  assert.equal(result.current.panel.explorer?.moves[0].san, "e4");
  assert.deepEqual(result.current.shell.explorer?.games, []);

  await act(async () => games.resolve(Response.json({ games: [{ id: 42, date: null }], nextCursor: null })));
  assert.equal(result.current.shell.gamesLoading, false);
  const rows = result.current.shell.explorer?.games as { id: string }[] | undefined;
  assert.equal(rows?.[0].id, "42");
});
