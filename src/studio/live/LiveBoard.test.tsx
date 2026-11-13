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
    fetchTourPgn: () => Promise.resolve(null),
    fetchRoundPgn: (id: string) => {
      pgnCalls.push(id);
      return pgnHandler(id);
    },
    streamRound: (_id: string, _on: unknown, signal: AbortSignal) =>
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve())),
  },
});

// SIG-1293: the focused board mounts the eval bar; keep the real Stockfish worker out of DOM tests.
// SIG-1312: acquisitions are recorded so a board with a PGN eval can be checked to leave the engine alone.
const engineLeases: Array<{ released: boolean }> = [];
mock.module("@/src/engine/shared-engine", {
  namedExports: {
    acquire: () => {
      const lease = { released: false };
      engineLeases.push(lease);
      return {
        analyze: () => undefined,
        stop: () => undefined,
        subscribe: () => () => undefined,
        release: () => {
          lease.released = true;
        },
      };
    },
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
// SIG-1313: a round opened with no boards starts with boards 1-3. These tests are about the table and the
// boards they open themselves, so they start from an empty grid, the way the user gets it after "Clear grid".
function clearAutoOpened() {
  act(() => useLiveStore.getState().closeAllBoards());
}

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
  clearAutoOpened();
  // SIG-1311: a row click now focuses the board (Ctrl/Cmd-click opens the Studio), so boards that
  // must stay unfocused are opened through the store.
  act(() => {
    for (const id of ids) {
      useLiveStore.getState().openBoard({ roundId: "R1", gameId: id }, { focus: false });
    }
  });
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
  assert.equal(useLiveStore.getState().focusedGame, null, "boards opened without focus stay unfocused");
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
  clearAutoOpened();
  for (const id of ["a", "b", "c", "d", "e", "f", "g"]) {
    fireEvent.click(rowOf(id));
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
  clearAutoOpened();
  fireEvent.click(rowOf("a"));
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
  // The auto-opened boards fetch the round PGN first. Let that request settle before counting: under a
  // loaded runner the clicks below could land after its 400 ms debounce and start a second one.
  await waitFor(() => assert.match(board("a").textContent!, /e4/u));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  pgnCalls.length = 0;
  clearAutoOpened();
  fireEvent.click(rowOf("a"));
  fireEvent.click(rowOf("b"));
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
  clearAutoOpened();
  fireEvent.click(rowOf("a"));
  act(() => useLiveStore.getState().openBoard({ roundId: "R2", gameId: "z" }, { focus: false }));
  act(() => useLiveStore.getState().ingestSnapshot(snapshot([game("z", 2, {}, "R2")], "R2")));
  await waitFor(() => assert.ok(board("z")));
  assert.match(board("z").textContent!, /updates every 15 s/u);
  assert.doesNotMatch(board("a").textContent!, /updates every 15 s/u);
});

// SIG-1315: the game opens in a new browser tab; this tab (store, view, boards, stream) stays as it was.
function stubWindowOpen() {
  const calls: unknown[][] = [];
  const original = window.open;
  window.open = ((...args: unknown[]) => {
    calls.push(args);
    return null;
  }) as typeof window.open;
  return { calls, restore: () => void (window.open = original) };
}

test("Open in Studio opens the game in a new tab and leaves Live untouched", async () => {
  await openStreamed(3);
  const studioBefore = useStudioStore.getState();
  const liveBefore = useLiveStore.getState();
  const opened = stubWindowOpen();
  try {
    fireEvent.click(within(board("a")).getByRole("button", { name: "Open in Studio" }));
    assert.deepEqual(opened.calls, [["/studio?broadcast=R1%3Aa", "_blank", "noopener"]]);
  } finally {
    opened.restore();
  }
  const s = useStudioStore.getState();
  assert.equal(s.workspaceView, "live");
  assert.equal(s.boards, studioBefore.boards);
  assert.equal(s.activeBoardId, studioBefore.activeBoardId);
  const live = useLiveStore.getState();
  assert.equal(live.streamRoundId, liveBefore.streamRoundId);
  assert.deepEqual(live, liveBefore);
  assert.ok(board("a"));
});

test("Open in Studio links the ply shown while browsing", async () => {
  await openStreamed(3);
  fireEvent.keyDown(board("a"), { key: "ArrowLeft" });
  assert.equal(board("a").dataset.following, undefined);
  const opened = stubWindowOpen();
  try {
    fireEvent.click(within(board("a")).getByRole("button", { name: "Open in Studio" }));
    assert.deepEqual(opened.calls, [["/studio?broadcast=R1%3Aa&ply=2", "_blank", "noopener"]]);
  } finally {
    opened.restore();
  }
});

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
  clearAutoOpened();
  fireEvent.click(rowOf("a"));
  fireEvent.click(rowOf("b"));
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

// SIG-1312: a stream PGN whose moves carry [%eval] (pawns, then mate), White's point of view.
const EVALS = ["0.3", "-1.5", "#3", "#-2"];
function evalPgn(gameId: string, plies: number): string {
  return pgn(gameId, plies).replace(/\{\[%clk ([^\]]+)\]\}/gu, (_m, clk: string, offset: number, all: string) => {
    const index = (all.slice(0, offset).match(/%clk/gu) ?? []).length;
    return `{[%eval ${EVALS[index]}] [%clk ${clk}]}`;
  });
}
const evalSlot = (id: string) => board(id).querySelector("[data-live-eval-slot]") as HTMLElement | null;
const activeLeases = () => engineLeases.filter((l) => !l.released).length;

test("SIG-1312: every card shows a bar from the PGN [%eval]; without one a neutral bar; Stockfish only for the focused card", async () => {
  await openStreamed(3, ["a", "b"]);
  engineLeases.length = 0; // the auto-opened (then cleared) focused board may have taken and released a lease
  act(() => useLiveStore.getState().ingestUpdate(parseGame(evalPgn("a", 3), "R1")!));
  assert.equal(useLiveStore.getState().focusedGame, null);

  // Not focused, PGN eval at the shown (latest) ply: a bar with the mate label, no engine.
  await waitFor(() => assert.ok(evalSlot("a")?.querySelector('[aria-label="Evaluation M3"]')));
  // Not focused, no PGN eval: level bar, no number, never "0.00".
  const neutral = evalSlot("b")!.firstElementChild as HTMLElement;
  assert.equal(neutral.getAttribute("aria-hidden"), "true");
  assert.equal(neutral.getAttribute("aria-label"), null);
  assert.equal(neutral.textContent, "");
  assert.doesNotMatch(evalSlot("b")!.textContent!, /0\.00/u);
  assert.equal(engineLeases.length, 0);

  // Focused with a PGN eval: the engine is not started.
  fireEvent.click(board("a"));
  assert.equal(board("a").dataset.focused, "true");
  assert.ok(evalSlot("a")!.querySelector('[aria-label="Evaluation M3"]'));
  assert.equal(engineLeases.length, 0);

  // Browsing back shows the [%eval] of the viewed ply.
  fireEvent.click(within(board("a")).getByRole("button", { name: "Previous move" }));
  await waitFor(() => assert.ok(evalSlot("a")!.querySelector('[aria-label="Evaluation -1.50"]')));
  // The start position has no eval: the focused card falls back to Stockfish (neutral until it answers).
  fireEvent.click(within(board("a")).getByRole("button", { name: "First move" }));
  await waitFor(() => assert.equal(activeLeases(), 1));
  assert.equal((evalSlot("a")!.firstElementChild as HTMLElement).getAttribute("aria-hidden"), "true");
  // Back to a ply with an eval: the lease is released.
  fireEvent.click(within(board("a")).getByRole("button", { name: "Last move" }));
  await waitFor(() => assert.equal(activeLeases(), 0));

  // Focused without a PGN eval: Stockfish runs for it.
  fireEvent.click(board("b"));
  await waitFor(() => assert.equal(activeLeases(), 1));
  // a is no longer focused and keeps its PGN bar.
  assert.ok(evalSlot("a")!.querySelector('[aria-label="Evaluation M3"]'));

  // The "Show eval bar" toggle hides every bar.
  fireEvent.click(document.querySelector("[data-live-eval-toggle]") as HTMLElement);
  await waitFor(() => assert.equal(document.querySelectorAll("[data-live-eval-slot]").length, 0));
  assert.equal(activeLeases(), 0);
});
