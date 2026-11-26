import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { importPgn } from "@/src/chess/pgn";
import { emptyBoard } from "@/src/store/slices/board-helpers";
import { DEFAULT_SETTINGS, useStudioStore } from "@/src/store/studio-store";
import { BoardPanel } from "./BoardPanel";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => {
  cleanup();
  useStudioStore.setState(useStudioStore.getInitialState(), true);
});

const start = "Go to start of game";
const back = "Go to previous move";
const forward = "Go to next move";
const end = "Go to last move";

test("board controls navigate their own board and use the variation chooser", () => {
  const { tree } = importPgn("1. e4 e5 (1... c5) 2. Nf3 *");
  useStudioStore.setState({
    boards: [
      { ...emptyBoard("First", "first"), tree, path: [0, 0] },
      { ...emptyBoard("Second", "second"), tree },
    ],
    activeBoardId: "first",
    settings: { ...DEFAULT_SETTINGS, locale: "en", showMoveNavBar: true, showMaterialBalance: true },
  });
  render(
    <>
      <div data-testid="first"><BoardPanel boardId="first" /></div>
      <div data-testid="second"><BoardPanel boardId="second" /></div>
    </>,
  );
  const first = within(screen.getByTestId("first"));
  const second = within(screen.getByTestId("second"));
  const button = (name: string) => second.getByRole<HTMLButtonElement>("button", { name });

  assert.equal(first.getByRole<HTMLButtonElement>("button", { name: back }).disabled, false);
  assert.equal(button(start).disabled, true);
  assert.equal(button(back).disabled, true);
  fireEvent.click(button(forward));
  assert.equal(useStudioStore.getState().activeBoardId, "second");
  assert.deepEqual(useStudioStore.getState().boards.map((board) => board.path), [[0, 0], [0]]);

  fireEvent.click(button(forward));
  assert.ok(useStudioStore.getState().variationChoice);
  assert.deepEqual(useStudioStore.getState().active().path, [0]);

  fireEvent.click(button(end));
  assert.deepEqual(useStudioStore.getState().active().path, [0, 0, 0]);
  assert.equal(button(forward).disabled, true);
  assert.equal(button(end).disabled, true);
  fireEvent.click(button(back));
  assert.deepEqual(useStudioStore.getState().active().path, [0, 0]);
  fireEvent.click(button(start));
  assert.deepEqual(useStudioStore.getState().active().path, []);
});

test("desktop controls return after training and stay hidden on mobile", () => {
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "en", showMoveNavBar: true } });
  const { rerender } = render(<BoardPanel />);
  assert.ok(screen.getByRole("button", { name: start }));

  act(() => useStudioStore.setState({ training: true }));
  assert.equal(screen.queryByRole("button", { name: start }), null);
  act(() => useStudioStore.setState({ training: false }));
  assert.ok(screen.getByRole("button", { name: start }));

  rerender(<BoardPanel mobile />);
  assert.equal(screen.queryByRole("button", { name: start }), null);
});
