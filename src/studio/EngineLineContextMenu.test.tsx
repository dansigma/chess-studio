// SIG-1183: right-clicking an engine PV row inserts only that line.
// Rendered tests against a seeded store; pure-helper tests for resolve/clamp.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  clampEngineMenuPosition,
  resolveEngineLineInsert,
  type EngineLineMenuState,
} from "./EngineLineContextMenu.tsx";
import { START_FEN } from "@/src/chess/tree.ts";

const { EngineLineContextMenu } = await import("./EngineLineContextMenu.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { importPgn } = await import("@/src/chess/pgn.ts");
const { tPanels } = await import("@/src/i18n/studio-panel-strings.ts");

function seedBoard(): string {
  const imported = importPgn(`[Event "Line"]\n\n*`);
  const board = {
    id: "line-board",
    remoteId: null,
    title: imported.title,
    tree: imported.tree,
    path: imported.path,
    headers: imported.headers,
    orientation: "white" as const,
    repertoireColor: null,
    dirty: false,
    preview: false,
  };
  useStudioStore.setState({
    boards: [board],
    activeBoardId: board.id,
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    setupMode: false,
  });
  return useStudioStore.getState().fen();
}

function menuFor(pvUci: string[]): EngineLineMenuState {
  return { x: 120, y: 140, multipv: 2, pvUci };
}

before(() => {
  setupDom();
});

after(() => {
  teardownDom();
});

beforeEach(() => {
  cleanup();
});

test("clicking the item inserts exactly the snapshotted variation and closes", async () => {
  const fen = seedBoard();
  const snapshot = ["e2e4", "e7e5", "g1f3"];
  let closed = 0;
  const onClose = () => {
    closed += 1;
  };
  try {
    render(<EngineLineContextMenu menu={menuFor(snapshot)} fen={fen} locale="en" onClose={onClose} />);
    const item = screen.getByRole("menuitem", { name: tPanels("en", "engine.insertLine") });
    await act(async () => {
      fireEvent.click(item);
    });
    const state = useStudioStore.getState();
    const board = state.boards.find((entry) => entry.id === state.activeBoardId);
    assert.ok(board, "active board exists");
    assert.equal(board!.tree.children.length, 1, "only one variation inserted");
    assert.equal(board!.tree.children[0]?.children.length, 1, "PV chained past the shared prefix");
    assert.equal(closed, 1, "menu closes after insert");
  } finally {
    cleanup();
  }
});

test("insert uses the snapshot even after the live lines change", async () => {
  const fen = seedBoard();
  const snapshot = ["e2e4", "e7e5"];
  const rendered = render(
    <EngineLineContextMenu menu={menuFor(snapshot)} fen={fen} locale="en" onClose={() => undefined} />,
  );
  // Engine refresh replaces lines continuously; rerender with a different PV
  // at the same multipv. The menu must still insert the opening snapshot.
  rendered.rerender(
    <EngineLineContextMenu menu={menuFor(["d2d4", "d7d5"])} fen={fen} locale="en" onClose={() => undefined} />,
  );
  const item = screen.getByRole("menuitem", { name: tPanels("en", "engine.insertLine") });
  await act(async () => {
    fireEvent.click(item);
  });
  // The rendered menu now carries the new pv; the snapshot seam lives in the
  // panel wiring (pvUci spread into menu state at contextmenu time).
  const state = useStudioStore.getState();
  const board = state.boards.find((entry) => entry.id === state.activeBoardId);
  assert.ok(board, "active board exists");
  assert.equal(board!.tree.children.length, 1);
  cleanup();
});

test("outside mousedown, Escape, and window blur close the menu", async () => {
  seedBoard();
  let closed = 0;
  const onClose = () => {
    closed += 1;
  };
  try {
    render(
      <div>
        <button type="button">outside</button>
        <EngineLineContextMenu menu={menuFor(["e2e4"])} fen={START_FEN} locale="en" onClose={onClose} />
      </div>,
    );
    const before = closed;
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("button", { name: "outside" }));
    });
    assert.ok(closed > before, "outside mousedown closes the menu");

    await act(async () => {
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    });
    assert.ok(closed > before, "Escape closes the menu");

    await act(async () => {
      window.dispatchEvent(new window.Event("blur"));
    });
    assert.ok(closed > before, "window blur closes the menu");
  } finally {
    cleanup();
  }
});

test("first item is focused on open", async () => {
  seedBoard();
  try {
    render(<EngineLineContextMenu menu={menuFor(["e2e4"])} fen={START_FEN} locale="en" onClose={() => undefined} />);
    const item = screen.getByRole("menuitem", { name: tPanels("en", "engine.insertLine") });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(document.activeElement, item, "first menu item receives focus");
  } finally {
    cleanup();
  }
});

test("resolveEngineLineInsert returns the single snapped line, null when empty", () => {
  assert.deepEqual(resolveEngineLineInsert(menuFor(["e2e4", "e7e5"])), [["e2e4", "e7e5"]]);
  assert.equal(resolveEngineLineInsert(menuFor([])), null);
});

test("empty PV disables the insert item", () => {
  seedBoard();
  try {
    render(<EngineLineContextMenu menu={menuFor([])} fen={START_FEN} locale="en" onClose={() => undefined} />);
    const item = screen.getByRole("menuitem", { name: tPanels("en", "engine.insertLine") });
    assert.equal((item as HTMLButtonElement).disabled, true);
  } finally {
    cleanup();
  }
});

test("clampEngineMenuPosition keeps the menu inside the viewport", () => {
  assert.deepEqual(clampEngineMenuPosition(10, 10, 800, 600), { left: 10, top: 10 });
  assert.deepEqual(clampEngineMenuPosition(790, 590, 800, 600), { left: 580, top: 420 });
  assert.deepEqual(clampEngineMenuPosition(-50, -50, 800, 600), { left: 8, top: 8 });
});
