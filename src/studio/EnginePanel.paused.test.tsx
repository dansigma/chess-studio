import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { EngineInfo } from "@/src/engine/stockfish-client";
import { setupDom, teardownDom } from "../test-utils/dom.ts";

let listener: ((snapshot: EngineInfo) => void) | undefined;
let currentFen = "";

mock.module("@/src/engine/shared-engine", {
  namedExports: {
    acquire: () => ({
      analyze: (fen: string) => { currentFen = fen; },
      stop: () => undefined,
      subscribe: (next: typeof listener) => {
        listener = next;
        return () => { listener = undefined; };
      },
      release: () => undefined,
    }),
  },
});

const { EnginePanel } = await import("./EnginePanel.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { importPgn } = await import("@/src/chess/pgn.ts");

const pausedHint = "Press play to see the engine lines";
const placeholder = "[data-engine-placeholder]";
const pv = "[data-engine-pv]";

function emitLine(): void {
  const emit = listener;
  assert.ok(emit, "engine subscribed");
  assert.ok(currentFen, "engine analyzed the position");
  act(() => emit({
    fen: currentFen, depth: 20, running: true, ready: true, failed: false,
    nps: 1000, nodes: 1000, threaded: false,
    lines: [{
      multipv: 1, depth: 20, scoreCp: 30, mate: null, bound: null,
      pvUci: ["e2e4"], pvSan: ["e4"],
    }],
  }));
}

before(() => setupDom());
beforeEach(() => {
  currentFen = "";
  const { title, tree, path, headers } = importPgn('[Event "Paused engine"]\n\n*');
  useStudioStore.setState({
    boards: [{
      id: "paused-engine", remoteId: null, title, tree, path, headers,
      orientation: "white", repertoireColor: null, dirty: false, preview: false,
    }],
    activeBoardId: "paused-engine",
    settings: { ...DEFAULT_SETTINGS, locale: "en", multiPv: 2, engineSparkline: false },
    workspaceView: "studio",
    setupMode: false,
  });
});
afterEach(() => cleanup());
after(() => teardownDom());

test("shows one paused hint and no placeholder rows before starting", () => {
  const view = render(<EnginePanel />);
  assert.ok(view.getByText(pausedHint));
  assert.equal(view.container.querySelectorAll(placeholder).length, 0);
});

test("keeps the computed line and removes the placeholder when paused", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const view = render(<EnginePanel />);
  fireEvent.click(view.getByRole("button", { name: "Start engine" }));
  emitLine();
  fireEvent.click(view.getByRole("button", { name: "Pause engine" }));
  const emit = listener;
  assert.ok(emit, "engine stays subscribed");
  act(() => {
    // A shared-engine snapshot for another position leaves the kept line in use.
    emit({
      fen: "another-position", depth: 0, running: false, ready: true, failed: false,
      nps: 0, nodes: 0, threaded: false, lines: [],
    });
    t.mock.timers.tick(150);
  });
  assert.match(view.container.querySelector(pv)?.textContent ?? "", /e4/u);
  assert.equal(view.container.querySelectorAll(placeholder).length, 0);
  assert.equal(view.queryByText(pausedHint), null);
});

test("shows placeholders while loading and for missing lines while running", () => {
  const view = render(<EnginePanel />);
  fireEvent.click(view.getByRole("button", { name: "Start engine" }));
  assert.equal(view.container.querySelectorAll(placeholder).length, 2);
  emitLine();
  assert.equal(view.container.querySelectorAll(pv).length, 1);
  assert.equal(view.container.querySelectorAll(placeholder).length, 1);
  assert.equal(view.queryByText(pausedHint), null);
});
