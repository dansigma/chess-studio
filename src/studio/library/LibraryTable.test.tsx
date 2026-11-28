import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LibraryTable } from "./LibraryTable";
import { useLibraryStore } from "./library-store";
import { clearLibrarySources, registerLibrarySource } from "@/src/lib/library/sources";
import type { LibraryGameItem, LibrarySourceAdapter } from "@/src/lib/library/types";
import { DEFAULT_LIBRARY_FILTERS } from "@/src/lib/library/types";
import { useStudioStore } from "@/src/store/studio-store";
import type { LibraryGamesState } from "./use-library-games";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => {
  cleanup();
  clearLibrarySources();
  useLibraryStore.setState({ filters: DEFAULT_LIBRARY_FILTERS, selectedKey: null });
  useStudioStore.setState({ filesHydrated: true, training: false, trainingStart: null, workspaceView: "library" });
});

function item(n: number): LibraryGameItem {
  return {
    key: `my-games:${n}`, sourceId: "my-games", gameId: String(n),
    white: `W${n}`, whiteElo: 2000 + n, black: `B${n}`, blackElo: null,
    result: n % 3 === 0 ? "1-0" : n % 3 === 1 ? "0-1" : "1/2-1/2",
    eco: "C20", opening: "King's Pawn", plyCount: 41, event: null, date: "2024",
  };
}

function games(count: number, extra: Partial<LibraryGamesState> = {}): LibraryGamesState {
  return {
    items: Array.from({ length: count }, (_, i) => item(i)), total: count, loading: false,
    loadingMore: false, error: null, sourceErrors: {}, hasMore: false, loadMore: () => {}, retry: () => {},
    ...extra,
  };
}

test("renders only a window of 5000 rows, with dashes and move counts", () => {
  render(<LibraryTable games={games(5000)} />);
  const rows = screen.getAllByTestId("library-row");
  assert.ok(rows.length > 0 && rows.length < 60);
  assert.ok(screen.getAllByText("21").length > 0);
  assert.ok(screen.getAllByText("—").length > 0);
});

test("header click cycles first direction, opposite, then the default sort", () => {
  render(<LibraryTable games={games(5)} />);
  const header = () => screen.getByRole("columnheader", { name: "White" });
  assert.equal(header().getAttribute("aria-sort"), "none");
  fireEvent.click(header().querySelector("button")!);
  assert.deepEqual(useLibraryStore.getState().filters.sort, { key: "white", direction: "asc" });
  assert.equal(header().getAttribute("aria-sort"), "ascending");
  fireEvent.click(header().querySelector("button")!);
  assert.deepEqual(useLibraryStore.getState().filters.sort, { key: "white", direction: "desc" });
  assert.equal(header().getAttribute("aria-sort"), "descending");
  fireEvent.click(header().querySelector("button")!);
  assert.deepEqual(useLibraryStore.getState().filters.sort, { key: "date", direction: "desc" });
  assert.equal(header().getAttribute("aria-sort"), "none");
  assert.equal(screen.getByRole("columnheader", { name: "Date" }).getAttribute("aria-sort"), "descending");
});

test("Date shows the year with the full date in the tooltip", () => {
  const row = item(1);
  row.date = "2024-03-01";
  render(<LibraryTable games={games(1, { items: [row] })} />);
  assert.equal(screen.getByRole("columnheader", { name: "Date" }).getAttribute("aria-sort"), "descending");
  assert.equal(screen.getByTitle("2024-03-01").textContent, "2024");
});

test("wide tables show Opening and the shared neutral ECO badge", () => {
  render(<LibraryTable games={games(1)} />);
  const opening = screen.getByRole("columnheader", { name: "Opening" });
  assert.equal(opening.querySelector("button"), null);
  assert.equal(opening.getAttribute("aria-sort"), null);
  assert.ok(screen.getByText("King's Pawn"));
  assert.equal(screen.getByText("C20").getAttribute("data-eco-family"), "C");
});

test("both player names are bold and use the normal text colour for every result", () => {
  render(<LibraryTable games={games(4, { items: [item(0), item(1), item(2), { ...item(3), result: "*" }] })} />);
  for (const name of ["W0", "B0", "W1", "B1", "W2", "B2", "W3", "B3"]) {
    const { classList } = screen.getByText(name);
    assert.ok(classList.contains("font-semibold"), name);
    assert.ok(classList.contains("text-studio-fg"), name);
    assert.ok(!classList.contains("text-studio-muted"), name);
  }
});

test("ratings are right-aligned muted figures and a missing one is a dash", () => {
  render(<LibraryTable games={games(1)} />);
  const rating = screen.getByText("2000");
  assert.ok(rating.className.includes("text-studio-muted"));
  assert.ok(rating.className.includes("text-right"));
  assert.ok(rating.className.includes("tabular-nums"));
  assert.ok(screen.getAllByText("—").length > 0);
});

const PGN = '[Event "Test"]\n[White "W"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';

function sourceItem(n: number): LibraryGameItem {
  return { ...item(n), key: `masters:${n}`, sourceId: "masters", gameId: String(n) };
}

function adapter(): LibrarySourceAdapter {
  return {
    id: "masters",
    label: () => "Masters",
    capabilities: () => { throw new Error("unused"); },
    list: async () => ({ items: [], nextCursor: null, total: 0 }),
    loadPgn: async () => PGN,
  };
}

test("row actions open and train without changing the selection", async () => {
  registerLibrarySource(adapter());
  const items = [sourceItem(0), sourceItem(1)];
  const boardsBefore = useStudioStore.getState().boards.length;
  render(<LibraryTable games={games(2, { items })} />);
  fireEvent.click(screen.getAllByTestId("library-row")[0]!);
  assert.equal(useLibraryStore.getState().selectedKey, "masters:0");

  const open = within(screen.getAllByTestId("library-row")[1]!).getByRole("button", {
    name: "Open in Studio",
  });
  await act(async () => {
    fireEvent.click(open);
  });
  await waitFor(() => assert.equal(useStudioStore.getState().boards.length, boardsBefore + 1));
  assert.equal(useLibraryStore.getState().selectedKey, "masters:0");

  const train = within(screen.getAllByTestId("library-row")[1]!).getByRole("button", {
    name: "Train line",
  });
  await act(async () => {
    fireEvent.click(train);
  });
  await waitFor(() => assert.equal(useStudioStore.getState().training, true));
  assert.equal(useLibraryStore.getState().selectedKey, "masters:0");
  assert.equal(useStudioStore.getState().workspaceView, "studio");
  assert.deepEqual(useStudioStore.getState().trainingStart, []);
});

test("click and arrow keys move the selection", () => {
  render(<LibraryTable games={games(5)} />);
  fireEvent.click(screen.getAllByTestId("library-row")[1]!);
  assert.equal(useLibraryStore.getState().selectedKey, "my-games:1");
  const grid = screen.getByRole("grid");
  fireEvent.keyDown(grid, { key: "ArrowDown" });
  assert.equal(useLibraryStore.getState().selectedKey, "my-games:2");
  fireEvent.keyDown(grid, { key: "ArrowUp" });
  fireEvent.keyDown(grid, { key: "ArrowUp" });
  assert.equal(useLibraryStore.getState().selectedKey, "my-games:0");
  assert.equal(screen.getAllByTestId("library-row")[0]!.getAttribute("aria-selected"), "true");
});

test("Escape and clicking the selected row again clear the selection", () => {
  render(<LibraryTable games={games(5)} />);
  const rows = screen.getAllByTestId("library-row");
  fireEvent.click(rows[0]!);
  assert.equal(useLibraryStore.getState().selectedKey, "my-games:0");
  fireEvent.click(rows[0]!);
  assert.equal(useLibraryStore.getState().selectedKey, null);

  fireEvent.click(rows[1]!);
  assert.equal(useLibraryStore.getState().selectedKey, "my-games:1");
  fireEvent.keyDown(screen.getByRole("grid"), { key: "Escape" });
  assert.equal(useLibraryStore.getState().selectedKey, null);
});

test("a double-click opens the game and keeps the row selected", async () => {
  registerLibrarySource(adapter());
  const items = [sourceItem(0)];
  const boardsBefore = useStudioStore.getState().boards.length;
  render(<LibraryTable games={games(1, { items })} />);
  const row = screen.getAllByTestId("library-row")[0]!;
  fireEvent.click(row, { detail: 1 });
  fireEvent.click(row, { detail: 2 });
  fireEvent.doubleClick(row);
  assert.equal(useLibraryStore.getState().selectedKey, "masters:0");
  await waitFor(() => assert.equal(useStudioStore.getState().boards.length, boardsBefore + 1));
  assert.equal(useLibraryStore.getState().selectedKey, "masters:0");
});

test("loadMore fires near the end and shows the loading row", async () => {
  let calls = 0;
  const { rerender } = render(<LibraryTable games={games(20, { hasMore: true, loadMore: () => { calls++; } })} />);
  await act(async () => {});
  assert.ok(calls >= 1);
  rerender(<LibraryTable games={games(20, { hasMore: true, loadingMore: true })} />);
  assert.ok(screen.getByTestId("library-loading-row"));
});

test("does not load more when nothing more exists", async () => {
  let calls = 0;
  render(<LibraryTable games={games(50, { loadMore: () => { calls++; } })} />);
  await act(async () => {});
  assert.equal(calls, 0);
});

test("an empty folder says so instead of 'no sources'", () => {
  useLibraryStore.setState({ folderId: "f-empty", filters: { ...DEFAULT_LIBRARY_FILTERS, sources: [] } });
  render(<LibraryTable games={games(0)} />);
  assert.ok(screen.getByText(/This folder has no PGN files yet/));
  cleanup();
  useLibraryStore.setState({ folderId: null });
  render(<LibraryTable games={games(0)} />);
  assert.ok(screen.getByText(/No sources available/));
  useLibraryStore.setState({ filters: DEFAULT_LIBRARY_FILTERS });
});

test("a Source column appears only when more than one source is selected", () => {
  registerLibrarySource({
    id: "my-games", label: () => "My Games", capabilities: () => ({ sort: "full" }) as never,
    list: async () => ({ items: [], nextCursor: null, total: 0 }), loadPgn: async () => "",
  });
  const { rerender } = render(<LibraryTable games={games(1)} />);
  assert.equal(screen.queryByRole("columnheader", { name: "Source" }), null);
  act(() => useLibraryStore.setState({ filters: { ...DEFAULT_LIBRARY_FILTERS, sources: ["my-games", "file:x"] } }));
  rerender(<LibraryTable games={games(1)} />);
  assert.ok(screen.getByRole("columnheader", { name: "Source" }));
  const cell = screen.getByTestId("library-row-source");
  assert.equal(cell.textContent, "My Games");
  assert.equal(cell.querySelector("span")?.getAttribute("title"), "My Games");
});

test("Masters with other sources and a text search (no position) shows the position-only note", () => {
  const filters = { ...DEFAULT_LIBRARY_FILTERS, sources: ["masters", "file:x"] as LibraryGameItem["sourceId"][] };
  useLibraryStore.setState({ filters: { ...filters, query: "carlsen" } });
  const { rerender } = render(<LibraryTable games={games(1)} />);
  assert.match(screen.getByTestId("library-masters-text-note").textContent ?? "", /board position only/);
  act(() => useLibraryStore.setState({ filters: { ...filters, query: "carlsen", position: { fen: "x" } } }));
  rerender(<LibraryTable games={games(1)} />);
  assert.equal(screen.queryByTestId("library-masters-text-note"), null);
  act(() => useLibraryStore.setState({ filters: { ...filters, sources: ["masters"], query: "carlsen" } }));
  rerender(<LibraryTable games={games(1)} />);
  assert.equal(screen.queryByTestId("library-masters-text-note"), null);
});

test("Xadrez Digital explains text search and shows the localized player cap only when reached", () => {
  const settings = useStudioStore.getState().settings;
  useLibraryStore.setState({ filters: { ...DEFAULT_LIBRARY_FILTERS, sources: ["xadrez-digital"], query: "Leitao" } });
  const { rerender } = render(<LibraryTable games={games(1, { xdPlayersCapped: true })} />);
  assert.ok(screen.getByText(/the search box matches player names only/));
  assert.ok(screen.getByText(/the 20 players with the most games/));

  act(() => useStudioStore.setState({ settings: { ...settings, locale: "pt-br" } }));
  assert.ok(screen.getByText(/partidas dos 20 jogadores/));

  rerender(<LibraryTable games={games(0, { xdPlayersCapped: true })} />);
  assert.ok(screen.getByText(/partidas dos 20 jogadores/));
  rerender(<LibraryTable games={games(0, { xdPlayersCapped: false })} />);
  assert.equal(screen.queryByText(/partidas dos 20 jogadores/), null);
  act(() => useStudioStore.setState({ settings }));
});

test("Xadrez Digital name searches automatically advance through an empty page", () => {
  useLibraryStore.setState({ filters: { ...DEFAULT_LIBRARY_FILTERS, sources: ["xadrez-digital"], player: "vescovi" } });
  let requested = 0;
  render(<LibraryTable games={games(0, { hasMore: true, loadMore: () => { requested++; } })} />);
  assert.equal(requested, 1);
});

test("partial notice shows failed sources and its retry button calls retry", () => {
  let retried = 0;
  render(<LibraryTable games={games(1, { sourceErrors: { masters: "down" }, retry: () => { retried++; } })} />);
  const status = screen.getByRole("status");
  assert.match(status.textContent ?? "", /masters/);
  fireEvent.click(within(status).getByRole("button", { name: "Try again" }));
  assert.equal(retried, 1);
});

test("only personal database rows offer deletion and require confirmation", () => {
  const store = useStudioStore.getState;
  const initial = store();
  const databaseId = store().importFileDatabase("Personal", PGN);
  const database = store().files.databases.find((entry) => entry.id === databaseId)!;
  const [{ id: gameId }] = database.games;
  const personal: LibraryGameItem = {
    ...item(1), sourceId: `file:${databaseId}`, gameId, key: `file:${databaseId}:${gameId}`,
  };
  try {
    render(<LibraryTable games={games(2, { items: [item(0), personal] })} />);
    const [unowned, owned] = screen.getAllByTestId("library-row");
    assert.equal(within(unowned).queryByRole("button", { name: "Delete game" }), null);
    const remove = within(owned).getByRole("button", { name: "Delete game" });
    fireEvent.click(remove);
    assert.equal(useLibraryStore.getState().selectedKey, null);
    const confirm = () => within(screen.getByRole("dialog", { name: "Delete this game?" }));
    fireEvent.click(confirm().getByRole("button", { name: "Cancel" }));
    assert.equal(store().files.databases.find((entry) => entry.id === databaseId)?.games.length, 1);
    fireEvent.click(remove);
    fireEvent.click(confirm().getByRole("button", { name: "Delete game" }));
    assert.equal(store().files.databases.find((entry) => entry.id === databaseId)?.games.length, 0);
    assert.equal(screen.queryByRole("dialog"), null);
  } finally {
    cleanup();
    useStudioStore.setState({ files: initial.files, activeFileDatabaseId: initial.activeFileDatabaseId });
  }
});
