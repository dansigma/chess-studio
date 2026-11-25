// SIG-1314: "All rounds" toggle of the games sidebar: one tournament PGN request, rows of every round.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BroadcastRoundSnapshot, BroadcastStandingRow, BroadcastTour, LiveGame } from "../../lib/live/types.ts";

const TOUR_PGN = readFileSync(new URL("../../lib/live/fixtures/tour.pgn", import.meta.url), "utf8");

let tourPgnHandler: (id: string) => Promise<string | null> = async () => TOUR_PGN;
let roundHandler: (id: string) => Promise<BroadcastRoundSnapshot | null> = async () => null;
const tourPgnCalls: string[] = [];
let standingRows: BroadcastStandingRow[] = [];
let standingsCalls = 0;

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
    fetchTourPlayers: () => {
      standingsCalls += 1;
      return Promise.resolve(standingRows);
    },
    fetchTopBroadcasts: () => Promise.resolve(null),
    LiveRateLimitedError: FakeRateLimited,
    LiveHttpError: FakeHttpError,
    RATE_LIMIT_BACKOFF_MS: 60_000,
    fetchRound: (id: string) => roundHandler(id),
    fetchTour: (id: string) => Promise.resolve(tourFor(id)),
    fetchRoundPgn: () => Promise.resolve(null),
    fetchTourPgn: (id: string) => {
      tourPgnCalls.push(id);
      return tourPgnHandler(id);
    },
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
const { useLiveStore, setLiveManagerDeps } = await import("./live-store.ts");
const { useStandingsCache } = await import("./live-standings-cache.ts");
const { parseTourPgn } = await import("./live-tour-games.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

const WHITE_TO_MOVE = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const named = (name: string, rating = 2600) => ({ name, title: null, rating, fed: null, fideId: null, clockMs: 600_000 });
function game(id: string, roundId: string, white: string, black: string, over: Partial<LiveGame> = {}): LiveGame {
  return {
    id, roundId, white: named(white), black: named(black), fen: WHITE_TO_MOVE, lastMoveUci: null, result: "*",
    thinkTimeSec: null, pgn: null, updatedAt: Date.now(), ...over,
  };
}
const tourSummary = { id: "T1", slug: "open-a", name: "Open A", format: null, timeControl: null, location: null, imageUrl: null, tier: null, dates: null, url: "u" };
const rounds = [
  { id: "RoundAAA", slug: "round-1", name: "Round 1", ongoing: false, finished: true, startsAt: 1, url: "u" },
  { id: "RoundBBB", slug: "round-2", name: "Round 2", ongoing: true, finished: false, startsAt: 2, url: "u" },
];
function tourFor(id: string): BroadcastTour {
  return { tour: { ...tourSummary, id, standingsUrl: "https://s3.chess-results.com/tnr1514275.aspx?art=1" }, rounds, group: null, defaultRoundId: "RoundBBB" };
}
function snapshot(roundId: string, games: LiveGame[]): BroadcastRoundSnapshot {
  return { tour: tourSummary, round: rounds.find((r) => r.id === roundId)!, games, group: null, defaultRoundId: null };
}
// The open round (Round 2) as the live store has it: its board 1 is still going, unlike the tournament PGN (1-0).
const OPEN_ROUND = [
  game("gameB1xx", "RoundBBB", "Carlsen, Magnus", "Pérez, José"),
  game("gameB2xx", "RoundBBB", "Sevian, Samuel", "Nobody, Joe"),
];
const OTHER_ROUND = [game("gameA1xx", "RoundAAA", "Pérez, José", "Carlsen, Magnus", { result: "0-1" })];

before(() => setupDom());
afterEach(() => cleanup());
after(async () => {
  await teardownDom();
});
beforeEach(() => {
  cleanup();
  useLiveStore.getState().leaveLive();
  setLiveManagerDeps(null); // a 429 in one test must not leave the next one paused for a minute
  tourPgnCalls.length = 0;
  standingsCalls = 0;
  standingRows = [];
  tourPgnHandler = async () => TOUR_PGN;
  roundHandler = async (id) => snapshot(id, id === "RoundBBB" ? OPEN_ROUND : OTHER_ROUND);
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("http://localhost/studio?view=live&live=RoundBBB");
  act(() => {
    useStudioStore.setState({ workspaceView: "live", settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  });
});

const rowOf = (id: string) => document.querySelector(`[data-live-row="${id}"]`) as HTMLElement | null;
const rowIds = () => [...document.querySelectorAll("[data-live-row]")].map((r) => (r as HTMLElement).dataset.liveRow);
const toggle = () => screen.getByRole("switch", { name: "All rounds" }) as HTMLInputElement;
const searchBox = () => screen.getByRole("textbox", { name: "Search players" }) as HTMLInputElement;

async function renderRound() {
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("gameB1xx")));
  await waitFor(() => assert.equal(toggle().disabled, false));
  // SIG-1313: entering a round on desktop opens its first boards; these tests start from an empty grid.
  await waitFor(() => assert.equal(useLiveStore.getState().openBoards.length, 2));
  act(() => useLiveStore.getState().closeAllBoards());
}
async function turnOn() {
  fireEvent.click(toggle());
  await waitFor(() => assert.ok(rowOf("gameA1xx")));
}

test("parseTourPgn: the round id comes from BroadcastURL, games without it are skipped, boards in order per round", () => {
  const rows = parseTourPgn(TOUR_PGN);
  assert.deepEqual(rows.map((r) => [r.roundId, r.id, r.result]), [
    ["RoundBBB", "gameB1xx", "1-0"],
    ["RoundBBB", "gameB2xx", "*"],
    ["RoundAAA", "gameA1xx", "0-1"],
    ["RoundAAA", "gameA2xx", "1/2-1/2"],
  ]);
  assert.deepEqual(Object.keys(rows[0]!).sort(), ["black", "id", "result", "roundId", "white"]);
  assert.equal(rows[0]!.white.name, "Carlsen, Magnus");
  assert.equal(rows[0]!.white.rating, 2600);
  assert.deepEqual(parseTourPgn(""), []);
});

test("off by default: opening a round makes no tournament request; on makes exactly one, and again none", async () => {
  await renderRound();
  assert.equal(toggle().checked, false);
  assert.deepEqual(rowIds(), ["gameB1xx", "gameB2xx"]);
  assert.equal(tourPgnCalls.length, 0);
  await turnOn();
  assert.deepEqual(tourPgnCalls, ["T1"]);
  fireEvent.click(toggle());
  await waitFor(() => assert.deepEqual(rowIds(), ["gameB1xx", "gameB2xx"]));
  fireEvent.click(toggle());
  await waitFor(() => assert.ok(rowOf("gameA1xx")));
  assert.deepEqual(tourPgnCalls, ["T1"], "the same tournament is not fetched again in the session");
});

test("all rounds: rows by round then board, with the round name; the open round stays live from the store", async () => {
  await renderRound();
  await turnOn();
  assert.deepEqual(rowIds(), ["gameA1xx", "gameA2xx", "gameB1xx", "gameB2xx"]);
  assert.equal(rowOf("gameA1xx")!.querySelector("[data-live-round-name]")?.textContent, "Round 1");
  assert.equal(rowOf("gameB2xx")!.querySelector("[data-live-round-name]")?.textContent, "Round 2");
  // the PGN says 1-0 for B1; the store (live) says it is going on
  assert.doesNotMatch(rowOf("gameB1xx")!.textContent!, /1-0/u);
  assert.match(rowOf("gameB1xx")!.textContent!, /10:00/u);
  assert.match(rowOf("gameA1xx")!.textContent!, /0-1/u);
});

test("all rounds: search and the status filter apply to every round, with counts", async () => {
  await renderRound();
  await turnOn();
  fireEvent.change(searchBox(), { target: { value: "sevian" } });
  assert.deepEqual(rowIds(), ["gameA2xx", "gameB2xx"]);
  fireEvent.change(searchBox(), { target: { value: "jose" } });
  assert.deepEqual(rowIds(), ["gameA1xx", "gameB1xx"]);
  fireEvent.click(screen.getByRole("button", { name: /^Finished/u }));
  assert.deepEqual(rowIds(), ["gameA1xx"]);
  fireEvent.click(screen.getByRole("button", { name: /^Live/u }));
  assert.deepEqual(rowIds(), ["gameB1xx"]);
  fireEvent.change(screen.getByLabelText("Sort games"), { target: { value: "rating" } });
  assert.deepEqual(rowIds(), ["gameB1xx"]);
});

test("loading state while the request runs, then the rows", async () => {
  let resolve!: (text: string) => void;
  tourPgnHandler = () => new Promise((r) => (resolve = r));
  await renderRound();
  fireEvent.click(toggle());
  await screen.findByTestId("live-all-rounds-loading");
  assert.deepEqual(rowIds(), ["gameB1xx", "gameB2xx"], "the open round keeps working meanwhile");
  await act(async () => resolve(TOUR_PGN));
  await waitFor(() => assert.ok(rowOf("gameA1xx")));
  assert.equal(screen.queryByTestId("live-all-rounds-loading"), null);
});

test("a 429 shows the error and keeps the open round; retrying waits for the queue's pause instead of requesting", async () => {
  tourPgnHandler = async () => {
    throw new FakeRateLimited();
  };
  await renderRound();
  fireEvent.click(toggle());
  await screen.findByTestId("live-all-rounds-error");
  assert.deepEqual(rowIds(), ["gameB1xx", "gameB2xx"]);
  assert.equal(toggle().checked, true);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByTestId("live-all-rounds-loading");
  assert.equal(tourPgnCalls.length, 1, "the serial queue holds the retry during Lichess' one-minute pause");
});

test("after a failure, Try again requests once more and shows the rows", async () => {
  tourPgnHandler = async () => {
    throw new FakeHttpError(500);
  };
  await renderRound();
  fireEvent.click(toggle());
  await screen.findByTestId("live-all-rounds-error");
  tourPgnHandler = async () => TOUR_PGN;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => assert.ok(rowOf("gameA1xx")));
  assert.equal(screen.queryByTestId("live-all-rounds-error"), null);
  assert.equal(tourPgnCalls.length, 2);
});

test("a failed request can also be retried by turning the toggle off and on", async () => {
  tourPgnHandler = async () => {
    throw new FakeHttpError(500);
  };
  await renderRound();
  fireEvent.click(toggle());
  await screen.findByTestId("live-all-rounds-error");
  fireEvent.click(toggle());
  assert.equal(screen.queryByTestId("live-all-rounds-error"), null);
  tourPgnHandler = async () => TOUR_PGN;
  await turnOn();
  assert.equal(tourPgnCalls.length, 2);
});

test("clicking a result opens it in the grid with that game's round; the marker uses the row's round", async () => {
  await renderRound();
  await turnOn();
  fireEvent.click(rowOf("gameA1xx")!);
  const s = useLiveStore.getState();
  assert.deepEqual(s.openBoards, [{ roundId: "RoundAAA", gameId: "gameA1xx" }]);
  assert.deepEqual(s.focusedGame, { roundId: "RoundAAA", gameId: "gameA1xx" });
  assert.equal(rowOf("gameA1xx")!.querySelector("[data-live-grid-number]")?.textContent, "1");
  assert.equal(rowOf("gameB1xx")!.querySelector("[data-live-grid-number]"), null);
  // the round's snapshot arrives: the row now has real clocks, like any open board
  await waitFor(() => assert.ok(useLiveStore.getState().gamesByRound.RoundAAA?.gameA1xx));
  await waitFor(() => assert.match(rowOf("gameA1xx")!.textContent!, /10:00/u));
  fireEvent.click(within(rowOf("gameA1xx")!).getByRole("button", { name: "Close board" }));
  assert.deepEqual(useLiveStore.getState().openBoards, []);
});

test("Ctrl/Cmd-click opens the game in the Studio in a new tab, with the game's own round", async () => {
  await renderRound();
  await turnOn();
  const calls: unknown[][] = [];
  const original = window.open;
  window.open = ((...args: unknown[]) => {
    calls.push(args);
    return null;
  }) as typeof window.open;
  try {
    fireEvent.click(rowOf("gameA2xx")!, { ctrlKey: true });
    fireEvent.click(rowOf("gameB2xx")!, { metaKey: true });
  } finally {
    window.open = original;
  }
  assert.deepEqual(calls, [
    ["/studio?broadcast=RoundAAA%3AgameA2xx", "_blank", "noopener"],
    ["/studio?broadcast=RoundBBB%3AgameB2xx", "_blank", "noopener"],
  ]);
  assert.deepEqual(useLiveStore.getState().openBoards, []);
});

test("the toggle resets when the round changes, and leaving Live clears the cache", async () => {
  await renderRound();
  await turnOn();
  fireEvent.change(await screen.findByLabelText("Round"), { target: { value: "RoundAAA" } });
  await waitFor(() => assert.equal(useLiveStore.getState().tableRoundId, "RoundAAA"));
  await waitFor(() => assert.equal(toggle().checked, false));
  fireEvent.click(toggle());
  await waitFor(() => assert.ok(rowOf("gameB2xx")));
  assert.equal(tourPgnCalls.length, 1, "still cached for the session");
  cleanup();
  // SIG-1406: leaving /studio calls leaveLive(), which clears the tour PGN cache.
  useLiveStore.getState().leaveLive();
  tourPgnCalls.length = 0;
  window.history.replaceState(null, "", "/studio?view=live&live=RoundBBB");
  await renderRound();
  await turnOn();
  assert.equal(tourPgnCalls.length, 1);
});

test("pt-BR label", async () => {
  act(() => {
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });
  });
  render(<LiveView />);
  await screen.findByRole("switch", { name: "Todas as rodadas" });
  fireEvent.click(await screen.findByRole("switch", { name: "Todas as rodadas" }));
  await waitFor(() => assert.ok(rowOf("gameA1xx")));
  assert.equal(screen.queryByText("Carregando partidas de todas as rodadas…"), null);
});


test("standings tab shows round progress, individual statistics and the Chess Results link", async () => {
  standingRows = [{
    rank: 1, name: "Sun, Yunjin", title: "WFM", rating: 1883, fed: "CHN", fideId: 8688672,
    played: 3, score: 2.5, ratingDiff: 24, performance: 2441,
  }];
  act(() => {
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });
  });
  render(<LiveView />);
  const gamesTab = await screen.findByRole("tab", { name: "Partidas" });
  assert.equal(gamesTab.getAttribute("aria-selected"), "true");
  assert.equal(standingsCalls, 0);
  fireEvent.keyDown(gamesTab, { key: "ArrowRight" });
  const table = await screen.findByRole("table", { name: "Classificação" });
  assert.ok(screen.getByText("Rodada 1 de 2"));
  assert.deepEqual(within(table).getAllByRole("cell").map((cell) => cell.textContent), [
    "1", "WFMSun, Yunjin1883CHN", "2½", "3", "2441", "+24",
  ]);
  const link = screen.getByRole("link", { name: "Classificação completa no Chess Results" });
  assert.equal(link.getAttribute("href"), "https://s3.chess-results.com/tnr1514275.aspx?art=1");
  assert.equal(link.getAttribute("target"), "_blank");
  assert.ok((link as HTMLAnchorElement).relList.contains("noopener"));
  fireEvent.click(gamesTab);
  fireEvent.click(screen.getByRole("tab", { name: "Classificação" }));
  assert.ok(screen.getByRole("table", { name: "Classificação" }));
  assert.equal(standingsCalls, 1);
});

test("empty standings refresh after a result change and respect the cooldown", async () => {
  await renderRound();
  fireEvent.click(screen.getByRole("tab", { name: "Standings" }));
  await screen.findByText("No standings yet.");
  assert.equal(screen.queryByRole("table", { name: "Standings" }), null);

  const first = useStandingsCache.getState().T1!;
  const finishGame = (result: LiveGame["result"]) => {
    useLiveStore.getState().ingestSnapshot(snapshot("RoundBBB", [{ ...OPEN_ROUND[0]!, result }]));
  };
  act(() => finishGame("1-0"));
  assert.equal(standingsCalls, 1);
  assert.equal(useStandingsCache.getState().T1, first);

  standingRows = [{
    rank: 1, name: "Carlsen, Magnus", title: "GM", rating: 2800, fed: "NOR", fideId: null,
    played: 1, score: 1, ratingDiff: null, performance: null,
  }];
  act(() => useStandingsCache.setState({ T1: { ...first, requestedAt: Date.now() - 60_000 } }));
  await screen.findByRole("table", { name: "Standings" });
  assert.equal(standingsCalls, 2);
  assert.equal(screen.queryByRole("columnheader", { name: "Performance" }), null);
  assert.equal(screen.queryByRole("columnheader", { name: "Rating change" }), null);
});

test("player hover loads standings lazily, and a name tap still opens the game", async () => {
  standingRows = [{
    rank: 3, name: "Carlsen, Magnus", title: "GM", rating: 2800, fed: "NOR", fideId: 1503014,
    played: 6, score: 4.5, ratingDiff: 12, performance: 2820,
  }, {
    rank: 5, name: "Pérez, José", title: null, rating: 2600, fed: null, fideId: 123,
    played: 6, score: 3, ratingDiff: null, performance: null,
  }];
  await renderRound();
  const name = within(rowOf("gameB1xx")!).getByText("M. Carlsen");
  assert.equal(standingsCalls, 0);
  fireEvent.pointerOver(name, { pointerType: "mouse" });
  assert.equal(screen.queryByRole("tooltip"), null);
  const card = await screen.findByRole("tooltip");
  const details = within(card);
  await details.findByText("4½ / 6");
  for (const text of ["Carlsen, Magnus", "3rd place", "GM", "2800", "NOR", "2820", "+12"]) {
    assert.ok(details.getByText(text));
  }
  assert.equal(name.getAttribute("aria-describedby"), card.id);
  assert.equal(standingsCalls, 1);
  fireEvent.pointerOut(name, { pointerType: "mouse" });
  assert.equal(screen.queryByRole("tooltip"), null);

  fireEvent.pointerOver(name, { pointerType: "touch" });
  fireEvent.click(name);
  const boardName = within(document.querySelector('[data-live-board="gameB1xx"]') as HTMLElement)
    .getByText("Carlsen, Magnus");
  act(() => boardName.focus());
  await within(await screen.findByRole("tooltip")).findByText("4½ / 6");
  assert.equal(standingsCalls, 1);
  fireEvent.keyDown(boardName, { key: "Escape" });
  assert.equal(screen.queryByRole("tooltip"), null);
  assert.equal(document.activeElement, boardName);
});

test("keyboard focus and blur show and close the Portuguese score fallback", async () => {
  standingRows = [{
    rank: 1, name: "Carlsen, Magnus", title: "GM", rating: 2800, fed: "NOR", fideId: 1503014,
    played: 6, score: 6, ratingDiff: null, performance: null,
  }];
  act(() => {
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });
  });
  render(<LiveView />);
  await waitFor(() => assert.ok(rowOf("gameB1xx")));
  const name = within(rowOf("gameB1xx")!).getByText("J. Pérez");
  act(() => name.focus());
  const details = within(await screen.findByRole("tooltip"));
  assert.ok(details.getByText("Pontuação indisponível"));
  assert.ok(details.getByText("Pérez, José"));
  assert.ok(details.getByText("2600"));
  await waitFor(() => assert.equal(useStandingsCache.getState().T1?.status, "ready"));
  assert.ok(details.getByText("Pontuação indisponível"));
  assert.equal(details.queryByText("1º lugar"), null);
  act(() => name.blur());
  assert.equal(screen.queryByRole("tooltip"), null);
  const rankedName = within(rowOf("gameB1xx")!).getByText("M. Carlsen");
  act(() => rankedName.focus());
  assert.ok(within(await screen.findByRole("tooltip")).getByText("1º lugar"));
});
