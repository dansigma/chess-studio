import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "@/src/test-utils/dom";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { Chess } from "chess.js";
import { importPgn } from "@/src/chess/pgn";
import { bookKey } from "@/src/chess/opening-book";
import { decodeCountsBook, encodeCountsBook, type CountsBook } from "@/src/chess/opening-book-counts-format";
import { encodeMove } from "@/src/chess/opening-book-format";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings";
import { emptyBoard, useStudioStore } from "@/src/store/studio-store";
import * as catalog from "@/src/lib/openings-catalog";

function line(eco: string, name: string, uci: string[], san: string) {
  const board = new Chess();
  board.loadPgn(san);
  return { eco, name, uci, fen: board.fen(), side: board.turn() };
}

const kingsPawn = line("B00", "King's Pawn Game", ["e2e4"], "1. e4");
const sicilian = line("B20", "Sicilian Defense", ["e2e4", "c7c5"], "1. e4 c5");
const delayed = line("B20", "Sicilian Defense: Delayed Variation, Example Line",
  ["e2e4", "c7c5", "g1f3"], "1. e4 c5 2. Nf3");
const afterE5 = line("C20", "King's Pawn Game", ["e2e4", "e7e5"], "1. e4 e5");

const jobavaName = "Rapport-Jobava System";
const jobavaMoves = ["d2d4", "d7d5", "b1c3", "g8f6", "c1f4"];
const jobavaSan = "1. d4 d5 2. Nc3 Nf6 3. Bf4";
const jobava = line("D01", jobavaName, jobavaMoves, jobavaSan);
const jobavaE6 = line("D01", jobavaName, [...jobavaMoves, "e7e6"], `${jobavaSan} e6`);
const jobavaG6 = line("D01", jobavaName, [...jobavaMoves, "g7g6"], `${jobavaSan} g6`);
const jobavaWithE6 = line("D01", `${jobavaName}, with e6`,
  ["d2d4", "d7d5", "b1c3", "e7e6", "c1f4"], "1. d4 d5 2. Nc3 e6 3. Bf4");

const book = decodeCountsBook(encodeCountsBook([
  { key: bookKey(kingsPawn.fen), move: encodeMove("e7e5"), count: 45, total: 100 },
  { key: bookKey(kingsPawn.fen), move: encodeMove("c7c5"), count: 25, total: 100 },
  { key: bookKey(kingsPawn.fen), move: encodeMove("e7e6"), count: 15, total: 100 },
  { key: bookKey(afterE5.fen), move: encodeMove("g1f3"), count: 50, total: 100 },
  { key: bookKey(afterE5.fen), move: encodeMove("f1c4"), count: 25, total: 100 },
], { maxPly: 40 }));

const loadCountsBook = mock.fn(async (): Promise<CountsBook | null> => book);
mock.module("@/src/lib/opening-book-counts", { namedExports: { loadCountsBook } });
mock.module("@/src/lib/openings-catalog", {
  namedExports: { ...catalog, loadCatalog: async () => [kingsPawn, sicilian, delayed, jobava, jobavaE6, jobavaG6, jobavaWithE6] },
});
mock.module("react-chessboard", {
  namedExports: {
    Chessboard: ({ options }: { options: { position: string; showNotation?: boolean } }) => (
      <span data-fen={options.position} data-show-notation={options.showNotation} />
    ),
  },
});
const openBoardPanel = mock.fn();
mock.module("../dock-api", { namedExports: { openBoardPanel } });
const { AddVariationDialog } = await import("./AddVariationDialog.tsx");

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());
beforeEach(() => {
  loadCountsBook.mock.resetCalls();
  openBoardPanel.mock.resetCalls();
  useStudioStore.setState({
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    boards: [emptyBoard("Repertoire", "repertoire")],
    activeBoardId: "repertoire",
    pendingVariationMerge: null,
  });
});

test("searches the catalog, shows the final board and moves, and creates a marked board when the chosen color has none", async () => {
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "en", showCoordinates: true } });
  const onClose = mock.fn();
  const view = render(<AddVariationDialog defaultColor="white" onClose={onClose} />);
  const add = view.getByRole("button", { name: "Add to repertoire" });
  assert.equal(add.hasAttribute("disabled"), true);
  assert.ok(view.getByText("Loading opening book…"));
  await view.findByRole("button", { name: "Sicilian Defense" });

  fireEvent.change(view.getByRole("textbox", { name: "Search by opening name or ECO" }), { target: { value: "B00" } });
  assert.equal(view.queryByText("Sicilian Defense"), null);
  fireEvent.click(view.getByRole("button", { name: "B00 King's Pawn Game" }));
  const previewBoard = view.getByRole("img", { name: "Final position" }).firstElementChild;
  assert.equal(previewBoard?.getAttribute("data-fen"), kingsPawn.fen);
  assert.equal(previewBoard?.getAttribute("data-show-notation"), "false");
  assert.ok(view.getByText("1. e4"));
  assert.ok(await view.findByText("~2 lines, ~2 moves of yours"));

  fireEvent.click(view.getByRole("radio", { name: "Intermediate" }));
  assert.ok(view.getByText("~3 lines, ~2 moves of yours"));
  fireEvent.click(view.getByRole("radio", { name: "Black" }));
  assert.ok(view.getByText("~2 lines, ~1 moves of yours"));
  assert.equal(loadCountsBook.mock.callCount(), 1);
  assert.equal(add.hasAttribute("disabled"), false);
  fireEvent.click(add);

  const store = useStudioStore.getState();
  assert.equal(store.boards.length, 2);
  assert.equal(store.boards[0].title, "Repertoire");
  const created = store.active();
  assert.equal(created.title, "Black repertoire");
  assert.equal(created.orientation, "black");
  assert.equal(created.repertoireColor, "black");
  assert.deepEqual(openBoardPanel.mock.calls[0].arguments, [created.id, created.title]);
  assert.deepEqual(created.tree.children[0].children.map((node) => node.uci), ["e7e5"]);
  assert.equal(onClose.mock.callCount(), 1);
});

test("groups same-name search results and previews the selected continuation", async () => {
  const view = render(<AddVariationDialog defaultColor="white" onClose={() => {}} />);
  fireEvent.change(view.getByRole("textbox", { name: "Search by opening name or ECO" }), { target: { value: "Jobava" } });

  const group = within(await view.findByRole("group", { name: jobavaName }));
  assert.equal(group.getAllByText(jobavaName).length, 1);
  assert.equal(group.getAllByText("D01").length, 1);
  assert.deepEqual(group.getAllByRole("button").map((row) => row.textContent), [jobavaSan, "3... e6", "3... g6"]);
  assert.ok(view.getByRole("button", { name: `D01 ${jobavaName}, with e6` }));

  const main = group.getByRole("button", { name: `${jobavaName} — ${jobavaSan}` });
  const g6 = group.getByRole("button", { name: `${jobavaName} — 3... g6` });
  fireEvent.click(main);
  const preview = view.getByRole("img", { name: "Final position" });
  assert.equal(preview.firstElementChild?.getAttribute("data-fen"), jobava.fen);
  fireEvent.click(g6);
  assert.equal(main.getAttribute("aria-pressed"), "false");
  assert.equal(g6.getAttribute("aria-pressed"), "true");
  assert.equal(preview.firstElementChild?.getAttribute("data-fen"), jobavaG6.fen);
});

test("browses translated families, variations, and subvariations and can retry an unavailable book", async () => {
  loadCountsBook.mock.mockImplementationOnce(async () => null);
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });
  const view = render(<AddVariationDialog defaultColor="black" onClose={() => {}} />);
  const add = view.getByRole("button", { name: "Adicionar ao repertório" });
  const family = await view.findByRole("button", { name: "Defesa Siciliana" });
  assert.equal(view.queryByText("Delayed Variation"), null);
  fireEvent.click(family);
  fireEvent.click(view.getByRole("button", { name: "Delayed Variation" }));
  fireEvent.click(view.getByRole("button", { name: "B20 Defesa Siciliana: Delayed Variation, Example Line" }));
  assert.ok(view.getByRole("img", { name: "Posição final" }));
  assert.ok(view.getByText("1. e4 c5 2. Nf3"));
  assert.ok(await view.findByText("Livro de aberturas indisponível"));
  assert.equal(add.hasAttribute("disabled"), true);
  fireEvent.click(view.getByRole("button", { name: "Tentar de novo" }));
  assert.ok(await view.findByText("~1 linhas, ~1 lances seus"));
  assert.deepEqual(loadCountsBook.mock.calls[1].arguments, [{ retry: true }]);
  assert.equal(add.hasAttribute("disabled"), false);
});

for (const action of ["cancel", "keep", "use book"] as const) {
  test(`handles repertoire conflicts when the user chooses to ${action}`, async () => {
    const { tree } = importPgn("1. d4 d5 *");
    useStudioStore.setState({
      boards: [{ ...emptyBoard("Repertoire", "repertoire"), tree, repertoireColor: "white" }],
    });
    const onClose = mock.fn();
    const view = render(<AddVariationDialog defaultColor="white" onClose={onClose} />);
    await view.findByRole("button", { name: "B00 King's Pawn Game" });
    fireEvent.click(view.getByRole("button", { name: "B00 King's Pawn Game" }));
    await view.findByText("~2 lines, ~2 moves of yours");
    fireEvent.click(view.getByRole("button", { name: "Add to repertoire" }));

    assert.ok(view.getByRole("dialog", { name: "Resolve repertoire conflicts" }));
    assert.ok(view.getByRole("group", { name: "Move 1: your repertoire plays d4, the book suggests e4" }));
    assert.equal((view.getByRole("radio", { name: "Keep mine" }) as HTMLInputElement).checked, true);
    assert.equal(openBoardPanel.mock.callCount(), 0);
    if (action === "cancel") {
      fireEvent.click(view.getByRole("button", { name: "Cancel" }));
      assert.equal(openBoardPanel.mock.callCount(), 0);
    } else {
      if (action === "use book") fireEvent.click(view.getByRole("radio", { name: "Use the book move" }));
      fireEvent.click(view.getByRole("button", { name: "Confirm" }));
      assert.deepEqual(openBoardPanel.mock.calls[0].arguments, ["repertoire", "Repertoire"]);
    }

    const store = useStudioStore.getState();
    assert.equal(store.pendingVariationMerge, null);
    assert.equal(store.boards.length, 1);
    assert.deepEqual(store.active().tree.children.map(({ san }) => san), action === "use book" ? ["e4", "d4"] : ["d4"]);
    assert.equal(onClose.mock.callCount(), 1);
  });
}
