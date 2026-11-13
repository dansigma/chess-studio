import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LibraryOverviewBar } from "./LibraryOverviewBar";
import { useLibraryStore } from "./library-store";
import { useStudioStore } from "@/src/store/studio-store";
import { overviewFromItems, type LibraryOverview, type OverviewRow } from "@/src/lib/library/overview";
import { DEFAULT_LIBRARY_FILTERS, type LibrarySourceAdapter } from "@/src/lib/library/types";
import { clearLibrarySources, registerLibrarySource } from "@/src/lib/library/sources";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const row = (o: Partial<OverviewRow>): OverviewRow => ({
  white: "A", black: "B", whiteElo: null, blackElo: null, eco: null, opening: null, ...o,
});
const pgn = (white: string, black: string, eco: string, opening: string) =>
  `[White "${white}"]\n[Black "${black}"]\n[WhiteElo "2000"]\n[BlackElo "2200"]\n[ECO "${eco}"]\n[Opening "${opening}"]\n\n1. e4 *`;
const file = (id: string, games: [string, string, string, string][]) => ({
  id, name: id, folderId: null, remoteId: null,
  games: games.map(([w, b, e, o], i) => ({ id: `${id}-${i}`, white: w, black: b, result: "*", event: "", date: "", title: "", pgn: pgn(w, b, e, o) })),
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

beforeEach(() => {
  clearLibrarySources();
  useStudioStore.setState((s) => ({ settings: { ...s.settings, locale: "en" } }));
  setDatabases([
    file("d1", [["Magnus", "Hikaru", "C65", "Ruy Lopez"], ["Magnus", "Nepo", "C65", "Ruy Lopez"], ["X", "Y", "A00", "Uncommon"]]),
    file("d2", [["magnus", "Z", "B01", "Scandinavian"]]),
  ]);
  select(["file:d1", "file:d2"]);
});

test("shows games, distinct players, average Elo and top-3 ECO tags merged across files", async () => {
  render(<LibraryOverviewBar />);
  const bar = screen.getByTestId("library-overview-bar");
  assert.match(bar.textContent!, /Games\s*4/);
  assert.match(bar.textContent!, /Players\s*6/); // Magnus, Hikaru, Nepo, X, Y, Z
  assert.match(bar.textContent!, /Avg\. Elo\s*2,?100/);
  const tags = screen.getAllByRole("button");
  assert.equal(tags.length, 3);
  assert.match(tags[0].textContent!, /C65Ruy Lopez2/);
  assert.match(tags[1].textContent!, /A00/); // ties by code ascending
});

test("clicking an ECO tag sets the filter, clicking it again clears it", async () => {
  render(<LibraryOverviewBar />);
  fireEvent.click(screen.getByRole("button", { name: /C65/ }));
  assert.equal(useLibraryStore.getState().filters.eco, "C65");
  assert.equal(screen.getByRole("button", { name: /C65/ }).getAttribute("aria-pressed"), "true");
  fireEvent.click(screen.getByRole("button", { name: /C65/ }));
  assert.equal(useLibraryStore.getState().filters.eco, "");
});

test("ignores the current filters and updates when databases change", async () => {
  useLibraryStore.setState((s) => ({ filters: { ...s.filters, query: "nothing", eco: "A" } }));
  render(<LibraryOverviewBar />);
  assert.match(screen.getByTestId("library-overview-bar").textContent!, /Games\s*4/);
  act(() => setDatabases([file("d1", [["Q", "R", "D00", "QGD"]])]));
  assert.match(screen.getByTestId("library-overview-bar").textContent!, /Games\s*1/);
});

test("Masters is excluded; Masters alone shows the unavailable message", async () => {
  select(["masters", "file:d2"]);
  const { unmount } = render(<LibraryOverviewBar />);
  assert.match(screen.getByTestId("library-overview-bar").textContent!, /Games\s*1/);
  unmount();
  select(["masters"]);
  render(<LibraryOverviewBar />);
  assert.ok(screen.getByText("Summary not available for Masters"));
  act(() => useStudioStore.setState((s) => ({ settings: { ...s.settings, locale: "pt-br" } })));
  assert.ok(screen.getByText("Resumo indisponível para Masters"));
});

test("My Games: skeleton while loading, then merged with files", async () => {
  let resolve!: (o: LibraryOverview) => void;
  registerLibrarySource(myGames(new Promise((r) => (resolve = r))));
  select(["my-games", "file:d2"]);
  render(<LibraryOverviewBar />);
  await flush();
  assert.ok(screen.getByTestId("library-overview-skeleton"));
  await act(async () => resolve(overviewFromItems([row({ white: "Magnus", black: "Me", eco: "B01" })])));
  assert.equal(screen.queryByTestId("library-overview-skeleton"), null);
  assert.match(screen.getByTestId("library-overview-bar").textContent!, /Games\s*2/);
  assert.match(screen.getByTestId("library-overview-bar").textContent!, /Players\s*3/);
});

test("My Games failure: file numbers plus a note; alone, just the note", async () => {
  registerLibrarySource(myGames(Promise.reject(new Error("signed out"))));
  select(["my-games", "file:d2"]);
  const { unmount } = render(<LibraryOverviewBar />);
  await flush();
  const bar = screen.getByTestId("library-overview-bar");
  assert.match(bar.textContent!, /Games\s*1/);
  assert.ok(screen.getByTestId("library-overview-failed"));
  unmount();
  select(["my-games"]);
  render(<LibraryOverviewBar />);
  await flush();
  const only = screen.getByTestId("library-overview-bar");
  assert.equal(only.textContent, "My Games summary unavailable");
});
