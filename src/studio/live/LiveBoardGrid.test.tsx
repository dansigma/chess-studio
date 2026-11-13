// SIG-1313: desktop board grid — layout modes, flip, clear, reorder, context bar and auto-open.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BroadcastRoundSnapshot, LiveGame } from "../../lib/live/types.ts";

let roundHandler: (id: string) => Promise<BroadcastRoundSnapshot | null> = async () => null;

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
    fetchRoundPgn: () => Promise.resolve(null),
    streamRound: (_id: string, _on: unknown, signal: AbortSignal) =>
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve())),
  },
});
mock.module("@/src/engine/shared-engine", {
  namedExports: {
    acquire: () => ({ analyze: () => undefined, stop: () => undefined, subscribe: () => () => undefined, release: () => undefined }),
  },
});

const { LiveView } = await import("./LiveView.tsx");
const { useLiveStore } = await import("./live-store.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { LIVE_LAYOUT_PREF_KEY, resetLiveLayoutMemory } = await import("./use-live-layout-pref.ts");

const WHITE_TO_MOVE = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const player = (name: string) => ({ name, title: null, rating: 2700, fed: "NOR", fideId: null, clockMs: 600_000 });
function game(id: string, over: Partial<LiveGame> = {}): LiveGame {
  return {
    id, roundId: "R1", white: player(`W${id}`), black: player(`B${id}`), fen: WHITE_TO_MOVE,
    lastMoveUci: null, result: "*", thinkTimeSec: null, pgn: null, updatedAt: Date.now(), ...over,
  };
}
const tour = { id: "T1", slug: "t", name: "Open A", format: null, timeControl: "45 min + 30 sec / move", location: null, imageUrl: null, tier: null, dates: null, url: "u" };
const round = (id: string) => ({ id, slug: id, name: id, ongoing: true, finished: false, startsAt: 1, url: `https://lichess.org/broadcast/t/${id}` });
function snapshot(games: LiveGame[], roundId = "R1"): BroadcastRoundSnapshot {
  return { tour, round: round(roundId), games, group: null, defaultRoundId: null };
}

before(() => setupDom());
afterEach(() => cleanup());
after(async () => {
  await teardownDom();
});
beforeEach(() => {
  cleanup();
  resetLiveLayoutMemory();
  try {
    window.localStorage.removeItem(LIVE_LAYOUT_PREF_KEY);
  } catch {
    // no storage in this environment
  }
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("http://localhost/studio?view=live&live=R1");
  act(() => {
    useStudioStore.setState({ workspaceView: "live", settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  });
});

const rowOf = (id: string) => document.querySelector(`[data-live-row="${id}"]`) as HTMLElement | null;
const board = (id: string) => document.querySelector(`[data-live-board="${id}"]`) as HTMLElement;
const boardIds = () => useLiveStore.getState().openBoards.map((b) => b.gameId);
const cardOrder = () => [...document.querySelectorAll("[data-live-card]")].map((e) => (e as HTMLElement).dataset.liveCard!.split(":")[1]);
const playerSides = (id: string) => [...board(id).querySelectorAll("[data-live-player]")].map((e) => e.getAttribute("data-live-player"));

/** Renders a round whose boards the test opens itself (auto-open is off: the grid is cleared, like "Clear grid"). */
async function renderRound(games: LiveGame[]) {
  roundHandler = async () => snapshot(games);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf(games[0]!.id)));
  act(() => useLiveStore.getState().closeAllBoards());
}
const openBoards = (...ids: string[]) =>
  act(() => {
    for (const id of ids) {
      useLiveStore.getState().openBoard({ roundId: "R1", gameId: id }, { focus: false });
    }
  });

test("flip turns one card: player bars swap, the eval bar turns, the other cards stay", async () => {
  await renderRound([game("a"), game("b")]);
  openBoards("a", "b");
  assert.deepEqual(playerSides("a"), ["black", "white"]);
  const fill = (id: string) => (board(id).querySelector("[data-live-eval-slot] .bg-studio-win") as HTMLElement).style;
  assert.equal(fill("a").bottom, "0px", "white at the bottom: the white share grows from the bottom");

  const flip = within(board("a")).getByRole("button", { name: "Flip board" });
  assert.equal(flip.getAttribute("aria-pressed"), "false");
  fireEvent.click(flip);
  assert.deepEqual(playerSides("a"), ["white", "black"]);
  assert.equal(fill("a").top, "0px", "black at the bottom: the white share grows from the top");
  assert.deepEqual(playerSides("b"), ["black", "white"], "flip is per card");
  assert.equal(fill("b").bottom, "0px");
  assert.equal(within(board("a")).getByRole("button", { name: "Flip board" }).getAttribute("aria-pressed"), "true");

  fireEvent.click(within(board("a")).getByRole("button", { name: "Flip board" }));
  assert.deepEqual(playerSides("a"), ["black", "white"]);
});

test("the flip button is always visible; close stays hover/focus only", async () => {
  await renderRound([game("a")]);
  openBoards("a");
  const flip = within(board("a")).getByRole("button", { name: "Flip board" });
  assert.doesNotMatch(flip.className, /opacity-0|invisible|hidden/u);
  const studio = within(board("a")).getByRole("button", { name: "Open in Studio" });
  assert.doesNotMatch(studio.className, /opacity-0/u);
  const close = within(board("a")).getByRole("button", { name: "Close board" });
  assert.match(close.className, /\bopacity-0\b/u);
  assert.match(close.className, /group-hover:opacity-100/u);
  assert.match(close.className, /group-focus-within:opacity-100/u);
});

test("flipping does not focus the card; a flipped card keeps its side across layouts", async () => {
  await renderRound([game("a"), game("b")]);
  openBoards("a", "b");
  fireEvent.click(within(board("b")).getByRole("button", { name: "Flip board" }));
  assert.equal(useLiveStore.getState().focusedGame, null);
  fireEvent.click(screen.getByRole("radio", { name: "Compact" }));
  assert.deepEqual(playerSides("b"), ["white", "black"]);
  assert.deepEqual(playerSides("a"), ["black", "white"]);
});

test("Grid is the default and shows notation; Compact hides notation and move buttons; the choice is remembered", async () => {
  await renderRound([game("a"), game("b")]);
  openBoards("a", "b");
  const radio = (name: string) => screen.getByRole("radio", { name });
  assert.equal(radio("Grid").getAttribute("aria-checked"), "true");
  assert.equal(document.querySelector("[data-live-boards]")!.getAttribute("data-live-layout"), "grid");
  assert.ok(board("a").querySelector("[data-live-notation]"));
  assert.ok(within(board("a")).getByRole("button", { name: "First move" }));

  fireEvent.click(radio("Compact"));
  assert.equal(radio("Compact").getAttribute("aria-checked"), "true");
  assert.equal(document.querySelector("[data-live-boards]")!.getAttribute("data-live-layout"), "compact");
  for (const id of ["a", "b"]) {
    assert.equal(board(id).querySelector("[data-live-notation]"), null);
    assert.equal(within(board(id)).queryByRole("button", { name: "First move" }), null);
    assert.equal(within(board(id)).queryByRole("button", { name: "Next move" }), null);
    assert.ok(board(id).querySelector('[role="img"]'), "the board is still there");
    assert.ok(within(board(id)).getByRole("button", { name: "Flip board" }), "card actions stay");
  }
  assert.equal(window.localStorage.getItem(LIVE_LAYOUT_PREF_KEY), "compact");

  // remembered on this device: a fresh mount starts in Compact
  cleanup();
  roundHandler = async () => snapshot([game("a"), game("b")]);
  window.history.replaceState(null, "", "/studio?view=live&live=R1&games=R1%3Aa%2CR1%3Ab");
  render(<LiveView />);
  await waitFor(() => assert.ok(board("a")));
  assert.equal(document.querySelector("[data-live-boards]")!.getAttribute("data-live-layout"), "compact");
});

test("Compact sizes the grid by the board count: 2x2 up to four boards, 3x2 for five and six", async () => {
  await renderRound(["a", "b", "c", "d", "e", "f"].map((id) => game(id)));
  window.localStorage.setItem(LIVE_LAYOUT_PREF_KEY, "compact");
  const template = () => {
    const style = (document.querySelector("[data-live-board-grid]") as HTMLElement).style;
    return [style.gridTemplateColumns, style.gridTemplateRows];
  };
  openBoards("a", "b", "c");
  fireEvent.click(screen.getByRole("radio", { name: "Compact" }));
  assert.deepEqual(template(), ["repeat(2, minmax(0, 1fr))", "repeat(2, minmax(0, 1fr))"]);
  openBoards("d");
  assert.deepEqual(template(), ["repeat(2, minmax(0, 1fr))", "repeat(2, minmax(0, 1fr))"]);
  openBoards("e", "f");
  assert.deepEqual(template(), ["repeat(3, minmax(0, 1fr))", "repeat(2, minmax(0, 1fr))"]);
  // every board fits the pane height: the section fills the pane (no vertical scroll of its own)
  assert.match(document.querySelector("[data-live-boards]")!.className, /\bh-full\b/u);
});

test("Focus: the focused board is large with notation, the others are thumbnails; clicking one focuses it", async () => {
  await renderRound([game("a"), game("b"), game("c")]);
  openBoards("a", "b", "c");
  act(() => useLiveStore.getState().focusBoard({ roundId: "R1", gameId: "b" }));
  fireEvent.click(screen.getByRole("radio", { name: "Focus" }));
  assert.equal(board("b").getAttribute("data-live-variant"), "focus");
  assert.ok(board("b").querySelector("[data-live-notation]"));
  const thumbs = document.querySelector("[data-live-thumbs]") as HTMLElement;
  assert.deepEqual([...thumbs.querySelectorAll("[data-live-board]")].map((e) => e.getAttribute("data-live-board")), ["a", "c"]);
  for (const id of ["a", "c"]) {
    assert.equal(board(id).getAttribute("data-live-variant"), "thumb");
    assert.equal(board(id).querySelector("[data-live-notation]"), null);
  }
  fireEvent.click(board("c"));
  assert.deepEqual(useLiveStore.getState().focusedGame, { roundId: "R1", gameId: "c" });
  assert.equal(board("c").getAttribute("data-live-variant"), "focus");
  assert.equal(board("b").getAttribute("data-live-variant"), "thumb");
});

test("Clear grid appears at two or more boards and closes them all", async () => {
  await renderRound([game("a"), game("b"), game("c")]);
  const clear = () => screen.queryByRole("button", { name: "Clear grid" });
  openBoards("a");
  assert.equal(clear(), null, "one board: no Clear grid");
  openBoards("b");
  assert.ok(clear());
  openBoards("c");
  act(() => useLiveStore.getState().focusBoard({ roundId: "R1", gameId: "b" }));
  fireEvent.click(clear()!);
  const s = useLiveStore.getState();
  assert.deepEqual([s.openBoards, s.focusedGame, s.boardLimitReached], [[], null, false]);
  assert.equal(document.querySelector("[data-live-boards]"), null);
  assert.equal(window.location.search, "?view=live&live=R1");
});

test("dragging a card onto another reorders openBoards, the URL games= order and the sidebar numbers", async () => {
  await renderRound([game("a"), game("b"), game("c")]);
  openBoards("a", "b", "c");
  assert.deepEqual(cardOrder(), ["a", "b", "c"]);
  const cards = () => [...document.querySelectorAll("[data-live-card]")] as HTMLElement[];
  const dataTransfer = { setData: () => undefined, effectAllowed: "", dropEffect: "" };
  const [first, , third] = cards();
  assert.equal(first!.getAttribute("draggable"), "true");
  fireEvent.dragStart(first!, { dataTransfer });
  fireEvent.dragOver(third!, { dataTransfer });
  assert.equal(third!.getAttribute("data-drop-target"), "");
  fireEvent.drop(third!, { dataTransfer });
  fireEvent.dragEnd(first!, { dataTransfer });
  assert.deepEqual(boardIds(), ["b", "c", "a"]);
  assert.deepEqual(cardOrder(), ["b", "c", "a"]);
  assert.equal(window.location.search, "?view=live&live=R1&games=R1%3Ab%2CR1%3Ac%2CR1%3Aa");
  const number = (id: string) => rowOf(id)!.querySelector("[data-live-grid-number]")?.textContent;
  assert.deepEqual(["a", "b", "c"].map(number), ["3", "1", "2"]);
  assert.equal(document.querySelector("[data-drop-target]"), null);
});

test("a drag that is not one of our cards is left alone; one card or the Focus layout has nothing to drag", async () => {
  await renderRound([game("a"), game("b")]);
  openBoards("a");
  assert.equal((document.querySelector("[data-live-card]") as HTMLElement).getAttribute("draggable"), null);
  openBoards("b");
  const dataTransfer = { setData: () => undefined, effectAllowed: "", dropEffect: "" };
  const [first, second] = [...document.querySelectorAll("[data-live-card]")] as HTMLElement[];
  const notPrevented = fireEvent.dragOver(second!, { dataTransfer });
  assert.equal(notPrevented, true, "no drag started here: dragover is not claimed");
  fireEvent.drop(second!, { dataTransfer });
  assert.deepEqual(boardIds(), ["a", "b"]);
  fireEvent.click(screen.getByRole("radio", { name: "Focus" }));
  assert.equal(document.querySelector("[data-live-card][draggable]"), null);
  void first;
});

test("the context bar shows the opening, the time control and Open in Studio, with no names or result", async () => {
  await renderRound([game("a", { eco: "B50", opening: "Sicilian Defense: Delayed Alapin Variation", white: player("Sevian, Samuel"), black: player("Carlsen, Magnus"), result: "1-0" })]);
  act(() => useLiveStore.getState().openBoard({ roundId: "R1", gameId: "a" }));
  const bar = document.querySelector("[data-live-followed]") as HTMLElement;
  assert.match(bar.querySelector("[data-live-opening]")!.textContent!, /^B50 · Sicilian Defense: Delayed Alapin Variation$/u);
  assert.equal(bar.querySelector("[data-live-time-control]")!.textContent, "45 min + 30 sec / move");
  assert.doesNotMatch(bar.textContent!, /Sevian|Carlsen|1 – 0/u);
  assert.equal(within(bar).queryByRole("button", { name: /copy/iu }), null);
  assert.ok(document.querySelector("[data-live-connection]"), "the connection indicator stays");
});

test("Open in Studio in the context bar opens the focused game in a new tab and keeps this one", async () => {
  await renderRound([game("a"), game("b")]);
  act(() => useLiveStore.getState().openBoard({ roundId: "R1", gameId: "b" }));
  const calls: unknown[][] = [];
  const original = window.open;
  window.open = ((...args: unknown[]) => {
    calls.push(args);
    return null;
  }) as typeof window.open;
  try {
    const before = useLiveStore.getState();
    fireEvent.click(within(document.querySelector("[data-live-followed]") as HTMLElement).getByRole("button", { name: /Open in Studio/u }));
    assert.deepEqual(calls, [["/studio?broadcast=R1%3Ab", "_blank", "noopener"]]);
    assert.equal(useLiveStore.getState(), before);
  } finally {
    window.open = original;
  }
});

test("the opening shows nothing while unknown; time control and the hint stay", async () => {
  await renderRound([game("a")]);
  const bar = () => document.querySelector("[data-live-followed]") as HTMLElement;
  assert.match(bar().textContent!, /Click a game to follow it\./u);
  assert.equal(within(bar()).queryByRole("button", { name: /Open in Studio/u }), null, "no game, no button");
  assert.equal(bar().querySelector("[data-live-time-control]")!.textContent, "45 min + 30 sec / move");
  act(() => useLiveStore.getState().openBoard({ roundId: "R1", gameId: "a" }));
  assert.equal(bar().querySelector("[data-live-opening]"), null);
  assert.doesNotMatch(bar().textContent!, /undefined|null|\?|–$/u);
  act(() => useLiveStore.getState().ingestUpdate({
    id: "a", roundId: "R1", pgn: "p", fen: WHITE_TO_MOVE, lastMoveUci: null, result: "*", eco: "A08", opening: "Zukertort Opening",
    white: { name: "Wa", title: null, rating: null, fideId: null }, black: { name: "Ba", title: null, rating: null, fideId: null },
    whiteClockMs: null, blackClockMs: null,
  }));
  assert.equal(bar().querySelector("[data-live-opening]")!.textContent, "A08 · Zukertort Opening");
});

test("pt-BR: layout selector, clear grid, flip and the context bar", async () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } }));
  await renderRound([game("a"), game("b")]);
  openBoards("a", "b");
  assert.ok(screen.getByRole("radiogroup", { name: "Layout dos tabuleiros" }));
  for (const name of ["Grade", "Compacto", "Foco"]) {
    assert.ok(screen.getByRole("radio", { name }));
  }
  assert.ok(screen.getByRole("button", { name: "Limpar grade" }));
  assert.ok(within(board("a")).getByRole("button", { name: "Virar o tabuleiro" }));
  act(() => useLiveStore.getState().focusBoard({ roundId: "R1", gameId: "a" }));
  assert.ok(within(document.querySelector("[data-live-followed]") as HTMLElement).getByRole("button", { name: /Abrir no Studio/u }));
});

// ---- auto-open ----

const ids = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i));

test("auto-open: a round with no boards opens boards 1-3 in board order, finished or not, and focuses board 1", async () => {
  const games = ids(5).map((id, i) => game(id, i === 0 || i === 2 ? { result: i === 0 ? "1-0" : "1/2-1/2" } : {}));
  roundHandler = async () => snapshot(games);
  render(<LiveView />);
  await waitFor(() => assert.deepEqual(boardIds(), ["a", "b", "c"]));
  const s = useLiveStore.getState();
  assert.deepEqual(s.focusedGame, { roundId: "R1", gameId: "a" });
  assert.deepEqual(cardOrder(), ["a", "b", "c"]);
  assert.equal(window.location.search, "?view=live&live=R1&games=R1%3Aa%2CR1%3Ab%2CR1%3Ac&focus=R1%3Aa");
  assert.equal(board("a").getAttribute("data-focused"), "true");
  assert.equal(board("c").getAttribute("data-focused"), null);
  assert.ok(board("a").textContent!.includes("Game over: 1 – 0"), "a finished game is opened too");
});

test("auto-open: a round with fewer than three games opens all of them", async () => {
  roundHandler = async () => snapshot([game("a"), game("b")]);
  render(<LiveView />);
  await waitFor(() => assert.deepEqual(boardIds(), ["a", "b"]));
  assert.deepEqual(useLiveStore.getState().focusedGame, { roundId: "R1", gameId: "a" });
});

test("auto-open: never when the URL already restored games=", async () => {
  window.history.replaceState(null, "", "/studio?view=live&live=R1&games=R1%3Ae&focus=R1%3Ae");
  roundHandler = async () => snapshot(ids(5).map((id) => game(id)));
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  assert.deepEqual(boardIds(), ["e"]);
  assert.deepEqual(useLiveStore.getState().focusedGame, { roundId: "R1", gameId: "e" });
});

test("auto-open: runs once per round, not again after the boards are closed one by one or cleared", async () => {
  roundHandler = async () => snapshot(ids(4).map((id) => game(id)));
  render(<LiveView />);
  await waitFor(() => assert.deepEqual(boardIds(), ["a", "b", "c"]));
  act(() => {
    for (const id of ["a", "b", "c"]) {
      useLiveStore.getState().closeBoard({ roundId: "R1", gameId: id });
    }
  });
  assert.deepEqual(boardIds(), []);
  // a new snapshot of the same round lands (polling): nothing reopens
  act(() => useLiveStore.getState().ingestSnapshot(snapshot(ids(4).map((id) => game(id)))));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.deepEqual(boardIds(), []);

  openBoards("a", "b");
  fireEvent.click(screen.getByRole("button", { name: "Clear grid" }));
  act(() => useLiveStore.getState().ingestSnapshot(snapshot(ids(4).map((id) => game(id)))));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.deepEqual(boardIds(), [], "cleared stays cleared");
});

test("auto-open: switching to another round with no boards open opens its first three", async () => {
  roundHandler = async (id) => snapshot(ids(4).map((g) => game(g, { roundId: id })), id);
  render(<LiveView />);
  await waitFor(() => assert.equal(boardIds().length, 3));
  act(() => useLiveStore.getState().closeAllBoards());
  act(() => useLiveStore.getState().setTableRound("R2"));
  await waitFor(() => assert.deepEqual(useLiveStore.getState().openBoards.map((b) => `${b.roundId}:${b.gameId}`), ["R2:a", "R2:b", "R2:c"]));
});

test("auto-open: not on mobile, which keeps its single board", async () => {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: true, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  try {
    roundHandler = async () => snapshot(ids(4).map((id) => game(id)));
    render(<LiveView />);
    await waitFor(() => assert.ok(rowOf("a")));
    assert.deepEqual(boardIds(), []);
  } finally {
    window.matchMedia = original;
  }
});
