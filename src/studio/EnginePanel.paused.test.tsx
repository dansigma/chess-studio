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
  let posted: { fens: readonly string[]; elo: number; lines: number } | undefined;
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

  const result = {
    moves: [{ uci: "d2d4", prob: 0.38 }],
    chances: { white: 0.15, draw: 0.74, black: 0.11 },
  };
  const view = render(<EnginePanel />);
  fireEvent.click(view.getByRole("button", { name: "Start engine" }));
  emitLine();
  fireEvent.click(view.getByRole("button", { name: "Engine settings" }));
  const toggle = view.getByRole("switch", { name: "Human moves (Maia)" });
  assert.ok(toggle instanceof window.HTMLInputElement);
  act(() => t.mock.timers.tick(150));
  assert.equal(toggle.checked, false);
  assert.equal(workerCount, 0);
  assert.equal(view.queryByText("human moves"), null);

  fireEvent.click(toggle);
  assert.ok(view.getByText("Loading Maia…"));
  act(() => t.mock.timers.tick(150));
  assert.equal(workerCount, 1);
  assert.deepEqual(posted, { fens: [currentFen], elo: 2500, lines: 3 });
  await act(async () => reply?.({ result }));
  // Stockfish is active at depth 20 (+0.30), so classical mode uses the combined model.
  assert.ok(view.getByRole("img", { name: "Chances of this position in a classical game between two 2000 players: White 11%, draw 82%, Black 7%" }));

  // Pausing Stockfish falls back to Maia-only classical calibration without rerunning Maia.
  fireEvent.click(view.getByRole("button", { name: "Pause engine" }));
  assert.ok(view.getByRole("img", { name: "Chances of this position in a classical game between two 2000 players: White 3%, draw 95%, Black 2%" }));
  fireEvent.click(view.getByRole("button", { name: "Start engine" }));
  assert.ok(view.getByRole("img", { name: "Chances of this position in a classical game between two 2000 players: White 11%, draw 82%, Black 7%" }));
  assert.equal(workerCount, 1);

  fireEvent.change(view.getByRole("combobox", { name: "Maia chances" }), { target: { value: "online" } });
  assert.equal(view.queryByRole("img"), null);
  act(() => t.mock.timers.tick(150));
  assert.deepEqual(posted, { fens: [currentFen], elo: 2000, lines: 3 });
  await act(async () => reply?.({ result }));
  assert.ok(view.getByRole("button", { name: "38% d4" }));
  assert.ok(view.getByRole("img", { name: "Chances of this position in an online game between two 2000 players: White 15%, draw 74%, Black 11%" }));
  assert.ok(view.getByText("74%"));
  assert.equal(view.queryByText(/W \d+ · D/u), null);
  assert.match(view.container.querySelector(pv)?.textContent ?? "", /e4/u);

  assert.ok(view.getByRole("option", { name: "2600+" }));
  fireEvent.change(view.getByRole("combobox", { name: "Player rating" }), { target: { value: "2600" } });
  act(() => t.mock.timers.tick(150));
  assert.equal(posted?.elo, 2600);
  await act(async () => reply?.({ result }));
  assert.ok(view.getByTitle("38% of 2600+ players play d4"));
  assert.ok(view.getByTitle("Chances of this position in an online game between two 2600+ players"));

  fireEvent.change(view.getByRole("combobox", { name: "Player rating" }), { target: { value: "2200" } });
  assert.equal(view.queryByRole("button", { name: "38% d4" }), null);
  act(() => t.mock.timers.tick(150));
  assert.equal(posted?.elo, 2200);
  await act(async () => fail?.());
  assert.ok(view.getByText("Maia could not analyze this position."));
  assert.match(view.container.querySelector(pv)?.textContent ?? "", /e4/u);

  act(() => useStudioStore.setState({ workspaceView: "library" }));
  assert.equal(view.queryByText("human moves"), null);
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
  assert.equal(view.queryByText("human moves"), null);
  assert.ok(view.getByText("Engine paused during the retry"));
  act(() => t.mock.timers.tick(150));
  assert.equal(workerCount, 2);
});
