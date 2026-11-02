// SIG-1183: EnginePanel right-click opens the line menu with a PV snapshot,
// so a later engine refresh cannot swap the variation being inserted.
import assert from "node:assert/strict";
import { after, before, beforeEach, test, mock } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { EngineInfo } from "@/src/engine/stockfish-client";

type Listener = (info: EngineInfo) => void;

const listeners = new Set<Listener>();
let currentFen = "";

mock.module("@/src/engine/shared-engine", {
  namedExports: {
    acquire: () => ({
      analyze: (fen: string) => {
        currentFen = fen;
      },
      subscribe: (listener: Listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      release: () => undefined,
    }),
  },
});

function emitLines(pvs: string[][]): void {
  const sans: Record<string, string> = {
    e2e4: "e4",
    e7e5: "e5",
    g1f3: "Nf3",
    d2d4: "d4",
    d7d5: "d5",
  };
  const info: EngineInfo = {
    depth: 20,
    running: true,
    ready: true,
    failed: false,
    lines: pvs.map((pvUci, index) => ({
      multipv: index + 1,
      depth: 20,
      scoreCp: 30 - index * 10,
      mate: null,
      pvUci,
      pvSan: pvUci.map((uci) => sans[uci] ?? "e4"),
      bound: null,
    })),
    nps: 1000,
    nodes: 1000,
    threaded: false,
    fen: currentFen,
  };
  for (const listener of [...listeners]) {
    listener(info);
  }
}

const { EnginePanel } = await import("./EnginePanel.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { importPgn } = await import("@/src/chess/pgn.ts");
const { tPanels } = await import("@/src/i18n/studio-panel-strings.ts");

function seedBoard(): void {
  const imported = importPgn(`[Event "Panel"]\n\n*`);
  useStudioStore.setState({
    boards: [
      {
        id: "panel-board",
        remoteId: null,
        title: imported.title,
        tree: imported.tree,
        path: imported.path,
        headers: imported.headers,
        orientation: "white" as const,
        repertoireColor: null,
        dirty: false,
        preview: false,
      },
    ],
    activeBoardId: "panel-board",
    settings: { ...DEFAULT_SETTINGS, locale: "en", multiPv: 2 },
    setupMode: false,
  });
}

before(() => {
  setupDom();
  (globalThis as Record<string, unknown>).ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

after(() => {
  teardownDom();
});

beforeEach(() => {
  listeners.clear();
  currentFen = "";
  act(() => {
    useStudioStore.getState().setLocale("en");
  });
  cleanup();
});

test("right-click context menu inserts the snapshotted PV, not the refreshed one", async () => {
  seedBoard();
  try {
    render(<EnginePanel />);
    // Start the engine so it subscribes and records the analyzed FEN.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: tPanels("en", "engine.start") }));
    });
    await act(async () => {
      emitLines([["e2e4", "e7e5", "g1f3"]]);
    });
    assert.ok(listeners.size > 0, "engine subscribed");
    assert.ok(currentFen, "engine analyzed the active FEN");

    // The leading throttle call renders synchronously; the PV tokens prove
    // the snapshot arrived. Then flush the trailing window deterministically.
    assert.ok(screen.queryByRole("button", { name: /Nf3/ }), "PV tokens rendered");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    const target = screen.getByRole("button", { name: /Nf3/ }).closest("div");
    assert.ok(target, "variation row rendered");

    await act(async () => {
      fireEvent.contextMenu(target!, { clientX: 120, clientY: 140, bubbles: true });
    });
    const item = screen.getByRole("menuitem", { name: tPanels("en", "engine.insertLine") });
    assert.ok(item, "insert item rendered");

    // Engine refresh replaces the line at the same multipv before the click.
    await act(async () => {
      emitLines([["d2d4", "d7d5"]]);
    });

    await act(async () => {
      fireEvent.click(item);
    });

    const state = useStudioStore.getState();
    const board = state.boards.find((entry) => entry.id === state.activeBoardId);
    assert.ok(board, "active board exists");
    assert.equal(board!.tree.children.length, 1, "exactly one variation inserted");
    assert.equal(board!.tree.children[0]?.uci, "e2e4", "inserted the right-clicked PV");
  } finally {
    cleanup();
  }
});
