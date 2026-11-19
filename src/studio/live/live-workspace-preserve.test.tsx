import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { setupDom, teardownDom } from "@/src/test-utils/dom.ts";
import type { BroadcastRoundSnapshot, LiveGame } from "@/src/lib/live/types.ts";

let roundHandler: (id: string) => Promise<BroadcastRoundSnapshot | null> = async () => null;
let pgnHandler: (id: string) => Promise<string | null> = async () => null;

mock.module("next/navigation", {
  namedExports: { useRouter: () => ({ push() {} }), usePathname: () => "/studio" },
});
mock.module("@/src/lib/live/lichess-broadcast", {
  namedExports: {
    BroadcastPageError: class BroadcastPageError extends Error {},
    LiveHttpError: class LiveHttpError extends Error {
      status: number;
      constructor(status: number) {
        super(`HTTP ${status}`);
        this.status = status;
      }
    },
    RATE_LIMIT_BACKOFF_MS: 60_000,
    fetchBroadcastPage: async () => ({ active: [], upcoming: [], past: { currentPage: 1, maxPerPage: 20, currentPageResults: [], previousPage: null, nextPage: null }, nextPage: null }),
    fetchRound: (id: string) => roundHandler(id),
    fetchRoundPgn: (id: string) => pgnHandler(id),
    fetchTour: async () => null,
    fetchTourPgn: async () => null,
    streamRound: (_id: string, _on: unknown, signal: AbortSignal) =>
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve())),
  },
});

const { ActivityBar } = await import("../ActivityBar.tsx");
const { useLiveUrlSync } = await import("./use-live-url-sync.ts");
const { useWorkspaceViewUrl } = await import("../use-workspace-view-url.ts");
const { useLiveStore, setLiveManagerDeps } = await import("./live-store.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { NotationLiveSyncBar } = await import("./NotationLiveSyncBar.tsx");

function setUrl(url: string) {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
}

function liveHarness() {
  function LiveSyncHarness() {
    useLiveUrlSync();
    return <div data-live-harness="" />;
  }
  function ShellHarness() {
    useWorkspaceViewUrl();
    const view = useStudioStore((s) => s.workspaceView);
    return (
      <>
        <ActivityBar />
        {view === "live" ? <LiveSyncHarness /> : null}
      </>
    );
  }
  return ShellHarness;
}

const sampleGame: LiveGame = {
  id: "G1",
  roundId: "R1",
  white: { name: "White", rating: 2600, title: "GM", fed: null, fideId: null, clockMs: null },
  black: { name: "Black", rating: 2580, title: "GM", fed: null, fideId: null, clockMs: null },
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  lastMoveUci: null,
  result: "*",
  thinkTimeSec: null,
  pgn: null,
  updatedAt: 0,
};

before(() => {
  setupDom();
  setLiveManagerDeps({
    fetchRound: (id) => roundHandler(id),
    streamRound: (_id, _on, signal) =>
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve())),
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
    visibility: { isHidden: () => false, subscribe: () => () => {} },
  });
});

afterEach(() => {
  cleanup();
  useLiveStore.getState().leaveLive();
});

after(async () => {
  setLiveManagerDeps(null);
  await teardownDom();
});

beforeEach(() => {
  roundHandler = async () => null;
  pgnHandler = async () => null;
  setUrl("http://localhost/studio");
  act(() => {
    useStudioStore.setState({ workspaceView: "studio", settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  });
});

test("tableRoundId, openBoards, and focusedGame survive workspaceView live -> studio -> live", async () => {
  roundHandler = async () => ({
    tour: { id: "T1", slug: "t", name: "Tour", format: null, timeControl: null, location: null, imageUrl: null, tier: null, dates: null, url: "u" },
    round: { id: "R1", slug: "r1", name: "Round 1", ongoing: true, finished: false, startsAt: 1, url: "u" },
    games: [sampleGame],
    group: null,
    defaultRoundId: null,
  });

  setUrl("http://localhost/studio?view=live&live=R1&games=R1%3AG1&focus=R1%3AG1");
  const ShellHarness = liveHarness();
  render(<ShellHarness />);

  await waitFor(() => {
    const s = useLiveStore.getState();
    assert.equal(s.tableRoundId, "R1");
    assert.deepEqual(s.openBoards, [{ roundId: "R1", gameId: "G1" }]);
    assert.deepEqual(s.focusedGame, { roundId: "R1", gameId: "G1" });
  });

  // Switch to Studio: LiveSyncHarness unmounts, but useLiveStore keeps its round & boards.
  act(() => useStudioStore.getState().setWorkspaceView("studio"));
  assert.equal(useStudioStore.getState().workspaceView, "studio");
  assert.equal(useLiveStore.getState().tableRoundId, "R1");
  assert.deepEqual(useLiveStore.getState().openBoards, [{ roundId: "R1", gameId: "G1" }]);
  assert.deepEqual(useLiveStore.getState().focusedGame, { roundId: "R1", gameId: "G1" });
  assert.equal(window.location.search, "");

  // Switch back to Live: round, boards, focus and URL params are preserved.
  act(() => useStudioStore.getState().setWorkspaceView("live"));
  assert.equal(useLiveStore.getState().tableRoundId, "R1");
  assert.deepEqual(useLiveStore.getState().openBoards, [{ roundId: "R1", gameId: "G1" }]);
  assert.deepEqual(useLiveStore.getState().focusedGame, { roundId: "R1", gameId: "G1" });
  assert.equal(window.location.search, "?view=live&live=R1&games=R1%3AG1&focus=R1%3AG1");
});

test("ActivityBar shows the live indicator dot only when a broadcast round is active", () => {
  render(<ActivityBar />);
  assert.equal(document.querySelector("[data-live-indicator]"), null);

  act(() => useLiveStore.getState().setTableRound("R1"));
  const dot = document.querySelector("[data-live-indicator]");
  assert.ok(dot);
  assert.ok(dot.className.includes("bg-studio-success"));

  act(() => useLiveStore.getState().leaveLive());
  assert.equal(document.querySelector("[data-live-indicator]"), null);
});

test("NotationLiveSyncBar pulls latest moves without erasing local variations", async () => {
  act(() => {
    useStudioStore.getState().openListedGame({
      title: "W vs B",
      pgn: "1. e4 e5",
      openInNewBoard: true,
      liveSource: { roundId: "R1", gameId: "G1" },
    });
  });
  const board = useStudioStore.getState().active();
  assert.deepEqual(board.liveSource, { roundId: "R1", gameId: "G1" });

  // Add a local variation 1...c5 in Studio.
  act(() => {
    useStudioStore.getState().goPath([0]);
    useStudioStore.getState().playUciSequence(["c7c5"]);
  });

  pgnHandler = async () =>
    [
      '[Event "Round 1"]',
      '[GameURL "https://lichess.org/broadcast/t/R1/G1"]',
      '[White "W"]',
      '[Black "B"]',
      '[Result "*"]',
      "",
      "1. e4 e5 2. Nf3 Nc6 *",
    ].join("\n");

  const view = render(
    <NotationLiveSyncBar
      boardId={board.id}
      liveSource={{ roundId: "R1", gameId: "G1" }}
      locale="en"
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "Pull latest moves" }));
  await waitFor(() => {
    assert.equal(view.getByRole("status").textContent, "Pulled 2 moves");
  });

  const updated = useStudioStore.getState().boards.find((b) => b.id === board.id)!;
  assert.equal(updated.tree.children[0]!.children[0]!.children[0]!.san, "Nf3");
  assert.equal(updated.tree.children[0]!.children[0]!.children[0]!.children[0]!.san, "Nc6");
  // Local 1...c5 variation is still preserved.
  assert.equal(updated.tree.children[0]!.children[1]!.san, "c5");

  // Pulling again when nothing changed reports Already up to date.
  fireEvent.click(view.getByRole("button", { name: "Pull latest moves" }));
  await waitFor(() => {
    assert.equal(view.getByRole("status").textContent, "Already up to date");
  });
});
