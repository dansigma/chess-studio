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

test("click follows (focus), Ctrl-click adds a board without focus, URL and row state update", async () => {
  roundHandler = async () => snapshot([game("a"), game("b")]);
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("a")));
  fireEvent.click(rowOf("a"));
  assert.deepEqual(useLiveStore.getState().focusedGame, { roundId: "R1", gameId: "a" });
  fireEvent.click(rowOf("b"), { ctrlKey: true });
  const s = useLiveStore.getState();
  assert.deepEqual(s.openBoards.map((b) => b.gameId), ["a", "b"]);
  assert.equal(s.focusedGame?.gameId, "a");
  assert.equal(window.location.search, "?view=live&live=R1&games=R1%3Aa%2CR1%3Ab&focus=R1%3Aa");
  assert.equal(rowOf("a").dataset.focused, "true");
  assert.equal(rowOf("b").dataset.open, "true");
  assert.equal(rowOf("b").dataset.focused, undefined);
  assert.match(screen.getByText(/Wa/u, { selector: "[data-live-followed] *, [data-live-followed]" }).textContent!, /Wa/u);
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
