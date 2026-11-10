import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_LIBRARY_FILTERS, type LibraryGameItem, type LibraryQueryResult } from "@/src/lib/library/types";
import { useLibraryStore } from "./library-store";
import { useLibraryGames } from "./use-library-games";

before(() => setupDom());
after(() => teardownDom());
beforeEach(() => useLibraryStore.setState({ filters: DEFAULT_LIBRARY_FILTERS, selectedKey: null }));
afterEach(() => cleanup());

function game(id: string): LibraryGameItem {
  return {
    key: `my-games:${id}`, sourceId: "my-games", gameId: id, white: "W" + id, whiteElo: null,
    black: "B" + id, blackElo: null, result: "1-0", eco: null, opening: null, plyCount: null,
    event: null, date: null,
  };
}
const page = (ids: string[], extra: Partial<LibraryQueryResult> = {}): LibraryQueryResult => ({
  items: ids.map(game), nextCursor: null, total: ids.length, sourceErrors: {}, ...extra,
});

type Call = { signal: AbortSignal; resolve: (r: LibraryQueryResult) => void; reject: (e: unknown) => void };

function makeQuery() {
  const calls: Call[] = [];
  const query = (_f: unknown, _c: unknown, _l: number, signal: AbortSignal) =>
    new Promise<LibraryQueryResult>((resolve, reject) => calls.push({ signal, resolve, reject }));
  return { calls, query };
}

test("aborts the previous request and keeps old rows while the new one runs", async () => {
  const { calls, query } = makeQuery();
  const { result } = renderHook(() => useLibraryGames(query));
  assert.equal(result.current.loading, true);
  await act(async () => calls[0].resolve(page(["1", "2"])));
  assert.deepEqual(result.current.items.map((i) => i.gameId), ["1", "2"]);

  act(() => useLibraryStore.getState().setQuery("x"));
  await waitFor(() => assert.equal(calls.length, 2));
  assert.equal(result.current.loading, true);
  assert.deepEqual(result.current.items.map((i) => i.gameId), ["1", "2"], "old rows kept");

  act(() => useLibraryStore.getState().setQuery("xy"));
  await waitFor(() => assert.equal(calls.length, 3));
  assert.equal(calls[1].signal.aborted, true);

  // A stale answer from the aborted request must not overwrite state.
  await act(async () => calls[1].resolve(page(["stale"])));
  assert.deepEqual(result.current.items.map((i) => i.gameId), ["1", "2"]);
  await act(async () => calls[2].resolve(page(["3"])));
  assert.deepEqual(result.current.items.map((i) => i.gameId), ["3"]);
  assert.equal(result.current.loading, false);
});

test("exposes errors, source errors, and retry", async () => {
  const { calls, query } = makeQuery();
  const { result } = renderHook(() => useLibraryGames(query));
  await act(async () => calls[0].reject(new Error("boom")));
  assert.equal(result.current.error, "boom");
  assert.equal(result.current.loading, false);

  act(() => result.current.retry());
  await waitFor(() => assert.equal(calls.length, 2));
  await act(async () => calls[1].resolve(page(["1"], { sourceErrors: { masters: "down" } })));
  assert.equal(result.current.error, null);
  assert.deepEqual(result.current.sourceErrors, { masters: "down" });
});

test("loadMore appends the next page without duplicates", async () => {
  const { calls, query } = makeQuery();
  const { result } = renderHook(() => useLibraryGames(query));
  await act(async () => calls[0].resolve(page(["1", "2"], { nextCursor: "c1" })));
  act(() => result.current.loadMore());
  await waitFor(() => assert.equal(calls.length, 2));
  await act(async () => calls[1].resolve(page(["2", "3"])));
  assert.deepEqual(result.current.items.map((i) => i.gameId), ["1", "2", "3"]);
  assert.equal(result.current.hasMore, false);
});
