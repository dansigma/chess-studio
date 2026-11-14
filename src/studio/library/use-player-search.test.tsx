// SIG-1333: the Players search merges local PGN players with the server hits.
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PlayerHit } from "@/src/lib/player-types";
import type { FileDatabase } from "@/src/lib/user-files";

const { usePlayerSearch } = await import("./use-player-search.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { EMPTY_FILES } = await import("@/src/lib/user-files.ts");

const realFetch = globalThis.fetch;
let serverHits: PlayerHit[] = [];
let fail = false;

const databases: FileDatabase[] = [
  {
    id: "d1",
    remoteId: null,
    name: "mine",
    folderId: null,
    games: [
      { id: "1", white: "Carlsen, Magnus", black: "Zed", result: "1-0", event: "", date: "", pgn: "", title: "" },
      { id: "2", white: "Carlsen, Magnus", black: "Zed", result: "1-0", event: "", date: "", pgn: "", title: "" },
    ],
  },
];

before(() => setupDom());
after(() => teardownDom());
beforeEach(() => {
  serverHits = [];
  fail = false;
  globalThis.fetch = (async () => {
    if (fail) {
      return new Response("{}", { status: 500 });
    }
    return new Response(JSON.stringify({ players: serverHits }), { status: 200 });
  }) as typeof fetch;
  act(() => useStudioStore.setState({ files: { ...EMPTY_FILES, databases } }));
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  useStudioStore.setState({ files: EMPTY_FILES });
});

test("finds local players without waiting for (or having) the server", async () => {
  fail = true;
  const { result } = renderHook(() => usePlayerSearch());
  act(() => result.current.setQuery("carls"));
  assert.deepEqual(result.current.hits.map((hit) => hit.id), ["studio:Carlsen, Magnus"]);
  await waitFor(() => assert.equal(result.current.loading, false), { timeout: 2000 });
  assert.deepEqual(result.current.hits.map((hit) => hit.id), ["studio:Carlsen, Magnus"], "kept after a server error");
});

test("a player found locally and on the server shows once", async () => {
  serverHits = [
    { id: "lichess:carlsen", source: "lichess", username: "carlsen", displayName: "carlsen", subtitle: "x" },
    { id: "studio:carlsen, magnus", source: "studio", username: "carlsen, magnus", displayName: "Magnus", subtitle: "Sample book" },
  ];
  const { result } = renderHook(() => usePlayerSearch());
  act(() => result.current.setQuery("carls"));
  await waitFor(() => assert.equal(result.current.hits.length, 2), { timeout: 2000 });
  assert.deepEqual(result.current.hits.map((hit) => hit.id), ["lichess:carlsen", "studio:carlsen, magnus"]);
  assert.equal(result.current.hits[1].inDatabases, true);
});

test("a short query returns no hits", () => {
  const { result } = renderHook(() => usePlayerSearch());
  act(() => result.current.setQuery("c"));
  assert.deepEqual(result.current.hits, []);
});
