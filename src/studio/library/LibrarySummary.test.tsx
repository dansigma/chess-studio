import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LibrarySummary } from "./LibrarySummary";
import { useLibraryStore } from "./library-store";
import { useStudioStore } from "@/src/store/studio-store";
import { overviewFromItems, type LibraryOverview, type OverviewRow } from "@/src/lib/library/overview";
import { DEFAULT_LIBRARY_FILTERS, type LibrarySourceAdapter } from "@/src/lib/library/types";
import { clearLibrarySources, registerLibrarySource } from "@/src/lib/library/sources";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const row = (o: Partial<OverviewRow>): OverviewRow => ({
  white: "A", black: "B", whiteElo: null, blackElo: null, eco: null, opening: null, result: "*", date: null, ...o,
});
const pgn = (white: string, black: string, eco: string, opening: string, date?: string) =>
  `[White "${white}"]\n[Black "${black}"]\n[WhiteElo "2000"]\n[BlackElo "2200"]\n[ECO "${eco}"]\n[Opening "${opening}"]${
    date ? `\n[Date "${date}.01.01"]` : ""
  }\n\n1. e4 *`;
const file = (id: string, games: [string, string, string, string, string?, string?][]) => ({
  id, name: id, folderId: null, remoteId: null,
  games: games.map(([w, b, e, o, date, result], i) => ({
    id: `${id}-${i}`, white: w, black: b, result: result ?? "*", event: "", date: date ?? "", title: "",
    pgn: pgn(w, b, e, o, date),
  })),
});

function myGames(overview: Promise<LibraryOverview>): LibrarySourceAdapter {
  return {
    id: "my-games", label: () => "My Games", capabilities: () => ({}) as never,
    list: async () => ({ items: [], nextCursor: null, total: 0 }), loadPgn: async () => "",
    overview: () => overview,
  };
}

const setDatabases = (databases: unknown[]) =>
  useStudioStore.setState((s) => ({ files: { ...s.files, databases: databases as never } }));
const select = (sources: string[]) =>
  useLibraryStore.setState({ filters: { ...DEFAULT_LIBRARY_FILTERS, sources: sources as never } });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const text = (testId: string) => screen.getByTestId(testId).textContent ?? "";

beforeEach(() => {
  clearLibrarySources();
  useStudioStore.setState((s) => ({ settings: { ...s.settings, locale: "en" } }));
  setDatabases([
    file("d1", [["Magnus", "Hikaru", "C65", "Ruy Lopez"], ["Magnus", "Nepo", "C65", "Ruy Lopez"], ["X", "Y", "A00", "Uncommon"]]),
    file("d2", [["magnus", "Z", "B01", "Scandinavian"]]),
  ]);
  select(["file:d1", "file:d2"]);
});

test("shows games, distinct players, average Elo and the summary sections", () => {
  render(<LibrarySummary />);
  const summary = text("library-summary");
  assert.match(summary, /Games\s*4/);
  assert.match(summary, /Players\s*6/); // Magnus, Hikaru, Nepo, X, Y, Z
  assert.match(summary, /Avg\. Elo\s*2,?100/);
  assert.match(summary, /All games in the selected sources, without filters/);

  const openings = within(screen.getByTestId("library-summary-openings")).getAllByRole("button");
  assert.equal(openings.length, 3);
  assert.match(openings[0].textContent!, /C65Ruy Lopez2/);
  assert.match(openings[1].textContent!, /A00/); // ties by code ascending
  assert.equal(openings[0].getAttribute("aria-pressed"), "false");

  const players = within(screen.getByTestId("library-summary-players")).getAllByRole("button");
  assert.equal(players.length, 6);
  assert.match(players[0].textContent!, /magnus\s*3/i);
});

test("results bar carries White wins, draws and Black wins counts", () => {
  setDatabases([
    file("dr", [
      ["A", "B", "C20", "King's Pawn", "2020", "1-0"],
      ["C", "D", "C20", "King's Pawn", "2020", "1/2-1/2"],
      ["E", "F", "C20", "King's Pawn", "2020", "0-1"],
    ]),
  ]);
  select(["file:dr"]);
  render(<LibrarySummary />);
  const results = screen.getByTestId("library-summary-results");
  assert.match(results.textContent!, /White wins\s*1/);
  assert.match(results.textContent!, /Draws\s*1/);
  assert.match(results.textContent!, /Black wins\s*1/);
  assert.ok(results.querySelector('[data-perspective="color"]'));
});

test("unfinished games count in Games but not in the results (SIG-1339 review)", () => {
  setDatabases([
    file("dr", [
      ["A", "B", "C20", "King's Pawn", "2020", "1-0"],
      ["C", "D", "C20", "King's Pawn", "2020", "*"],
    ]),
  ]);
  select(["file:dr"]);
  render(<LibrarySummary />);
  assert.match(text("library-summary-tiles"), /Games\s*2/);
  const results = screen.getByTestId("library-summary-results");
  assert.match(results.textContent!, /White wins\s*1/);
  assert.match(results.textContent!, /1 unfinished game is not counted/);
});

test("no results section when every game is unfinished (SIG-1339 review)", () => {
  setDatabases([file("dr", [["A", "B", "C20", "King's Pawn", "2020", "*"]])]);
  select(["file:dr"]);
  render(<LibrarySummary />);
  assert.match(text("library-summary-tiles"), /Games\s*1/);
  assert.equal(screen.queryByTestId("library-summary-results"), null);
});

test("clicking an ECO tag sets the filter, clicking it again clears it", () => {
  render(<LibrarySummary />);
  const button = () => within(screen.getByTestId("library-summary-openings")).getByRole("button", { name: /C65/ });
  fireEvent.click(button());
  assert.equal(useLibraryStore.getState().filters.eco, "C65");
  assert.equal(button().getAttribute("aria-pressed"), "true");
  fireEvent.click(button());
  assert.equal(useLibraryStore.getState().filters.eco, "");
});

test("clicking a player sets and clears the player filter, matching case-insensitively", () => {
  useLibraryStore.setState((s) => ({ filters: { ...s.filters, player: "magnus" } }));
  render(<LibrarySummary />);
  const player = (name: RegExp) =>
    within(screen.getByTestId("library-summary-players")).getByRole("button", { name });
  assert.equal(player(/Magnus/).getAttribute("aria-pressed"), "true");
  fireEvent.click(player(/Magnus/));
  assert.equal(useLibraryStore.getState().filters.player, "");
  assert.equal(player(/Magnus/).getAttribute("aria-pressed"), "false");
  fireEvent.click(player(/Magnus/));
  assert.equal(useLibraryStore.getState().filters.player, "Magnus");
  assert.equal(player(/Magnus/).getAttribute("aria-pressed"), "true");
});

test("clicking a year sets a single-year filter and clears it", () => {
  setDatabases([
    file("dy", [
      ["A", "B", "C20", "King's Pawn", "2019"],
      ["C", "D", "C20", "King's Pawn", "2020"],
      ["E", "F", "C20", "King's Pawn", "2021"],
    ]),
  ]);
  select(["file:dy"]);
  render(<LibrarySummary />);
  const year = () => within(screen.getByTestId("library-summary-years")).getByRole("button", { name: /2020/ });
  fireEvent.click(year());
  assert.equal(useLibraryStore.getState().filters.yearFrom, 2020);
  assert.equal(useLibraryStore.getState().filters.yearTo, 2020);
  assert.equal(year().getAttribute("aria-pressed"), "true");
  fireEvent.click(year());
  assert.equal(useLibraryStore.getState().filters.yearFrom, null);
  assert.equal(useLibraryStore.getState().filters.yearTo, null);
});

test("years are shown oldest to newest, at most the last 15 with games", () => {
  setDatabases([
    file("dyears", Array.from({ length: 17 }, (_, i) => ["A", "B", "C20", "King's Pawn", String(2000 + i)] as [string, string, string, string, string])),
  ]);
  select(["file:dyears"]);
  render(<LibrarySummary />);
  const years = within(screen.getByTestId("library-summary-years")).getAllByRole("button");
  assert.equal(years.length, 15);
  assert.match(years[0].textContent!, /2002/);
  assert.match(years[14].textContent!, /2016/);
});

test("ignores the current filters and updates when databases change", () => {
  useLibraryStore.setState((s) => ({ filters: { ...s.filters, query: "nothing", eco: "A" } }));
  render(<LibrarySummary />);
  assert.match(text("library-summary"), /Games\s*4/);
  act(() => setDatabases([file("d1", [["Q", "R", "D00", "QGD"]])]));
  assert.match(text("library-summary"), /Games\s*1/);
});

test("Masters is excluded; Masters alone shows the unavailable message", () => {
  select(["masters", "file:d2"]);
  const { unmount } = render(<LibrarySummary />);
  assert.match(text("library-summary"), /Games\s*1/);
  unmount();
  select(["masters"]);
  render(<LibrarySummary />);
  assert.ok(screen.getByText("Summary not available for Masters"));
  act(() => useStudioStore.setState((s) => ({ settings: { ...s.settings, locale: "pt-br" } })));
  assert.ok(screen.getByText("Resumo indisponível para Masters"));
});

test("an empty selection shows only the title and the empty line", () => {
  select([]);
  render(<LibrarySummary />);
  const summary = text("library-summary");
  assert.match(summary, /Database summary/);
  assert.match(summary, /No games in this selection/);
  assert.equal(screen.queryByTestId("library-summary-tiles"), null);
  act(() => useStudioStore.setState((s) => ({ settings: { ...s.settings, locale: "pt-br" } })));
  assert.ok(screen.getByText("Nenhuma partida nesta seleção"));
});

test("My Games: skeleton while loading, then merged with files", async () => {
  let resolve!: (o: LibraryOverview) => void;
  registerLibrarySource(myGames(new Promise((r) => (resolve = r))));
  select(["my-games", "file:d2"]);
  render(<LibrarySummary />);
  await flush();
  assert.ok(screen.getByTestId("library-summary-skeleton"));
  assert.match(text("library-summary"), /Loading summary/);
  await act(async () => resolve(overviewFromItems([row({ white: "Magnus", black: "Me", eco: "B01" })])));
  assert.equal(screen.queryByTestId("library-summary-skeleton"), null);
  assert.match(text("library-summary"), /Games\s*2/);
  assert.match(text("library-summary"), /Players\s*3/);
});

test("My Games failure: file numbers plus a note; alone, just the note", async () => {
  registerLibrarySource(myGames(Promise.reject(new Error("signed out"))));
  select(["my-games", "file:d2"]);
  const { unmount } = render(<LibrarySummary />);
  await flush();
  assert.match(text("library-summary"), /Games\s*1/);
  assert.ok(screen.getByTestId("library-summary-failed"));
  unmount();
  select(["my-games"]);
  render(<LibrarySummary />);
  await flush();
  assert.match(text("library-summary"), /My Games summary unavailable/);
  assert.equal(screen.queryByTestId("library-summary-tiles"), null);
});

test("My Games failure with an unknown or empty PGN file selected keeps zero file numbers plus the note", async () => {
  registerLibrarySource(myGames(Promise.reject(new Error("signed out"))));
  select(["my-games", "file:gone"]);
  render(<LibrarySummary />);
  await flush();
  assert.match(text("library-summary"), /Games\s*0/);
  assert.ok(screen.getByTestId("library-summary-failed"));
});

test("My Games refetches after sign-in instead of keeping the signed-out failure", async () => {
  let calls = 0;
  registerLibrarySource({
    ...myGames(Promise.resolve(overviewFromItems([]))),
    overview: () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("signed out"))
        : Promise.resolve(overviewFromItems([row({ white: "Me", black: "Opp", eco: "B01" })]));
    },
  });
  useStudioStore.setState({ user: null });
  select(["my-games"]);
  render(<LibrarySummary />);
  await flush();
  assert.match(text("library-summary"), /My Games summary unavailable/);
  act(() => useStudioStore.setState({ user: { id: "u1" } as never }));
  await flush();
  assert.equal(calls, 2);
  assert.match(text("library-summary"), /Games\s*1/);
  act(() => useStudioStore.setState({ user: null }));
});
