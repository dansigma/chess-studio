import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { MaiaResponse } from "@/src/engine/maia/protocol";
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
    retry: { active: false },
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

test("the E-shortcut toggle request starts and pauses a mounted panel (SIG-1459)", () => {
  const view = render(<EnginePanel />);
  assert.ok(view.getByRole("button", { name: "Start engine" }));
  act(() => useStudioStore.getState().requestEngineToggle());
  emitLine();
  assert.ok(view.getByRole("button", { name: "Pause engine" }));
  act(() => useStudioStore.getState().requestEngineToggle());
  assert.ok(view.getByRole("button", { name: "Start engine" }));
});

test("a toggle request made before the panel mounts is ignored (SIG-1459)", () => {
  act(() => useStudioStore.getState().requestEngineToggle());
  const view = render(<EnginePanel />);
  assert.ok(view.getByRole("button", { name: "Start engine" }));
  assert.ok(view.getByText(pausedHint));
});

test("Maia is lazy, renders human moves alongside Stockfish, and isolates failures", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let workerCount = 0;
  let terminated = 0;
  let posted: { fens: readonly string[]; elo: number } | undefined;
  let reply: ((data: MaiaResponse) => void) | undefined;
  let fail: (() => void) | undefined;

  class MockWorker {
    onmessage: ((event: { data: MaiaResponse }) => void) | undefined;
    onerror: (() => void) | undefined;
    constructor() {
      reply = (data) => this.onmessage?.({ data });
      fail = () => this.onerror?.();
      workerCount++;
    }
    postMessage(position: typeof posted) { posted = position; }
    terminate() { terminated++; }
  }

  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: MockWorker });
  t.after(() => {
    if (previousWorker) Object.defineProperty(globalThis, "Worker", previousWorker);
    else Reflect.deleteProperty(globalThis, "Worker");
  });

  const view = render(<EnginePanel />);
  fireEvent.click(view.getByRole("button", { name: "Start engine" }));
  emitLine();
  fireEvent.click(view.getByRole("button", { name: "Engine settings" }));
  const toggle = view.getByRole("switch", { name: "Human moves (Maia)" });
  assert.ok(toggle instanceof window.HTMLInputElement);
  act(() => t.mock.timers.tick(150));
  assert.equal(toggle.checked, false);
  assert.equal(workerCount, 0);
  assert.equal(view.queryByText("Maia 3 · 1500"), null);

  fireEvent.click(toggle);
  assert.ok(view.getByText("Loading Maia…"));
  act(() => t.mock.timers.tick(150));
  assert.equal(workerCount, 1);
  assert.deepEqual(posted, { fens: [currentFen], elo: 1500 });
  await act(async () => reply?.({
    result: { moves: [{ uci: "d2d4", prob: 0.38, wdl: [0.42, 0.31, 0.27] }] },
  }));
  assert.ok(view.getByRole("button", { name: "d4 · 38% W 42 · D 31 · L 27" }));
  assert.match(view.container.querySelector(pv)?.textContent ?? "", /e4/u);

  fireEvent.change(view.getByRole("combobox", { name: "Player rating" }), { target: { value: "1600" } });
  assert.equal(view.queryByText("d4 · 38%"), null);
  act(() => t.mock.timers.tick(150));
  assert.equal(posted?.elo, 1600);
  await act(async () => fail?.());
  assert.ok(view.getByText("Maia could not analyze this position."));
  assert.match(view.container.querySelector(pv)?.textContent ?? "", /e4/u);

  act(() => useStudioStore.setState({ workspaceView: "library" }));
  assert.equal(view.queryByText("Maia 3 · 1600"), null);
  act(() => useStudioStore.setState({ workspaceView: "studio" }));
  act(() => t.mock.timers.tick(150));
  assert.equal(workerCount, 2);
  act(() => {
    const started = useStudioStore.getState().startRetry({
      index: 0,
      parentPath: [],
      momentPath: [0],
      exercise: {
        key: "maia-retry", fen: currentFen, solutionUci: ["e2e4"], bestPv: ["e2e4"],
        playedUci: "d2d4", label: "mistake", phase: "opening", motif: "positional",
        lossCp: 100, beforePawns: 0, afterPawns: -1, createdAt: new Date().toISOString(),
      },
    });
    assert.equal(started, true);
  });
  assert.equal(terminated, 2);
  assert.equal(view.queryByText("Maia 3 · 1600"), null);
  assert.ok(view.getByText("Engine paused during the retry"));
  act(() => t.mock.timers.tick(150));
  assert.equal(workerCount, 2);
});
