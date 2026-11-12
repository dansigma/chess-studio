// SIG-1292: live boards — follow-latest, focus → stream round, cap, polled notation refetch, frozen clocks.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { mock } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Chess } from "chess.js";
import type { BroadcastRoundSnapshot, LiveGame } from "../../lib/live/types.ts";

let roundHandler: (id: string) => Promise<BroadcastRoundSnapshot | null> = async () => null;
let pgnHandler: (id: string) => Promise<string | null> = async () => null;
const pgnCalls: string[] = [];

class FakeHttpError extends Error {
  constructor(readonly status = 500) {
    super(`HTTP ${status}`);
  }
}
mock.module("@/src/lib/live/lichess-broadcast", {
  namedExports: {
    fetchTopBroadcasts: () => Promise.resolve(null),
    LiveRateLimitedError: class extends FakeHttpError {},
    LiveHttpError: FakeHttpError,
    RATE_LIMIT_BACKOFF_MS: 60_000,
    fetchRound: (id: string) => roundHandler(id),
    fetchTour: () => Promise.resolve(null),
    fetchRoundPgn: (id: string) => {
      pgnCalls.push(id);
      return pgnHandler(id);
    },
    streamRound: (_id: string, _on: unknown, signal: AbortSignal) =>
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve())),
  },
});

// SIG-1293: the focused board mounts the eval bar; keep the real Stockfish worker out of DOM tests.
mock.module("@/src/engine/shared-engine", {
  namedExports: {
    acquire: () => ({ analyze: () => undefined, stop: () => undefined, subscribe: () => () => undefined, release: () => undefined }),
  },
});

const { LiveView } = await import("./LiveView.tsx");
const { useLiveStore } = await import("./live-store.ts");
const { tickerSubscribers } = await import("./live-ticker.ts");
const { parseGame } = await import("../../lib/live/parse-game.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

const SANS = ["e4", "e5", "Nf3", "Nc6"];
const CLK = ["0:09:50", "0:09:45", "0:09:40", "0:09:35"]; // %clk in the PGN (h:mm:ss)
function pgn(gameId: string, plies: number, result = "*", roundId = "R1"): string {
  const moves = SANS.slice(0, plies)
    .map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ""}${san} {[%clk ${CLK[i]}]}`)
    .join(" ");
  return `[Event "E"]\n[White "W${gameId}"]\n[Black "B${gameId}"]\n[Result "${result}"]\n[GameURL "https://lichess.org/broadcast/x/r/${roundId}/${gameId}"]\n\n${moves} ${result}\n\n`;
}
function position(plies: number): { fen: string; lastMoveUci: string | null } {
  const chess = new Chess();
  let last: string | null = null;
  for (const san of SANS.slice(0, plies)) {
    const m = chess.move(san);
    last = `${m.from}${m.to}`;
  }
  return { fen: chess.fen(), lastMoveUci: last };
}
const player = (name: string) => ({ name, title: null, rating: 2700, fed: "NOR", fideId: null, clockMs: 600_000 });
function game(id: string, plies: number, over: Partial<LiveGame> = {}, roundId = "R1"): LiveGame {
  return {
    id, roundId, white: player(`W${id}`), black: player(`B${id}`), ...position(plies), result: "*",
    thinkTimeSec: null, pgn: null, updatedAt: Date.now(), ...over,
  };
}
const tour = { id: "T1", slug: "t", name: "Open A", format: null, timeControl: null, location: null, imageUrl: null, tier: null, dates: null, url: "u" };
const round = (id: string) => ({ id, slug: id, name: id, ongoing: true, finished: false, startsAt: 1, url: `https://lichess.org/broadcast/t/${id}` });
function snapshot(games: LiveGame[], roundId = "R1"): BroadcastRoundSnapshot {
  return { tour, round: round(roundId), games, group: null, defaultRoundId: null };
}
const stream = (gameId: string, plies: number, result = "*", roundId = "R1") => parseGame(pgn(gameId, plies, result, roundId), roundId)!;
const board = (id: string) => document.querySelector(`[data-live-board="${id}"]`) as HTMLElement;
const rowOf = (id: string) => document.querySelector(`[data-live-row="${id}"]`) as HTMLElement;
const clockText = (id: string, side: "white" | "black") => board(id).querySelector(`[data-live-clock="${side}"]`)!.textContent;

before(() => setupDom());
afterEach(() => cleanup());
after(async () => {
  await teardownDom();
});
beforeEach(() => {
  cleanup();
  pgnCalls.length = 0;
  pgnHandler = async () => null;
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("http://localhost/studio?view=live&live=R1");
  act(() => {
    useStudioStore.setState({ workspaceView: "live", settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  });
});

async function openStreamed(plies: number, ids = ["a"]) {
  roundHandler = async () => snapshot(ids.map((id) => game(id, plies)));
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf(ids[0]!)));
  for (const id of ids) {
    fireEvent.click(rowOf(id), { ctrlKey: true });
  }
  act(() => {
    for (const id of ids) {
      useLiveStore.getState().ingestUpdate(stream(id, plies));
    }
  });
}

test("follow-latest: browsing back pauses, shows the clock at that ply; Live resumes; new moves still arrive", async () => {
  await openStreamed(3);
  const el = board("a");
  await waitFor(() => assert.match(el.textContent!, /Nf3/u));
  assert.equal(el.dataset.following, "true");
  assert.equal(screen.queryByText("Live ▸"), null);

  fireEvent.click(screen.getByRole("button", { name: "Previous move" }));
  assert.equal(board("a").dataset.following, undefined);
  assert.equal(clockText("a", "white"), "9:50");
  assert.equal(clockText("a", "black"), "9:45");
  assert.equal(board("a").querySelectorAll("[data-clock-ticking]").length, 0);

  act(() => useLiveStore.getState().ingestUpdate(stream("a", 4)));
  assert.match(board("a").textContent!, /Nc6/u, "the notation keeps growing while paused");
  assert.equal(board("a").dataset.following, undefined, "and does not jump");
  assert.equal(clockText("a", "white"), "9:50");

  fireEvent.click(screen.getByRole("button", { name: "Live ▸" }));
  assert.equal(board("a").dataset.following, "true");
  assert.equal(screen.queryByText("Live ▸"), null);
  assert.equal(board("a").querySelectorAll("[data-clock-ticking]").length, 1);
});

test("focus: clicking a board focuses it and moves the stream to its round", async () => {
  await openStreamed(2, ["a", "b"]);
  assert.equal(useLiveStore.getState().focusedGame, null, "Ctrl-click adds without focusing");
  fireEvent.click(board("b"));
  assert.deepEqual(useLiveStore.getState().focusedGame, { roundId: "R1", gameId: "b" });
  assert.equal(board("b").dataset.focused, "true");
  assert.equal(useLiveStore.getState().streamRoundId, "R1");
  act(() => useLiveStore.getState().openBoard({ roundId: "R2", gameId: "z" }));
  assert.equal(useLiveStore.getState().streamRoundId, "R2", "the focused board's round is the streamed one");
  fireEvent.click(board("a"));
  assert.equal(useLiveStore.getState().streamRoundId, "R1");
});

test("close button calls closeBoard and does not refocus it", async () => {
  await openStreamed(2, ["a", "b"]);
  fireEvent.click(within(board("a")).getByRole("button", { name: "Close board" }));
  assert.deepEqual(useLiveStore.getState().openBoards.map((b) => b.gameId), ["b"]);
  assert.equal(board("a"), null);
});

test("past the cap the new board is refused with a notice; closing clears it", async () => {
  roundHandler = async () => snapshot(["a", "b", "c", "d", "e", "f", "g"].map((id) => game(id, 2)));
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("g")));
  for (const id of ["a", "b", "c", "d", "e", "f", "g"]) {
    fireEvent.click(rowOf(id), { ctrlKey: true });
  }
  assert.equal(useLiveStore.getState().openBoards.length, 6);
  await screen.findByText("Up to 6 boards at once. Close one to open another.");
  fireEvent.click(within(board("a")).getByRole("button", { name: "Close board" }));
  assert.equal(screen.queryByText(/Up to 6 boards/u), null);
});

test("finished game: result shown, clocks do not tick", async () => {
  roundHandler = async () => snapshot([game("a", 3, { result: "1-0" })]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  fireEvent.click(rowOf("a"), { ctrlKey: true });
  await waitFor(() => assert.ok(board("a")));
  assert.match(board("a").textContent!, /Game over: 1 – 0/u);
  assert.equal(board("a").querySelectorAll("[data-clock-ticking]").length, 0);
  assert.equal(tickerSubscribers(), 0);
});

test("polled round: first PGN is fetched, +1 ply is appended locally, a bigger jump refetches once per round", async () => {
  let plies = 1;
  pgnHandler = async () => pgn("a", plies) + pgn("b", plies);
  roundHandler = async () => snapshot([game("a", 1), game("b", 1)]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  fireEvent.click(rowOf("a"), { ctrlKey: true });
  fireEvent.click(rowOf("b"), { ctrlKey: true });
  await waitFor(() => assert.match(board("a").textContent!, /e4/u));
  assert.equal(pgnCalls.length, 1, "two boards of one round share one request");

  act(() => useLiveStore.getState().ingestSnapshot(snapshot([game("a", 2)])));
  await waitFor(() => assert.match(board("a").textContent!, /e5/u));
  assert.equal(pgnCalls.length, 1, "one ply: no refetch");

  plies = 4;
  act(() => useLiveStore.getState().ingestSnapshot(snapshot([game("a", 4), game("b", 4)])));
  await waitFor(() => assert.match(board("a").textContent!, /Nc6/u));
  await waitFor(() => assert.match(board("b").textContent!, /Nc6/u));
  assert.equal(pgnCalls.length, 2, "a jump of several plies refetches once for the round");
});

test("a board of a non-streamed round shows the 15 s hint", async () => {
  roundHandler = async () => snapshot([game("a", 2)]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  fireEvent.click(rowOf("a"));
  act(() => useLiveStore.getState().openBoard({ roundId: "R2", gameId: "z" }, { focus: false }));
  act(() => useLiveStore.getState().ingestSnapshot(snapshot([game("z", 2, {}, "R2")], "R2")));
  await waitFor(() => assert.ok(board("z")));
  assert.match(board("z").textContent!, /updates every 15 s/u);
  assert.doesNotMatch(board("a").textContent!, /updates every 15 s/u);
});

test("Open in Studio hands the game to a new Studio board and leaves Live", async () => {
  await openStreamed(3);
  const before = useStudioStore.getState().boards.length;
  fireEvent.click(within(board("a")).getByRole("button", { name: "Open in Studio" }));
  const s = useStudioStore.getState();
  assert.equal(s.workspaceView, "studio");
  assert.equal(s.boards.length, before + 1);
  assert.equal(mainlineSans(s.active().tree).join(" "), "e4 e5 Nf3");
});

function mainlineSans(tree: { children: { san: string; children: unknown[] }[] }): string[] {
  const out: string[] = [];
  for (let n = tree.children[0] as { san: string; children: unknown[] } | undefined; n; n = n.children[0] as typeof n) {
    out.push(n.san);
  }
  return out;
}

test("layout: every open board gets the same grid cell, even the newly focused one (no col-span)", async () => {
  await openStreamed(2, ["a", "b", "c"]);
  fireEvent.click(rowOf("c")); // a plain row click focuses the last opened game
  assert.equal(board("c").dataset.focused, "true");
  const grid = document.querySelector("[data-live-board-grid]") as HTMLElement;
  // SIG-1295: 1/2/3 columns by container width, never more than 3 and never a fixed auto-fill count.
  assert.match(grid.className, /@xl:grid-cols-2/u);
  assert.match(grid.className, /@4xl:grid-cols-3/u);
  assert.doesNotMatch(grid.className, /@[a-z0-9]+:grid-cols-[4-9]/u);
  assert.equal(grid.style.gridTemplateColumns, "");
  assert.match(grid.className, /items-stretch/u);
  assert.match((document.querySelector("[data-live-boards]") as HTMLElement).className, /@container/u);
  for (const id of ["a", "b", "c"]) {
    assert.doesNotMatch(board(id).parentElement!.className, /col-span/u);
  }
});

test("clocks: the side to move is highlighted on the card and in the table; the table never scrolls sideways", async () => {
  await openStreamed(3); // after 1. e4 e5 2. Nf3, Black is to move
  await waitFor(() => assert.ok(board("a").querySelector('[data-live-clock="black"] [data-to-move]')));
  assert.equal(board("a").querySelector('[data-live-clock="white"] [data-to-move]'), null);
  assert.ok(rowOf("a").querySelector("[data-to-move]"));
  assert.ok(rowOf("a").querySelector("[data-live-open-marker]"), "an open game is marked in the table");
  assert.match(screen.getByTestId("live-scroll").className, /overflow-x-hidden/u);
});

test("SIG-1295: finished and ongoing cards share one structure; the result row is reserved while ongoing", async () => {
  roundHandler = async () => snapshot([game("a", 3), game("b", 3, { result: "1/2-1/2" })]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  fireEvent.click(rowOf("a"), { ctrlKey: true });
  fireEvent.click(rowOf("b"), { ctrlKey: true });
  act(() => {
    useLiveStore.getState().ingestUpdate(stream("a", 3));
    useLiveStore.getState().ingestUpdate(stream("b", 3, "1/2-1/2"));
  });
  const ongoing = board("a").querySelector("[data-live-result]") as HTMLElement;
  const finished = board("b").querySelector("[data-live-result]") as HTMLElement;
  assert.ok(ongoing && finished, "result row exists in both");
  assert.equal(ongoing.textContent, "");
  assert.equal(ongoing.getAttribute("aria-hidden"), "true");
  assert.equal(finished.getAttribute("aria-hidden"), null);
  assert.match(finished.textContent!, /½ – ½/u);
  assert.equal(ongoing.className, finished.className, "same fixed height either way");
  assert.match(ongoing.className, /\bh-5\b/u);
  assert.match((board("a").querySelector("[data-live-notation]") as HTMLElement).className, /\bh-40\b/u);
  assert.match(board("a").className, /\bh-full\b/u);
});

test("SIG-1296: the close button is hidden by opacity only, shown on hover/focus/touch, and keeps its name", async () => {
  await openStreamed(2);
  assert.match(board("a").className, /\bgroup\b/u);
  const close = within(board("a")).getByRole("button", { name: "Close board" });
  for (const cls of ["opacity-0", "group-hover:opacity-100", "group-focus-within:opacity-100", "focus-visible:opacity-100", "[@media(hover:none)]:opacity-100"]) {
    assert.ok(close.className.split(/\s+/u).includes(cls), `has ${cls}`);
  }
  assert.doesNotMatch(close.className, /\binvisible\b|\bhidden\b/u);
});
