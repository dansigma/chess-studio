// SIG-1291: round view — table, selectors, follow vs add board, clocks, states, URL and leaving Live.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BroadcastRoundSnapshot, BroadcastTour, LiveGame } from "../../lib/live/types.ts";

let roundHandler: (id: string) => Promise<BroadcastRoundSnapshot | null> = async () => null;
let tourHandler: (id: string) => Promise<BroadcastTour | null> = async () => null;
const tourCalls: string[] = [];

class FakeHttpError extends Error {
  constructor(readonly status = 500) {
    super(`HTTP ${status}`);
  }
}
class FakeRateLimited extends FakeHttpError {
  readonly retryAfterMs = 60_000;
  constructor() {
    super(429);
  }
}
mock.module("@/src/lib/live/lichess-broadcast", {
  namedExports: {
    fetchTopBroadcasts: () => Promise.resolve(null),
    LiveRateLimitedError: FakeRateLimited,
    LiveHttpError: FakeHttpError,
    RATE_LIMIT_BACKOFF_MS: 60_000,
    fetchRound: (id: string) => roundHandler(id),
    fetchTour: (id: string) => {
      tourCalls.push(id);
      return tourHandler(id);
    },
    fetchRoundPgn: () => Promise.resolve(null),
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
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

const BLACK_TO_MOVE = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const WHITE_TO_MOVE = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const player = (name: string, clockMs: number | null, title: string | null = "GM") => ({
  name, title, rating: 2700, fed: "NOR", fideId: null, clockMs,
});
function game(id: string, over: Partial<LiveGame> = {}): LiveGame {
  return {
    id, roundId: "R1", white: player(`W${id}`, 600_000), black: player(`B${id}`, 500_000), fen: WHITE_TO_MOVE,
    lastMoveUci: null, result: "*", thinkTimeSec: null, pgn: null, updatedAt: Date.now(), ...over,
  };
}
const tourSummary = { id: "T1", slug: "t", name: "Open A", format: null, timeControl: null, location: null, imageUrl: null, tier: null, dates: null, url: "u" };
const rounds = [
  { id: "R1", slug: "r1", name: "Round 1", ongoing: true, finished: false, startsAt: 1, url: "https://lichess.org/broadcast/t/r1/R1" },
  { id: "R0", slug: "r0", name: "Round 0", ongoing: false, finished: true, startsAt: 0, url: "u" },
  { id: "R2", slug: "r2", name: "Round 2", ongoing: false, finished: false, startsAt: Date.UTC(2099, 0, 5, 15), url: "u" },
];
function snapshot(games: LiveGame[], group = true): BroadcastRoundSnapshot {
  return {
    tour: tourSummary,
    round: rounds[0]!,
    games,
    group: group
      ? { id: "G", slug: "g", name: "Group", tours: [{ id: "T1", name: "Open A", active: true, live: true }, { id: "T2", name: "Open B", active: true, live: false }] }
      : null,
    defaultRoundId: null,
  };
}

before(() => setupDom());
afterEach(() => cleanup());
after(async () => {
  await teardownDom();
});
beforeEach(() => {
  cleanup();
  tourCalls.length = 0;
  tourHandler = async (id) => ({ tour: { ...tourSummary, id }, rounds: id === "T1" ? rounds : [{ ...rounds[1]!, id: "B9" }], group: null, defaultRoundId: id === "T1" ? "R1" : "B9" });
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("http://localhost/studio?view=live&live=R1");
  act(() => {
    useStudioStore.setState({ workspaceView: "live", settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  });
});

const rowOf = (id: string) => document.querySelector(`[data-live-row="${id}"]`) as HTMLElement;

test("deep link: skeleton, then rows with players, results, clocks and a no-clock state", async () => {
  let resolve!: (s: BroadcastRoundSnapshot) => void;
  roundHandler = () => new Promise((r) => (resolve = r));
  render(<LiveView />);
  await screen.findByLabelText("Loading round");
  assert.ok(screen.getAllByTestId("live-skeleton-row").length > 0);
  await act(async () => {
    resolve(snapshot([game("a"), game("b", { result: "1-0", white: player("Won", null), black: player("Lost", null, null) })]));
  });
  await waitFor(() => assert.ok(rowOf("a")));
  assert.match(rowOf("a").textContent!, /GM\s*Wa.*2700.*NOR.*10:00.*\*.*8:20/u);
  assert.match(rowOf("b").textContent!, /1-0/u);
  assert.match(rowOf("b").textContent!, /no clock/u);
  assert.equal(screen.getByRole("link", { name: /Powered by Lichess/u }).getAttribute("href"), rounds[0]!.url);
});

test("only the side to move ticks, on one shared ticker; leaving Live clears the store and the ticker", async () => {
  roundHandler = async () => snapshot([game("a", { fen: BLACK_TO_MOVE }), game("b", { fen: WHITE_TO_MOVE }), game("c", { result: "1/2-1/2" })]);
  const view = render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  // desktop + mobile clock slot per row, but one ticking side per ongoing game
  assert.equal(rowOf("a").querySelectorAll("[data-clock-ticking]").length, 2);
  assert.equal(rowOf("c").querySelectorAll("[data-clock-ticking]").length, 0);
  assert.equal(tickerSubscribers(), 4);
  view.unmount();
  assert.equal(tickerSubscribers(), 0);
  const s = useLiveStore.getState();
  assert.equal(s.tableRoundId, null);
  assert.deepEqual(s.gamesByRound, {});
});

test("click follows (focus) and opens boards in click order; URL and row state update", async () => {
  roundHandler = async () => snapshot([game("a"), game("b")]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  fireEvent.click(rowOf("a"));
  assert.deepEqual(useLiveStore.getState().focusedGame, { roundId: "R1", gameId: "a" });
  fireEvent.click(rowOf("b"));
  const s = useLiveStore.getState();
  assert.deepEqual(s.openBoards.map((b) => b.gameId), ["a", "b"]);
  assert.equal(s.focusedGame?.gameId, "b");
  assert.equal(window.location.search, "?view=live&live=R1&games=R1%3Aa%2CR1%3Ab&focus=R1%3Ab");
  assert.equal(rowOf("b").dataset.focused, "true");
  assert.equal(rowOf("a").dataset.open, "true");
  assert.equal(rowOf("a").dataset.focused, undefined);
  assert.match(screen.getByText(/Wb/u, { selector: "[data-live-followed] *, [data-live-followed]" }).textContent!, /Wb/u);
});

test("arrow keys move the row selection and Enter follows", async () => {
  roundHandler = async () => snapshot([game("a"), game("b")]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  const scroll = screen.getByTestId("live-scroll");
  fireEvent.keyDown(scroll, { key: "ArrowDown" });
  fireEvent.keyDown(scroll, { key: "ArrowDown" });
  assert.equal(rowOf("b").dataset.active, "true");
  fireEvent.keyDown(scroll, { key: "Enter" });
  assert.equal(useLiveStore.getState().focusedGame?.gameId, "b");
});

test("round selector lists every round with its state; picking one opens it", async () => {
  roundHandler = async () => snapshot([game("a")]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  const select = await screen.findByLabelText("Round");
  await waitFor(() => assert.equal(within(select).getAllByRole("option").length, 3));
  const labels = within(select).getAllByRole("option").map((o) => o.textContent);
  assert.equal(labels[0], "Round 1 — ● Live");
  assert.equal(labels[1], "Round 0 — Finished");
  assert.match(labels[2]!, /^Round 2 — Jan 5/u);
  fireEvent.change(select, { target: { value: "R2" } });
  assert.equal(useLiveStore.getState().tableRoundId, "R2");
  assert.equal(window.location.search, "?view=live&live=R2");
});

test("tournament selector comes from the group and switching opens the tour's default round", async () => {
  roundHandler = async () => snapshot([game("a")]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  const select = await screen.findByLabelText("Tournament");
  assert.deepEqual(within(select).getAllByRole("option").map((o) => o.textContent), ["Open A", "Open B"]);
  fireEvent.change(select, { target: { value: "T2" } });
  await waitFor(() => assert.equal(useLiveStore.getState().tableRoundId, "B9"));
  assert.ok(tourCalls.includes("T2"));
});

test("no group: the tournament is plain text, not a selector", async () => {
  roundHandler = async () => snapshot([game("a")], false);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  assert.equal(screen.queryByLabelText("Tournament"), null);
  assert.ok(screen.getByText("Open A"));
});

test("empty round shows the empty state; Back without history entry returns to the list", async () => {
  roundHandler = async () => snapshot([]);
  render(<LiveView />);
  await screen.findByText("This round has no games yet.");
  fireEvent.click(screen.getByRole("button", { name: "Back to broadcasts" }));
  await waitFor(() => assert.equal(window.location.search, "?view=live"));
  assert.equal(useLiveStore.getState().tableRoundId, null);
  await screen.findByRole("heading", { name: "Broadcasts" });
});

test("pt-BR strings", async () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } }));
  roundHandler = async () => snapshot([game("a")]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  assert.ok(screen.getByText("Brancas"));
  assert.ok(screen.getByLabelText("Torneio"));
  assert.ok(screen.getByText("Clique numa partida para segui-la."));
});

// SIG-1297: All / Live / Finished filter (labels: SIG-1311).
const filterChip = (name: RegExp) => screen.getByRole("button", { name });
const rowIds = () => [...document.querySelectorAll("[data-live-row]")].map((r) => (r as HTMLElement).dataset.liveRow);

test("filter: counts per option, default All, switching shows only matching rows", async () => {
  roundHandler = async () => snapshot([game("a"), game("b", { result: "1-0" }), game("c", { white: player("NoClock", null) }), game("d", { result: "1/2-1/2" })]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  assert.equal(filterChip(/^All \(4\)$/u).getAttribute("aria-pressed"), "true");
  filterChip(/^Live \(2\)$/u);
  filterChip(/^Finished \(2\)$/u);
  assert.deepEqual(rowIds(), ["a", "b", "c", "d"]);
  fireEvent.click(filterChip(/^Live/u));
  assert.deepEqual(rowIds(), ["a", "c"]);
  assert.equal(filterChip(/^Live/u).getAttribute("aria-pressed"), "true");
  fireEvent.click(filterChip(/^Finished/u));
  assert.deepEqual(rowIds(), ["b", "d"]);
  fireEvent.click(filterChip(/^All/u));
  assert.deepEqual(rowIds(), ["a", "b", "c", "d"]);
});

test("filter: a game that finishes leaves Live, counts update, open boards are unaffected", async () => {
  roundHandler = async () => snapshot([game("a"), game("b")]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  fireEvent.click(rowOf("a"));
  fireEvent.click(filterChip(/^Live/u));
  assert.deepEqual(rowIds(), ["a", "b"]);
  act(() => useLiveStore.getState().ingestSnapshot(snapshot([game("a", { result: "0-1" }), game("b")])));
  assert.deepEqual(rowIds(), ["b"]);
  filterChip(/^Live \(1\)$/u);
  filterChip(/^Finished \(1\)$/u);
  assert.deepEqual(useLiveStore.getState().openBoards.map((b) => b.gameId), ["a"]);
  fireEvent.click(filterChip(/^Finished/u));
  assert.equal(rowOf("a").dataset.open, "true");
});

test("filter: empty state per filter instead of an empty table", async () => {
  roundHandler = async () => snapshot([game("a")]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  fireEvent.click(filterChip(/^Finished/u));
  assert.ok(screen.getByText("No finished games yet"));
  assert.equal(screen.queryByRole("table"), null);
  act(() => useLiveStore.getState().ingestSnapshot(snapshot([game("a", { result: "1-0" })])));
  assert.ok(rowOf("a"));
  fireEvent.click(filterChip(/^Live/u));
  assert.ok(screen.getByText("No ongoing games"));
});

test("filter: arrow keys and Enter work on the filtered rows; the active row is cleared when it leaves", async () => {
  roundHandler = async () => snapshot([game("a", { result: "1-0" }), game("b"), game("c", { result: "0-1" }), game("d")]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  fireEvent.click(filterChip(/^Live/u));
  const scroll = screen.getByTestId("live-scroll");
  fireEvent.keyDown(scroll, { key: "ArrowDown" });
  assert.equal(rowOf("b").dataset.active, "true");
  fireEvent.keyDown(scroll, { key: "ArrowDown" });
  assert.equal(rowOf("d").dataset.active, "true");
  fireEvent.keyDown(scroll, { key: "ArrowDown" });
  assert.equal(rowOf("d").dataset.active, "true");
  fireEvent.keyDown(scroll, { key: "Enter" });
  assert.equal(useLiveStore.getState().focusedGame?.gameId, "d");
  act(() => useLiveStore.getState().ingestSnapshot(snapshot([game("a", { result: "1-0" }), game("b"), game("c", { result: "0-1" }), game("d", { result: "1-0" })])));
  assert.deepEqual(rowIds(), ["b"]);
  assert.equal(scroll.getAttribute("aria-activedescendant"), null);
});

test("filter: pt-BR labels and reset to All when the round changes", async () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } }));
  roundHandler = async (id) => ({ ...snapshot([game("a", { roundId: id }), game("b", { roundId: id, result: "1-0" })]), round: { ...rounds[0]!, id } });
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  filterChip(/^Todas \(2\)$/u);
  filterChip(/^Encerradas \(1\)$/u);
  fireEvent.click(filterChip(/^Ao vivo \(1\)$/u));
  assert.deepEqual(rowIds(), ["a"]);
  act(() => useLiveStore.getState().setTableRound("R0"));
  await waitFor(() => assert.ok(rowOf("a") && rowOf("b")));
  assert.equal(filterChip(/^Todas/u).getAttribute("aria-pressed"), "true");
});

// SIG-1311: player search, sort, short names, grid markers and Ctrl/Cmd-click to the Studio.
const named = (name: string, rating: number | null = 2600) => ({ ...player(name, 600_000), rating });
const searchBox = () => screen.getByRole("textbox", { name: "Search players" }) as HTMLInputElement;
const sortSelect = () => screen.getByLabelText("Sort games") as HTMLSelectElement;
const type = (value: string) => fireEvent.change(searchBox(), { target: { value } });

function stubWindowOpen() {
  const calls: unknown[][] = [];
  const original = window.open;
  window.open = ((...args: unknown[]) => {
    calls.push(args);
    return null;
  }) as typeof window.open;
  return { calls, restore: () => void (window.open = original) };
}

async function renderPlayers() {
  roundHandler = async () =>
    snapshot([
      game("a", { white: named("Sevian, Samuel", 2650), black: named("Carlsen, Magnus", 2830) }),
      game("b", { white: named("Pérez, José", 2500), black: named("Nobody, Joe", null), result: "1-0" }),
      game("c", { white: named("Unrated, Una", null), black: named("Unrated, Uno", null) }),
      game("d", { white: named("Low, Larry", 2400), black: named("Tie, Tom", 2830), result: "1/2-1/2" }),
    ]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
}

test("search: filters as you type by White or Black name, ignoring case and accents, with counts per status", async () => {
  await renderPlayers();
  type("sevian");
  assert.deepEqual(rowIds(), ["a"]);
  type("CARLSEN");
  assert.deepEqual(rowIds(), ["a"]);
  type("jose");
  assert.deepEqual(rowIds(), ["b"]);
  type("pérez");
  assert.deepEqual(rowIds(), ["b"]);
  type("  ");
  assert.deepEqual(rowIds(), ["a", "b", "c", "d"]);
  type("tie");
  filterChip(/^All \(1\)$/u);
  filterChip(/^Live \(0\)$/u);
  filterChip(/^Finished \(1\)$/u);
});

test("search: never closes open boards and shows 'No player found' with nothing to list; Esc clears", async () => {
  await renderPlayers();
  fireEvent.click(rowOf("a"));
  type("zzz");
  assert.equal(screen.queryByRole("table"), null);
  assert.ok(screen.getByText("No player found"));
  assert.deepEqual(useLiveStore.getState().openBoards.map((b) => b.gameId), ["a"]);
  fireEvent.keyDown(searchBox(), { key: "Escape" });
  assert.equal(searchBox().value, "");
  assert.deepEqual(rowIds(), ["a", "b", "c", "d"]);
  assert.equal(rowOf("a").dataset.open, "true");
  type("sevian");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  assert.equal(searchBox().value, "");
});

test("'/' focuses the search field, but not while typing in another input", async () => {
  await renderPlayers();
  assert.notEqual(document.activeElement, searchBox());
  assert.equal(fireEvent.keyDown(document.body, { key: "/" }), false, "the key is consumed");
  assert.equal(document.activeElement, searchBox());
  searchBox().blur();
  const other = document.createElement("input");
  document.body.appendChild(other);
  other.focus();
  assert.equal(fireEvent.keyDown(other, { key: "/" }), true, "typing elsewhere keeps the slash");
  assert.equal(document.activeElement, other);
  other.remove();
  searchBox().focus();
  fireEvent.keyDown(searchBox(), { key: "/" });
  assert.equal(document.activeElement, searchBox());
});

test("sort: Board is the default; Highest rating uses the higher rating, unrated last, ties in board order", async () => {
  await renderPlayers();
  assert.equal(sortSelect().value, "board");
  assert.deepEqual(within(sortSelect()).getAllByRole("option").map((o) => o.textContent), ["Board", "Highest rating"]);
  fireEvent.change(sortSelect(), { target: { value: "rating" } });
  assert.deepEqual(rowIds(), ["a", "d", "b", "c"]);
  fireEvent.change(sortSelect(), { target: { value: "board" } });
  assert.deepEqual(rowIds(), ["a", "b", "c", "d"]);
});

test("search, status filter and sort combine; all three reset when the round changes", async () => {
  roundHandler = async (id) => ({
    ...snapshot([
      game("a", { roundId: id, white: named("Anna Low", 2400), black: named("Zed", 2100) }),
      game("b", { roundId: id, white: named("Anna High", 2700), black: named("Yan", 2100), result: "1-0" }),
      game("c", { roundId: id, white: named("Anna Mid", 2500), black: named("Xu", 2100) }),
      game("d", { roundId: id, white: named("Other", 2800), black: named("Wu", 2100) }),
    ]),
    round: { ...rounds[0]!, id },
  });
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  type("anna");
  fireEvent.change(sortSelect(), { target: { value: "rating" } });
  assert.deepEqual(rowIds(), ["b", "c", "a"]);
  filterChip(/^Live \(2\)$/u);
  fireEvent.click(filterChip(/^Live/u));
  assert.deepEqual(rowIds(), ["c", "a"]);
  act(() => useLiveStore.getState().setTableRound("R0"));
  await waitFor(() => assert.deepEqual(rowIds(), ["a", "b", "c", "d"]));
  assert.equal(searchBox().value, "");
  assert.equal(sortSelect().value, "board");
  assert.equal(filterChip(/^All/u).getAttribute("aria-pressed"), "true");
});

test("names show as initial + surname in the table with the full name in the tooltip; cards keep full names", async () => {
  roundHandler = async () =>
    snapshot([game("a", { white: named("Vachier-Lagrave, Maxime"), black: named("Magnus") })]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  const white = within(rowOf("a")).getByText("M. Vachier-Lagrave");
  assert.equal(white.getAttribute("title"), "Vachier-Lagrave, Maxime");
  assert.equal(within(rowOf("a")).getByText("Magnus").getAttribute("title"), "Magnus");
  fireEvent.click(rowOf("a"));
  const card = document.querySelector("[data-live-board]") as HTMLElement;
  assert.ok(card, "the board card is open");
  assert.ok(within(card).getByText("Vachier-Lagrave, Maxime"));
});

test("status filter is one non-wrapping line in both languages", async () => {
  await renderPlayers();
  const group = screen.getByRole("group", { name: "Filter games" });
  assert.doesNotMatch(group.className, /flex-wrap/u);
  const buttons = within(group).getAllByRole("button");
  assert.deepEqual(buttons.map((b) => b.textContent), ["All (4)", "Live (2)", "Finished (2)"]);
  for (const b of buttons) {
    assert.match(b.className, /whitespace-nowrap/u);
  }
});

test("open rows show their grid position, a hover × closes the board without focusing or reopening", async () => {
  await renderPlayers();
  fireEvent.click(rowOf("c"));
  fireEvent.click(rowOf("a"));
  fireEvent.click(rowOf("d"));
  const number = (id: string) => rowOf(id).querySelector("[data-live-grid-number]")?.textContent;
  assert.equal(number("c"), "1");
  assert.equal(number("a"), "2");
  assert.equal(number("d"), "3");
  assert.equal(number("b"), undefined);
  // focus is on d; close the first board from its row
  fireEvent.click(within(rowOf("c")).getByRole("button", { name: "Close board" }));
  const s = useLiveStore.getState();
  assert.deepEqual(s.openBoards.map((b) => b.gameId), ["a", "d"]);
  assert.equal(s.focusedGame?.gameId, "d", "closing another board does not move the focus");
  assert.equal(rowOf("c").dataset.open, undefined);
  assert.equal(number("a"), "1", "the numbers follow the grid order");
  assert.equal(number("d"), "2");
  assert.equal(rowOf("c").querySelector("[data-live-row-close]"), null);
});

test("Ctrl/Cmd-click and Ctrl/Cmd+Enter open the game in the Studio in a new tab, not on the grid", async () => {
  await renderPlayers();
  const opened = stubWindowOpen();
  try {
    fireEvent.click(rowOf("a"), { ctrlKey: true });
    fireEvent.click(rowOf("b"), { metaKey: true });
    const scroll = screen.getByTestId("live-scroll");
    fireEvent.keyDown(scroll, { key: "ArrowDown" }); // the clicked row b is active: c is next
    fireEvent.keyDown(scroll, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(scroll, { key: "Enter", metaKey: true });
    assert.deepEqual(opened.calls, [
      ["/studio?broadcast=R1%3Aa", "_blank", "noopener"],
      ["/studio?broadcast=R1%3Ab", "_blank", "noopener"],
      ["/studio?broadcast=R1%3Ac", "_blank", "noopener"],
      ["/studio?broadcast=R1%3Ac", "_blank", "noopener"],
    ]);
    const s = useLiveStore.getState();
    assert.deepEqual(s.openBoards, []);
    assert.equal(s.focusedGame, null);
    assert.equal(window.location.search, "?view=live&live=R1");
  } finally {
    opened.restore();
  }
  assert.match(rowOf("d").getAttribute("title")!, /^Click opens the game on the grid\. Ctrl\/Cmd-click opens it in the Studio in a new tab\.$/u);
});

test("pt-BR: search, sort and segmented labels", async () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } }));
  await renderPlayers();
  assert.ok(screen.getByPlaceholderText("Buscar jogador"));
  assert.deepEqual(within(screen.getByLabelText("Ordenar partidas")).getAllByRole("option").map((o) => o.textContent), ["Tabuleiro", "Maior rating"]);
  filterChip(/^Todas \(4\)$/u);
  filterChip(/^Ao vivo \(2\)$/u);
  filterChip(/^Encerradas \(2\)$/u);
  fireEvent.change(screen.getByRole("textbox", { name: "Buscar jogadores" }), { target: { value: "zzz" } });
  assert.ok(screen.getByText("Nenhum jogador encontrado"));
  fireEvent.change(screen.getByRole("textbox", { name: "Buscar jogadores" }), { target: { value: "" } });
  assert.equal(rowOf("a").getAttribute("title"), "Clique abre a partida na grade. Ctrl/Cmd-clique abre no Studio em uma nova aba.");
});
