// SIG-1293: live eval bar hook (shared "live" slot) and the per-device toggle.
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { EngineInfo } from "../../engine/stockfish-client.ts";

type Listener = (info: EngineInfo) => void;
const listeners = new Set<Listener>();
const calls: string[] = [];
const acquired: Array<{ slot: string; build: string }> = [];

mock.module("@/src/engine/shared-engine", {
  namedExports: {
    acquire: (slot: string, build: string) => {
      acquired.push({ slot, build });
      calls.push("acquire");
      return {
        analyze: (fen: string, depth: number, multiPv: number, threads: number) =>
          calls.push(`analyze:${fen}:${depth}:${multiPv}:${threads}`),
        stop: () => calls.push("stop"),
        subscribe: (l: Listener) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        release: () => calls.push("release"),
      };
    },
  },
});

const { useLiveEval, LIVE_EVAL_DEPTH } = await import("./use-live-eval.ts");
const { LiveEvalBar } = await import("./LiveEvalBar.tsx");
const { render } = await import("@testing-library/react");
const { useLiveEvalPref, LIVE_EVAL_PREF_KEY } = await import("./use-live-eval-pref.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");

const WHITE_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const BLACK_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function emit(fen: string, line: { scoreCp?: number; mate?: number }): void {
  const info = {
    depth: 10, running: true, ready: true, failed: false, nps: 0, nodes: 0, threaded: false, fen,
    lines: [{ multipv: 1, depth: 10, scoreCp: line.scoreCp ?? null, mate: line.mate ?? null, pvUci: [], pvSan: [] }],
  } as unknown as EngineInfo;
  act(() => {
    for (const l of [...listeners]) {
      l(info);
    }
  });
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "visibilityState", { value: hidden ? "hidden" : "visible", configurable: true });
  act(() => {
    document.dispatchEvent(new window.Event("visibilitychange"));
  });
}

beforeEach(() => {
  setupDom();
  calls.length = 0;
  acquired.length = 0;
  listeners.clear();
  setHidden(false);
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  teardownDom();
});

test("Black to move: score is flipped to White's point of view", () => {
  const { result } = renderHook(() => useLiveEval(BLACK_FEN, { enabled: true }));
  emit(BLACK_FEN, { scoreCp: 120 }); // good for Black
  assert.equal(result.current?.label, "-1.20");
  assert.equal(result.current?.pawns, -1.2);
});

test("mate labels use White's point of view", () => {
  const { result } = renderHook(() => useLiveEval(BLACK_FEN, { enabled: true }));
  emit(BLACK_FEN, { mate: 3 });
  assert.equal(result.current?.label, "-M3");
});

test("snapshots for another FEN are ignored", () => {
  const { result } = renderHook(() => useLiveEval(WHITE_FEN, { enabled: true }));
  emit(BLACK_FEN, { scoreCp: 500 });
  // SIG-1312: no eval yet is null (neutral bar), never "0.00".
  assert.equal(result.current, null);
});

test("new FEN calls analyze directly, without a stop, and keeps one lease", () => {
  const { rerender } = renderHook(({ fen }) => useLiveEval(fen, { enabled: true }), { initialProps: { fen: WHITE_FEN } });
  rerender({ fen: BLACK_FEN });
  assert.deepEqual(calls, [
    "acquire",
    `analyze:${WHITE_FEN}:${LIVE_EVAL_DEPTH}:1:1`,
    `analyze:${BLACK_FEN}:${LIVE_EVAL_DEPTH}:1:1`,
  ]);
});

test("acquires the live slot with settings.engineBuild", () => {
  useStudioStore.getState().setEngineBuild("standard");
  renderHook(() => useLiveEval(WHITE_FEN, { enabled: true }));
  assert.deepEqual(acquired, [{ slot: "live", build: useStudioStore.getState().settings.engineBuild }]);
  assert.equal(acquired[0]?.build, "standard");
});

test("releases on unmount and when disabled", () => {
  const { rerender, unmount } = renderHook(({ on }) => useLiveEval(WHITE_FEN, { enabled: on }), { initialProps: { on: true } });
  rerender({ on: false });
  assert.equal(calls.filter((c) => c === "release").length, 1);
  rerender({ on: true });
  unmount();
  assert.equal(calls.filter((c) => c === "release").length, 2);
});

test("releases while the tab is hidden and resumes when visible", () => {
  renderHook(() => useLiveEval(WHITE_FEN, { enabled: true }));
  setHidden(true);
  assert.equal(calls.filter((c) => c === "release").length, 1);
  setHidden(false);
  assert.equal(calls.filter((c) => c === "acquire").length, 2);
  assert.equal(calls.filter((c) => c.startsWith("analyze")).length, 2);
});

test("SIG-1312: the focused card with a PGN eval never acquires the lease; without one it does", () => {
  const { rerender, container } = render(<LiveEvalBar fen={WHITE_FEN} pgnEval={{ mate: -2 }} focused />);
  assert.equal(calls.filter((c) => c === "acquire").length, 0);
  assert.ok(container.querySelector('[aria-label="Evaluation -M2"]'));
  rerender(<LiveEvalBar fen={WHITE_FEN} pgnEval={null} focused />);
  assert.equal(calls.filter((c) => c === "acquire").length, 1);
  // Before the engine answers, the bar is neutral: no "0.00".
  assert.equal(container.textContent, "");
  emit(WHITE_FEN, { scoreCp: 42 });
  assert.ok(container.querySelector('[aria-label="Evaluation +0.42"]'));
  rerender(<LiveEvalBar fen={WHITE_FEN} pgnEval={{ pawns: 1.5 }} focused />);
  assert.equal(calls.filter((c) => c === "release").length, 1);
  assert.ok(container.querySelector('[aria-label="Evaluation +1.50"]'));
});

test("SIG-1312: a non-focused card never starts the engine", () => {
  render(<LiveEvalBar fen={WHITE_FEN} pgnEval={null} focused={false} />);
  render(<LiveEvalBar fen={WHITE_FEN} pgnEval={{ pawns: 0 }} focused={false} />);
  assert.equal(calls.filter((c) => c === "acquire").length, 0);
});

test("toggle: desktop default on, remembered per device", () => {
  const { result } = renderHook(() => useLiveEvalPref());
  assert.equal(result.current[0], true);
  act(() => result.current[1](false));
  assert.equal(result.current[0], false);
  assert.equal(window.localStorage.getItem(LIVE_EVAL_PREF_KEY), "0");
  cleanup();
  const again = renderHook(() => useLiveEvalPref());
  assert.equal(again.result.current[0], false);
});

test("toggle: mobile default off, a stored choice wins", () => {
  window.localStorage.clear();
  setupDom({ matchMediaMatches: true });
  const { result } = renderHook(() => useLiveEvalPref());
  assert.equal(result.current[0], false);
  act(() => result.current[1](true));
  assert.equal(window.localStorage.getItem(LIVE_EVAL_PREF_KEY), "1");
  assert.equal(result.current[0], true);
});
