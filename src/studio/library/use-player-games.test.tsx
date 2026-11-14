// SIG-1333: one hook for any player's games (local files first, else the API).
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PlayerGame, PlayerGamesResponse, PlayerHit } from "@/src/lib/player-types";
import type { FileDatabase } from "@/src/lib/user-files";

const { usePlayerGames } = await import("./use-player-games.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { EMPTY_FILES } = await import("@/src/lib/user-files.ts");

const realFetch = globalThis.fetch;

const LICHESS: PlayerHit = { id: "lichess:magnus", source: "lichess", username: "magnus", displayName: "Magnus", subtitle: "2800" };
const LOCAL: PlayerHit = { id: "studio:Local", source: "studio", username: "Local", displayName: "Local", subtitle: "Studio database", inDatabases: true };
const BOOK: PlayerHit = { id: "studio:Book", source: "studio", username: "Book", displayName: "Book", subtitle: "Sample" };

function remoteGame(id: string): PlayerGame {
  return {
    id, winner: "white", whiteName: "A", whiteRating: null, blackName: "B", blackRating: null, year: 2024, month: 1,
    event: null, eco: null, opening: null, color: "white", playerResult: "win", playedAt: 1,
  };
}

const databases: FileDatabase[] = [
  {
    id: "d1", remoteId: null, name: "mine", folderId: null,
    games: [{
      id: "f1", white: "Local", black: "Other", result: "0-1", event: "Blitz", date: "2024.01.02",
      pgn: '[White "Local"]\n[Black "Other"]\n\n1. e4 e5 0-1\n', title: "",
    }],
  },
];

type Call = { url: URL; signal: AbortSignal | undefined; respond: (r: Response) => void; fail: (e: unknown) => void };
let calls: Call[] = [];

before(() => setupDom());
after(() => teardownDom());
beforeEach(() => {
  calls = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      calls.push({ url: new URL(String(input), "http://x"), signal: init?.signal ?? undefined, respond: resolve, fail: reject });
    })) as typeof fetch;
  act(() => useStudioStore.setState({ files: { ...EMPTY_FILES, databases } }));
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  useStudioStore.setState({ files: EMPTY_FILES });
});

const json = (body: Partial<PlayerGamesResponse>, status = 200) =>
  new Response(JSON.stringify(body), { status });

test("a local player is read from memory without any request", () => {
  const { result } = renderHook(() => usePlayerGames(LOCAL));
  assert.equal(calls.length, 0);
  assert.equal(result.current.loading, false);
  assert.equal(result.current.games.length, 1);
  assert.equal(result.current.games[0].playerResult, "loss");
  assert.equal(result.current.games[0].timeClass, "blitz");
  assert.equal(result.current.noGames, false);
});

test("no player means nothing to load", () => {
  const { result } = renderHook(() => usePlayerGames(null));
  assert.equal(calls.length, 0);
  assert.equal(result.current.loading, false);
  assert.equal(result.current.noGames, false);
});

test("an online player loads through the games endpoint, with partial/truncated/notice", async () => {
  const { result } = renderHook(() => usePlayerGames(LICHESS));
  assert.equal(result.current.loading, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, "/api/players/games");
  assert.equal(calls[0].url.searchParams.get("source"), "lichess");
  assert.equal(calls[0].url.searchParams.get("username"), "magnus");
  assert.equal(calls[0].url.searchParams.get("displayName"), "Magnus");
  await act(async () => {
    calls[0].respond(json({ player: LICHESS, games: [remoteGame("r1")], truncated: true, partial: true, notice: "cut" }));
  });
  await waitFor(() => assert.equal(result.current.loading, false));
  assert.deepEqual(result.current.games.map((g) => g.id), ["r1"]);
  assert.equal(result.current.truncated, true);
  assert.equal(result.current.partial, true);
  assert.equal(result.current.notice, "cut");
  assert.equal(result.current.error, null);
  assert.equal(result.current.noGames, false);
});

test("a sample-book studio player not in the files goes to the API", async () => {
  const { result } = renderHook(() => usePlayerGames(BOOK));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get("source"), "studio");
  await act(async () => calls[0].respond(json({ player: BOOK, games: [], truncated: false })));
  await waitFor(() => assert.equal(result.current.loading, false));
  assert.equal(result.current.noGames, true);
  assert.equal(result.current.error, null);
});

test("errors can be retried", async () => {
  const { result } = renderHook(() => usePlayerGames(LICHESS));
  await act(async () => calls[0].respond(json({}, 500)));
  await waitFor(() => assert.ok(result.current.error));
  assert.equal(result.current.loading, false);
  assert.equal(result.current.noGames, false);

  act(() => result.current.retry());
  await waitFor(() => assert.equal(calls.length, 2));
  assert.equal(result.current.loading, true);
  assert.equal(result.current.error, null);
  await act(async () => calls[1].respond(json({ player: LICHESS, games: [remoteGame("r2")], truncated: false })));
  await waitFor(() => assert.equal(result.current.loading, false));
  assert.deepEqual(result.current.games.map((g) => g.id), ["r2"]);
});

test("a network failure is an error too", async () => {
  const { result } = renderHook(() => usePlayerGames(LICHESS));
  await act(async () => calls[0].fail(new TypeError("offline")));
  await waitFor(() => assert.equal(result.current.error, "offline"));
});

test("changing the player aborts the in-flight request and ignores its answer", async () => {
  const other: PlayerHit = { ...LICHESS, id: "lichess:hikaru", username: "hikaru", displayName: "Hikaru" };
  const { result, rerender } = renderHook(({ player }) => usePlayerGames(player), { initialProps: { player: LICHESS } });
  assert.equal(calls.length, 1);
  rerender({ player: other });
  assert.equal(calls[0].signal?.aborted, true);
  assert.equal(calls.length, 2);
  assert.equal(result.current.loading, true);
  await act(async () => calls[0].respond(json({ player: LICHESS, games: [remoteGame("stale")], truncated: false })));
  assert.equal(result.current.loading, true, "stale answer ignored");
  await act(async () => calls[1].respond(json({ player: other, games: [remoteGame("fresh")], truncated: false })));
  await waitFor(() => assert.deepEqual(result.current.games.map((g) => g.id), ["fresh"]));
});
