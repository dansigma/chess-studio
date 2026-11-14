import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LibraryPreview } from "./LibraryPreview";
import { useLibraryStore } from "./library-store";
import { clearLibrarySources, registerLibrarySource } from "@/src/lib/library/sources";
import type { LibraryGameItem, LibrarySourceAdapter } from "@/src/lib/library/types";
import { useStudioStore } from "@/src/store/studio-store";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => {
  cleanup();
  clearLibrarySources();
});

const ITEM: LibraryGameItem = {
  key: "masters:g1", sourceId: "masters", gameId: "g1",
  white: "Carlsen", whiteElo: 2850, black: "Caruana", blackElo: 2800,
  result: "1-0", eco: "C65", opening: "Berlin Defence", plyCount: null, event: null, date: "2020",
};
const ITEM2: LibraryGameItem = { ...ITEM, key: "masters:g2", gameId: "g2", white: "Nakamura" };
const PGN = '[Event "Candidates"]\n[Date "2020.03.01"]\n\n1. e4 e5 2. Nf3 {develops} Nc6 3. Bb5 a6 1-0';

function adapter(loadPgn: LibrarySourceAdapter["loadPgn"]): LibrarySourceAdapter {
  return {
    id: "masters", label: () => "Masters",
    capabilities: () => { throw new Error("unused"); },
    list: async () => ({ items: [], nextCursor: null, total: 0 }),
    loadPgn,
  };
}
const current = () => document.querySelector('[aria-current="step"]')?.textContent ?? "";

beforeEach(() => {
  useLibraryStore.setState({ selectedKey: null, filters: { ...useLibraryStore.getState().filters, position: null } });
  useStudioStore.setState({ workspaceView: "library", settings: { ...DEFAULT_SETTINGS, locale: "en" } });
});

test("no game selected shows the select message", () => {
  render(<LibraryPreview item={null} />);
  assert.ok(screen.getByText("Select a game"));
});

test("loads the PGN, shows header from the PGN for Masters, and navigates moves", async () => {
  registerLibrarySource(adapter(async () => PGN));
  render(<LibraryPreview item={ITEM} />);
  await screen.findByTestId("library-preview");
  assert.ok(screen.getByText("Candidates"));
  assert.ok(screen.getByText("3 moves"));
  assert.ok(screen.getByText(/C65/));
  assert.ok(screen.getByText("2850"));
  assert.equal(current(), "");
  fireEvent.click(screen.getByLabelText("Next move"));
  assert.equal(current(), "e4");
  fireEvent.keyDown(screen.getByTestId("library-preview"), { key: "ArrowRight" });
  assert.equal(current(), "e5");
  fireEvent.keyDown(screen.getByTestId("library-preview"), { key: "ArrowLeft" });
  assert.equal(current(), "e4");
  fireEvent.click(screen.getByLabelText("Last move"));
  assert.equal(current(), "a6");
  fireEvent.click(screen.getByLabelText("First move"));
  assert.equal(current(), "");
  fireEvent.click(screen.getByRole("button", { name: "Nf3" }));
  assert.equal(current(), "Nf3");
  assert.ok(screen.getByText("develops"));
});

test("opens on the ply matching the position filter", async () => {
  const afterNf3 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
  useLibraryStore.setState({ filters: { ...useLibraryStore.getState().filters, position: { fen: afterNf3 } } });
  registerLibrarySource(adapter(async () => PGN));
  render(<LibraryPreview item={ITEM} />);
  await screen.findByTestId("library-preview");
  assert.equal(current(), "Nf3");
});

test("error offers Try again and reloads", async () => {
  let calls = 0;
  registerLibrarySource(adapter(async () => {
    calls += 1;
    if (calls === 1) throw new Error("boom");
    return PGN;
  }));
  render(<LibraryPreview item={ITEM} />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("Try again"));
  await screen.findByTestId("library-preview");
  assert.equal(calls, 2);
});

test("a new selection aborts the previous load and ignores its late result", async () => {
  const signals: AbortSignal[] = [];
  const resolvers: Record<string, (pgn: string) => void> = {};
  registerLibrarySource(adapter((id, signal) => {
    signals.push(signal);
    return new Promise<string>((resolve) => { resolvers[id] = resolve; });
  }));
  const { rerender } = render(<LibraryPreview item={ITEM} />);
  assert.ok(screen.getByRole("status"));
  rerender(<LibraryPreview item={ITEM2} />);
  assert.equal(signals[0]!.aborted, true);
  assert.equal(signals[1]!.aborted, false);
  await act(async () => { resolvers.g1!(PGN); });
  assert.ok(screen.getByRole("status"));
  await act(async () => { resolvers.g2!(PGN); });
  await waitFor(() => assert.ok(screen.getByTestId("library-preview")));
  assert.ok(screen.getByText("Nakamura"));
});

test("Open in Studio opens a new board and switches the workspace view", async () => {
  registerLibrarySource(adapter(async () => PGN));
  const before = useStudioStore.getState().boards.length;
  render(<LibraryPreview item={ITEM} />);
  await screen.findByTestId("library-preview");
  fireEvent.click(screen.getByText("Open in Studio"));
  const state = useStudioStore.getState();
  assert.equal(state.workspaceView, "studio");
  assert.equal(state.boards.length, before + 1);
  assert.equal(state.boards.at(-1)!.preview, false);
});

test("Train line is disabled with no moves and at the last move", async () => {
  registerLibrarySource(adapter(async () => '[Event "x"]\n\n*'));
  render(<LibraryPreview item={ITEM} />);
  await screen.findByTestId("library-preview");
  const button = screen.getByRole("button", { name: "Train line" }) as HTMLButtonElement;
  assert.equal(button.disabled, true);
  assert.ok(button.title.length > 0);
  cleanup();
  registerLibrarySource(adapter(async () => PGN));
  render(<LibraryPreview item={ITEM2} />);
  await screen.findByTestId("library-preview");
  const enabled = screen.getByRole("button", { name: "Train line" }) as HTMLButtonElement;
  assert.equal(enabled.disabled, false);
  fireEvent.click(screen.getByLabelText("Last move"));
  assert.equal(enabled.disabled, true);
  assert.ok(enabled.title.length > 0);
});

test("Train line opens the game at the preview position and starts training from it", async () => {
  registerLibrarySource(adapter(async () => PGN));
  useStudioStore.setState({ training: false, trainingStart: null });
  const before = useStudioStore.getState().boards.length;
  render(<LibraryPreview item={ITEM} />);
  await screen.findByTestId("library-preview");
  fireEvent.click(screen.getByRole("button", { name: "Nf3" }));
  fireEvent.click(screen.getByRole("button", { name: "Train line" }));
  const state = useStudioStore.getState();
  assert.equal(state.workspaceView, "studio");
  assert.equal(state.boards.length, before + 1);
  const board = state.boards.at(-1)!;
  assert.equal(state.activeBoardId, board.id);
  assert.equal(board.path.length, 3);
  assert.equal(state.training, true);
  assert.deepEqual(state.trainingStart, board.path);
});

test("a list reload with a new object for the same game does not load the PGN again", async () => {
  let calls = 0;
  registerLibrarySource(adapter(async () => {
    calls += 1;
    return PGN;
  }));
  const { rerender } = render(<LibraryPreview item={ITEM} />);
  await screen.findByTestId("library-preview");
  rerender(<LibraryPreview item={{ ...ITEM }} />);
  await screen.findByTestId("library-preview");
  assert.equal(calls, 1);
});
