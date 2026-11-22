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
const calls: string[] = [];

mock.module("@/src/engine/shared-engine", {
  namedExports: {
    acquire: () => ({
      analyze: (fen: string) => {
        currentFen = fen;
        calls.push("analyze");
      },
      stop: () => {
        calls.push("stop");
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

function emitSnapshot(overrides: Partial<EngineInfo> = {}): void {
  const info: EngineInfo = {
    depth: 20,
    running: true,
    ready: true,
    failed: false,
    lines: [],
    nps: 1000,
    nodes: 1000,
    threaded: false,
    fen: currentFen,
    ...overrides,
  };
  for (const listener of [...listeners]) {
    listener(info);
  }
}

function emitLines(pvs: string[][], bestScoreCp = 30): void {
  const sans: Record<string, string> = {
    e2e4: "e4",
    e7e5: "e5",
    g1f3: "Nf3",
    d2d4: "d4",
    d7d5: "d5",
  };
  emitSnapshot({
    lines: pvs.map((pvUci, index) => ({
      multipv: index + 1,
      depth: 20,
      scoreCp: bestScoreCp - index * 10,
      mate: null,
      pvUci,
      pvSan: pvUci.map((uci) => sans[uci] ?? "e4"),
      bound: null,
    })),
  });
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

test("right-click context menu inserts the snapshotted PV and evaluation", async () => {
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
      emitLines([["d2d4", "d7d5"]], -5);
    });

    await act(async () => {
      fireEvent.click(item);
    });

    const state = useStudioStore.getState();
    const board = state.boards.find((entry) => entry.id === state.activeBoardId);
    assert.ok(board, "active board exists");
    assert.equal(board!.tree.children.length, 1, "exactly one variation inserted");
    assert.equal(board!.tree.children[0]?.uci, "e2e4", "inserted the right-clicked PV");
    assert.equal(board!.tree.children[0]?.children[0]?.children[0]?.comment, "+0.30");
  } finally {
    cleanup();
  }
});

// SIG-1195: one 32px control row — the status sits in the row, depth/lines/
// cores live in the gear popover, and only the best line gets a solid chip.
test("single control row: status in the row, settings popover, outlined secondary chips", async () => {
  seedBoard();
  try {
    render(<EnginePanel />);
    assert.ok(screen.getByText(tPanels("en", "engine.status.paused")), "paused status shows in the row");
    assert.equal(screen.queryByRole("button", { name: tPanels("en", "engine.depth.increase") }), null);

    fireEvent.click(screen.getByRole("button", { name: tPanels("en", "engine.settings") }));
    const dialog = screen.getByRole("dialog", { name: tPanels("en", "engine.settings") });
    assert.ok(dialog.querySelector(`[aria-label="${tPanels("en", "engine.depth.increase")}"]`), "depth stepper in popover");
    assert.ok(dialog.querySelector(`[aria-label="${tPanels("en", "engine.lines.increase")}"]`), "lines stepper in popover");
    assert.ok(dialog.querySelector('input[type="range"]'), "cores slider in popover");
    fireEvent.keyDown(dialog, { key: "Escape" });
    assert.equal(screen.queryByRole("dialog"), null);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: tPanels("en", "engine.start") }));
    });
    await act(async () => {
      emitLines([["e2e4", "e7e5"], ["d2d4", "d7d5"]]);
    });
    const chips = screen.getAllByRole("button", { expanded: false }).filter((button) => /^[+-]?\d/u.test(button.textContent ?? ""));
    assert.equal(chips.length, 2, "one score chip per line");
    assert.match(chips[0]!.className, /bg-studio-win|bg-studio-loss/u);
    assert.doesNotMatch(chips[1]!.className, /bg-studio-win|bg-studio-loss/u);

    fireEvent.contextMenu(screen.getByRole("button", { name: /d5/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: tPanels("en", "engine.insertLine") }));
    assert.equal(useStudioStore.getState().active().tree.children[0]?.children[0]?.comment, "+0.20");

    fireEvent.click(screen.getByRole("button", { name: tPanels("en", "engine.insertLines") }));
    assert.deepEqual(
      useStudioStore.getState().active().tree.children.map((node) => node.children[0]?.comment),
      ["+0.20", "+0.30"],
    );
  } finally {
    cleanup();
  }
});

test("SIG-1293: leaving the studio view stops the search; returning resumes it", async () => {
  seedBoard();
  useStudioStore.setState({ workspaceView: "studio" });
  try {
    render(<EnginePanel />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: tPanels("en", "engine.start") }));
    });
    assert.equal(calls.at(-1), "analyze");
    calls.length = 0;
    await act(async () => {
      useStudioStore.setState({ workspaceView: "library" });
    });
    assert.deepEqual(calls, ["stop"]);
    calls.length = 0;
    await act(async () => {
      useStudioStore.setState({ workspaceView: "studio" });
    });
    assert.deepEqual(calls, ["analyze"]);
    assert.ok(currentFen, "resumed on the active FEN");
  } finally {
    useStudioStore.setState({ workspaceView: "studio" });
  }
});

test("SIG-1399: EnginePanel pulses only while loading or running", async () => {
  seedBoard();
  useStudioStore.setState({ workspaceView: "studio" });
  try {
    const { container } = render(<EnginePanel />);
    assert.equal(container.querySelectorAll(".animate-pulse").length, 0, "no animate-pulse on mount when idle");
    assert.ok(screen.getByText(tPanels("en", "engine.status.paused")), "paused status text kept");

    // Picking an engine build while idle sets paused=false without started=true; must stay calm.
    fireEvent.click(screen.getByRole("button", { name: /Stockfish/ }));
    const radios = screen.getAllByRole("menuitemradio");
    fireEvent.click(radios[0]!);
    assert.equal(container.querySelectorAll(".animate-pulse").length, 0, "no animate-pulse after picking build while not started");

    // Start engine: while not ready yet, skeleton lines pulse.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: tPanels("en", "engine.start") }));
    });
    assert.ok(container.querySelectorAll(".animate-pulse").length > 0, "animate-pulse present after Start while loading");

    // Emit 1 line while running (multiPv=2 => 1 placeholder line remains pulsing).
    await act(async () => {
      emitLines([["e2e4", "e7e5"]]);
    });
    assert.ok(container.querySelectorAll(".animate-pulse").length > 0, "animate-pulse present while running");

    // When engine fails, animation stops.
    await act(async () => {
      emitSnapshot({ ready: false, running: false, failed: true, lines: [] });
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    assert.equal(container.querySelectorAll(".animate-pulse").length, 0, "no animate-pulse when failed");
  } finally {
    cleanup();
  }
});
