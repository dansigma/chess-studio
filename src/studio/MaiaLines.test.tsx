import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test, type TestContext } from "node:test";
import { act, cleanup, render } from "@testing-library/react";
import { DEFAULT_POSITION } from "chess.js";
import type { MaiaResponse } from "@/src/engine/maia/protocol";
import { setupDom, teardownDom } from "../test-utils/dom.ts";

const { MaiaLines } = await import("./MaiaLines.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { importPgn } = await import("@/src/chess/pgn.ts");

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

let reply: ((data: MaiaResponse) => void) | undefined;
let postCount = 0;

function installMockWorker(t: TestContext) {
  postCount = 0;
  reply = undefined;

  class MockWorker {
    onmessage: ((event: { data: MaiaResponse }) => void) | undefined;
    onerror: (() => void) | undefined;
    constructor() {
      reply = (data) => this.onmessage?.({ data });
    }
    postMessage() {
      postCount++;
    }
    terminate() {}
  }

  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: MockWorker });
  t.after(() => {
    if (previousWorker) Object.defineProperty(globalThis, "Worker", previousWorker);
    else Reflect.deleteProperty(globalThis, "Worker");
  });
}

beforeEach(() => {
  const { title, tree, path, headers } = importPgn('[Event "MaiaLines test"]\n\n*');
  useStudioStore.setState({
    boards: [{
      id: "maia-lines-board",
      remoteId: null,
      title,
      tree,
      path,
      headers,
      orientation: "white",
      repertoireColor: null,
      dirty: false,
      preview: false,
    }],
    activeBoardId: "maia-lines-board",
    settings: { ...DEFAULT_SETTINGS, locale: "en", maiaEnabled: true, maiaElo: 2000, maiaChancesMode: "classical" },
    workspaceView: "studio",
    evalByFen: {},
    engineActive: false,
  });
});

const rawResult = {
  moves: [{ uci: "e2e4", prob: 0.45 }],
  chances: { white: 0.15, draw: 0.74, black: 0.11 },
};

test("MaiaLines uses combined chances at depth >= 14 when engine is active, and recombines without rerunning Maia", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  installMockWorker(t);

  const view = render(<MaiaLines onPlay={() => undefined} />);
  act(() => t.mock.timers.tick(150));
  assert.equal(postCount, 1);

  await act(async () => reply?.({ result: rawResult }));
  // Engine inactive and no eval: falls back to Maia-only classical calibration (3% / 95% / 2%).
  assert.ok(view.getByRole("img", { name: "Chances of this position in a classical game between two 2000 players: White 3%, draw 95%, Black 2%" }));

  // Depth < 14 with active engine still falls back.
  act(() => {
    useStudioStore.getState().setEngineActive(true);
    useStudioStore.getState().putEvalCache(DEFAULT_POSITION, { pawns: 0.3, label: "+0.30", depth: 13 });
  });
  assert.ok(view.getByRole("img", { name: "Chances of this position in a classical game between two 2000 players: White 3%, draw 95%, Black 2%" }));
  assert.equal(postCount, 1);

  // Depth >= 14 with active engine switches to combined model without rerunning Maia.
  act(() => {
    useStudioStore.getState().putEvalCache(DEFAULT_POSITION, { pawns: 0.3, label: "+0.30", depth: 14 });
  });
  assert.ok(view.getByRole("img", { name: "Chances of this position in a classical game between two 2000 players: White 11%, draw 82%, Black 7%" }));
  assert.equal(postCount, 1);

  // Pausing/stopping the engine falls back without rerunning Maia.
  act(() => {
    useStudioStore.getState().setEngineActive(false);
  });
  assert.ok(view.getByRole("img", { name: "Chances of this position in a classical game between two 2000 players: White 3%, draw 95%, Black 2%" }));
  assert.equal(postCount, 1);
});

test("MaiaLines keeps raw chances in online mode even with active deep Stockfish eval", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  installMockWorker(t);

  useStudioStore.setState((state) => ({
    settings: { ...state.settings, maiaChancesMode: "online" },
    engineActive: true,
  }));
  useStudioStore.getState().putEvalCache(DEFAULT_POSITION, { pawns: 2.5, label: "+2.50", depth: 20 });

  const view = render(<MaiaLines onPlay={() => undefined} />);
  act(() => t.mock.timers.tick(150));
  assert.equal(postCount, 1);

  await act(async () => reply?.({ result: rawResult }));
  assert.ok(view.getByRole("img", { name: "Chances of this position in an online game between two 2000 players: White 15%, draw 74%, Black 11%" }));
});
