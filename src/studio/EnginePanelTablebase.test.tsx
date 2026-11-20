import assert from "node:assert/strict";
import { after, afterEach, before, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { EngineInfo } from "@/src/engine/stockfish-client";

let listener: ((snapshot: EngineInfo) => void) | undefined;
mock.module("@/src/engine/shared-engine", {
  namedExports: {
    acquire: () => ({
      analyze: () => undefined,
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
const { tPanels } = await import("@/src/i18n/studio-panel-strings.ts");

function seedBoard(fen: string): void {
  const { title, tree, path, headers } = importPgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n*`);
  useStudioStore.setState({
    boards: [{
      id: "tablebase", remoteId: null, title, tree, path, headers, orientation: "white",
      repertoireColor: null, dirty: false, preview: false,
    }],
    activeBoardId: "tablebase",
    settings: { ...DEFAULT_SETTINGS, locale: "en", multiPv: 4, engineSparkline: false },
    workspaceView: "studio",
    setupMode: false,
  });
}

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

test("shows a castling position without DTZ, marks PVs and plays the best move", async (t) => {
  const fen = "4k3/8/8/8/8/8/8/4K2R w K - 0 1";
  seedBoard(fen);
  const moves = [
    { uci: "e1h1", san: "O-O", category: "loss" },
    { uci: "h1h2", san: "Rh2", category: "win" },
    { uci: "h1h3", san: "Rh3", category: "cursed-win" },
  ];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(new URL(url).searchParams.get("fen"), fen);
    return Response.json({ category: "win", dtz: null, dtm: 13, moves: moves.map((move) => ({ ...move, dtz: null, dtm: null })) });
  });

  const view = render(<EnginePanel />);
  assert.equal(view.queryByText("Lichess tablebase"), null);
  fireEvent.click(view.getByRole("button", { name: tPanels("en", "engine.start") }));
  const emit = listener;
  assert.ok(emit, "engine subscribed");
  act(() => emit({
    fen, depth: 20, running: true, ready: true, failed: false, nps: 1000, nodes: 1000, threaded: false,
    lines: [["e1g1", "O-O"], ["h1h2", "Rh2"], ["h1h3", "Rh3"], ["h1h4", "Rh4"]].map(([uci, san], index) => ({
      multipv: index + 1, depth: 20, scoreCp: 30, mate: null, bound: null, pvUci: [uci], pvSan: [san],
    })),
  }));

  await view.findByText("Lichess tablebase");
  assert.ok(view.getByText("Win · DTM 13"));
  assert.ok(view.getByRole("button", { name: /O-O · Win/ }));
  assert.ok(view.getByRole("button", { name: /Rh2 · Loss/ }));
  assert.ok(view.getByRole("button", { name: /Rh3 · Draw/ }));
  assert.match(view.getByRole("button", { name: /Rh4/ }).textContent ?? "", /Rh4$/);
  fireEvent.click(view.getByRole("button", { name: "O-O" }));
  assert.equal(useStudioStore.getState().active().tree.children[0]?.uci, "e1g1");
  assert.equal(view.queryByText("Lichess tablebase"), null);
});

test("shows a seven-piece result and hides it on request failure", async (t) => {
  const fen = "4k3/ppp5/8/8/8/8/PP6/4K3 w - - 0 1";
  seedBoard(fen);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ category: "blessed-loss", dtz: -110, dtm: null, moves: [] }),
  );
  const view = render(<EnginePanel />);
  await act(async () => t.mock.timers.tick(250));
  assert.ok(view.getByText("Lichess tablebase"));
  const outcome = view.getByText("Draw · DTZ -110");
  assert.match(outcome.title, /50-move rule/);

  fetch.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  act(() => seedBoard("4k3/ppp5/8/8/8/8/PP6/4K3 b - - 0 1"));
  await act(async () => t.mock.timers.tick(250));
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(view.queryByText("Lichess tablebase"), null);
});
