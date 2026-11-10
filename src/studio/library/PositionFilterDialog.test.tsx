import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PositionFilterDialog } from "./PositionFilterDialog";
import { searchPositionInLibrary } from "./search-position";
import { useLibraryStore } from "./library-store";
import { useStudioStore } from "@/src/store/studio-store";
import { DEFAULT_LIBRARY_FILTERS } from "@/src/lib/library/types";
import { positionProblem } from "@/src/chess/setup-fen";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const KK = "8/8/8/8/8/8/8/K6k w - - 0 1";
let closed = 0;

beforeEach(() => {
  closed = 0;
  useStudioStore.setState((s) => ({ settings: { ...s.settings, locale: "en" }, workspaceView: "studio" }));
  useLibraryStore.setState({ filters: DEFAULT_LIBRARY_FILTERS });
  render(<PositionFilterDialog onClose={() => (closed += 1)} />);
});

const fenInput = () => screen.getByLabelText("Paste a FEN") as HTMLInputElement;
const apply = () => screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
const type = (fen: string) => {
  fireEvent.change(fenInput(), { target: { value: fen } });
  fireEvent.keyDown(fenInput(), { key: "Enter" });
};

test("starts on the initial position and Apply writes the filter and closes", () => {
  assert.ok(fenInput().value === START, "FEN field shows the start position");
  assert.equal(apply().disabled, false);
  fireEvent.click(apply());
  assert.equal(useLibraryStore.getState().filters.position?.fen, START);
  assert.equal(closed, 1);
});

test("Cancel leaves the filter unchanged", () => {
  type(KK);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  assert.equal(useLibraryStore.getState().filters.position, null);
  assert.equal(closed, 1);
});

test("FEN field round trip: typed FEN is normalized and applied", () => {
  type(KK);
  assert.ok(fenInput().value === KK, "normalized FEN stays in the field");
  fireEvent.click(apply());
  assert.equal(useLibraryStore.getState().filters.position?.fen, KK);
});

test("side to move toggle updates the FEN field", () => {
  fireEvent.click(screen.getByRole("button", { name: "White to play" }));
  assert.ok(fenInput().value.split(" ")[1] === "b");
});

test("castling checkbox updates rights; unavailable rights are disabled", () => {
  const wk = screen.getByLabelText("White O-O") as HTMLInputElement;
  assert.equal(wk.checked, true);
  fireEvent.click(wk);
  assert.ok(fenInput().value.split(" ")[2] === "Qkq");
  type(KK);
  assert.equal((screen.getByLabelText("White O-O") as HTMLInputElement).disabled, true);
});

test("en passant selector offers plausible squares only and round-trips", () => {
  type("4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1");
  const select = screen.getByLabelText("En passant") as HTMLSelectElement;
  fireEvent.change(select, { target: { value: "d6" } });
  assert.ok(fenInput().value.split(" ")[3] === "d6");
  assert.equal(select.options.length, 2);
  fireEvent.click(apply());
  assert.equal(useLibraryStore.getState().filters.position?.fen, "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
});

test("shortcuts: empty board is invalid and explains why; start position recovers", () => {
  fireEvent.click(screen.getByRole("button", { name: "Empty board" }));
  assert.equal(apply().disabled, true);
  assert.ok(screen.getByRole("alert").textContent?.includes("exactly one king"));
  fireEvent.click(screen.getByRole("button", { name: "Starting position" }));
  assert.equal(apply().disabled, false);
  assert.equal(screen.queryByRole("alert"), null);
});

test("shortcut uses the active Studio board position", () => {
  type(KK);
  fireEvent.click(screen.getByRole("button", { name: "Use active board position" }));
  assert.ok(fenInput().value.startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w"));
});

test("validation: side not to move in check disables Apply with a reason", () => {
  type("4k3/8/8/8/8/8/4R3/4K3 w - - 0 1");
  assert.equal(apply().disabled, true);
  assert.ok(screen.getByRole("alert").textContent?.includes("not to move is in check"));
});

test("positionProblem messages", () => {
  assert.equal(positionProblem(START), null);
  assert.equal(positionProblem("8/8/8/8/8/8/8/K7 w - - 0 1")?.code, "kings");
  assert.equal(positionProblem("P3k3/8/8/8/8/8/8/4K3 w - - 0 1")?.code, "pawnRank");
  assert.equal(positionProblem("4k3/8/8/8/8/8/4R3/4K3 w - - 0 1")?.code, "opponentInCheck");
});

test("searchPositionInLibrary sets the filter and switches the view", () => {
  searchPositionInLibrary(KK);
  assert.equal(useLibraryStore.getState().filters.position?.fen, KK);
  assert.equal(useStudioStore.getState().workspaceView, "library");
});
