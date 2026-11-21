import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "@/src/test-utils/dom";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Chess } from "chess.js";
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
  namedExports: { ...catalog, loadCatalog: async () => [kingsPawn, sicilian, delayed] },
});
mock.module("react-chessboard", {
  namedExports: {
    Chessboard: ({ options }: { options: { position: string } }) => <span data-fen={options.position} />,
  },
});
const { AddVariationDialog } = await import("./AddVariationDialog.tsx");

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());
beforeEach(() => {
  loadCountsBook.mock.resetCalls();
  useStudioStore.setState({
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    boards: [emptyBoard("Repertoire", "repertoire")],
    activeBoardId: "repertoire",
  });
});

test("searches the catalog, shows the final board and moves, and adds the generated tree in a new board", async () => {
  const onClose = mock.fn();
  const view = render(<AddVariationDialog defaultColor="white" onClose={onClose} />);
  const add = view.getByRole("button", { name: "Add to repertoire" });
  assert.equal(add.hasAttribute("disabled"), true);
  assert.ok(view.getByText("Loading opening book…"));
  await view.findByRole("button", { name: "Sicilian Defense" });

  fireEvent.change(view.getByRole("textbox", { name: "Search by opening name or ECO" }), { target: { value: "B00" } });
  assert.equal(view.queryByText("Sicilian Defense"), null);
  fireEvent.click(view.getByRole("button", { name: "B00 King's Pawn Game" }));
  assert.equal(view.getByRole("img", { name: "Final position" }).firstElementChild?.getAttribute("data-fen"), kingsPawn.fen);
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
  assert.equal(created.title, "King's Pawn Game — Black");
  assert.equal(created.orientation, "black");
  assert.equal(created.repertoireColor, null);
  assert.deepEqual(created.tree.children[0].children.map((node) => node.uci), ["e7e5"]);
  assert.equal(onClose.mock.callCount(), 1);
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
