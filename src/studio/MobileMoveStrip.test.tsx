import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { importPgn } from "@/src/chess/pgn.ts";
import type { Path } from "@/src/chess/tree.ts";
import type { MoveNotation } from "@/src/chess/move-notation.ts";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings.ts";
import { MobileMoveStrip } from "./MobileMoveStrip.tsx";
import { useStudioStore } from "@/src/store/studio-store.ts";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings.ts";

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

function seedBoard(pgn: string, path: Path, moveNotation: MoveNotation = "english") {
  const parsed = importPgn(pgn);
  act(() => {
    const current = useStudioStore.getState();
    const active = current.boards.find((b) => b.id === current.activeBoardId) ?? current.boards[0];
    assert.ok(active, "expected an active board in studio store");
    useStudioStore.setState({
      boards: current.boards.map((board) =>
        board.id === active.id ? { ...board, tree: parsed.tree, path } : board,
      ),
      settings: {
        ...DEFAULT_SETTINGS,
        locale: "en",
        moveNotation,
      },
    });
  });
}

test("Next button stays enabled inside a variation with children and surfaces variation moves", () => {
  seedBoard("1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *", [0, 1]);
  render(<MobileMoveStrip />);

  assert.ok(screen.getByRole("button", { name: "c5" }));
  assert.equal(screen.queryByRole("button", { name: "e5" }), null);

  const nextButton = screen.getByRole("button", {
    name: tStudioChrome("en", "chrome.moves.next"),
  }) as HTMLButtonElement;
  assert.equal(nextButton.disabled, false);

  fireEvent.click(nextButton);
  const state = useStudioStore.getState();
  const activeBoard = state.boards.find((b) => b.id === state.activeBoardId);
  assert.deepEqual(activeBoard?.path, [0, 1, 0]);
  assert.equal(nextButton.disabled, true);
});

test("formats SAN moves using figurine (unicode) and Portuguese notation settings", () => {
  seedBoard("1. e4 e5 2. Nf3 Nc6 *", [0], "unicode");
  render(<MobileMoveStrip />);
  assert.ok(screen.getByRole("button", { name: "♘f3" }));
  assert.ok(screen.getByRole("button", { name: "♞c6" }));

  act(() => {
    useStudioStore.setState((state) => ({
      settings: { ...state.settings, moveNotation: "portuguese" },
    }));
  });
  assert.ok(screen.getByRole("button", { name: "Cf3" }));
  assert.ok(screen.getByRole("button", { name: "Cc6" }));
});

test("calls scrollIntoView on the active move button when board.path changes", () => {
  const calls: Array<{ text: string | null; arg: unknown }> = [];
  const original = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, arg?: unknown) {
    calls.push({ text: this.textContent, arg });
  };

  try {
    seedBoard("1. e4 e5 2. Nf3 Nc6 *", [0]);
    render(<MobileMoveStrip />);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.text, "e4");
    assert.deepEqual(calls[0]?.arg, {
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });

    act(() => {
      useStudioStore.getState().goPath([0, 0]);
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.text, "e5");
    assert.deepEqual(calls[1]?.arg, {
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  } finally {
    HTMLElement.prototype.scrollIntoView = original;
  }
});
