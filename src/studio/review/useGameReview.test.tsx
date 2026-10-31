// SIG-1110: useGameReview lifecycle tests (idle, run, cancel, resume,
// failure, cached result, effect restart). Runs under `node --test` with the
// SIG-1045 happy-dom harness; no worker needed — the shared-engine lease is
// mocked and the real `createLeaseEngine` adapter path is exercised.
import assert from "node:assert/strict";
import { after, before, beforeEach, test, mock } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import type { EngineInfo } from "@/src/engine/stockfish-client";
import type { PositionEval } from "@/src/chess/review-engine";

// --- Controllable lease -----------------------------------------------------
// The hook builds its engine via `createLeaseEngine(lease, threads,
// isCancelled)` (useGameReview.ts), so the mock lease speaks EngineInfo
// snapshots (same shape as lease-engine.test.ts) instead of PositionEvals.

type Listener = (info: EngineInfo) => void;

type Behavior = {
  /** ms to wait before answering each analyze; null answers come from fail()/silence. */
  delayMs: number;
  /** when true every search emits a failed snapshot (immediate null). */
  failAll: boolean;
  /** when true searches never emit (hang — caller cancels first). */
  silent: boolean;
};

const behavior: Behavior = { delayMs: 5, failAll: false, silent: false };

type AnalyzeCall = { fen: string; depth: number; lines: number; threads: number; fresh: boolean };
const analyzeCalls: AnalyzeCall[] = [];

const listeners = new Set<Listener>();

function evaluationFor(fen: string, options: { depth: number; lines: number }): PositionEval {
  return {
    depth: options.depth,
    lines: Array.from({ length: options.lines }, (_, index) => ({
      whitePawns: 0.2 - index * 0.05,
      uci: null,
    })),
  };
}

function toInfo(fen: string, evaluation: PositionEval, running: boolean): EngineInfo {
  return {
    depth: evaluation.depth,
    running,
    ready: true,
    failed: false,
    lines: evaluation.lines.map((line, index) => ({
      multipv: index + 1,
      depth: evaluation.depth,
      scoreCp: Math.round(line.whitePawns * 100),
      mate: null,
      pvUci: line.uci ? [line.uci] : [],
      pvSan: [],
      bound: null,
    })),
    nps: 0,
    nodes: 0,
    threaded: false,
    fen,
  };
}

mock.module("@/src/engine/shared-engine", {
  namedExports: {
    acquire: () => ({
      analyze: (fen: string, depth: number, lines: number, threads: number, _searchMoves?: string, fresh?: boolean) => {
        analyzeCalls.push({ fen, depth, lines, threads, fresh: fresh ?? false });
        if (behavior.silent) {
          return;
        }
        const captured = { ...behavior };
        setTimeout(() => {
          if (captured.failAll) {
            for (const listener of [...listeners]) {
              listener({ depth: 0, running: false, ready: true, failed: true, lines: [], nps: 0, nodes: 0, threaded: false, fen });
            }
            return;
          }
          const options = { depth, lines };
          const evaluation = evaluationFor(fen, options);
          // Emit a complete terminal snapshot (depth reached, not running).
          for (const listener of [...listeners]) {
            listener(toInfo(fen, evaluation, false));
          }
        }, captured.delayMs);
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

// Dynamic imports: the hook + cache helpers must load AFTER the mock above.
const { useGameReview } = await import("./useGameReview.ts");
const { clearReviewCache, reviewCacheKey, setCachedReview } = await import("./review-cache.ts");
const { importPgn } = await import("@/src/chess/pgn.ts");
const { variationPoints } = await import("@/src/chess/tree.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");

// --- Fixtures ---------------------------------------------------------------

const GAMES = [
  `[Event "Hook A"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *`,
  `[Event "Hook B"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 *`,
  `[Event "Hook C"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 *`,
  `[Event "Hook D"]\n\n1. c4 e5 2. Nc3 Nf6 3. Nf3 Nc6 4. g3 d5 *`,
  `[Event "Hook E"]\n\n1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 *`,
  `[Event "Hook F"]\n\n1. Nf3 d5 2. g3 Nf6 3. Bg2 e6 4. O-O Be7 *`,
] as const;

let gameIndex = 0;

function nextGame() {
  const pgn = GAMES[gameIndex % GAMES.length];
  gameIndex += 1;
  const imported = importPgn(pgn);
  return { tree: imported.tree, points: variationPoints(imported.tree, imported.path) };
}

function renderReview(overrides?: { engineThreads?: number; setupMode?: boolean }) {
  const { tree, points } = nextGame();
  const initialProps = {
    tree,
    points,
    engineBuild: "lite" as const,
    engineThreads: overrides?.engineThreads ?? 1,
    setupMode: overrides?.setupMode ?? false,
    userSide: "w" as const,
  };
  return renderHook((props: typeof initialProps) => useGameReview(props), { initialProps });
}

// --- Suite setup ------------------------------------------------------------

const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");

before(() => {
  setupDom();
  // Book replies are irrelevant here: fail closed without hitting the network.
  (globalThis as Record<string, unknown>).fetch = async () => ({ ok: false }) as never;
});

after(() => {
  if (fetchDescriptor) {
    Object.defineProperty(globalThis, "fetch", fetchDescriptor);
  } else {
    delete (globalThis as Record<string, unknown>).fetch;
  }
  teardownDom();
});

beforeEach(() => {
  behavior.delayMs = 5;
  behavior.failAll = false;
  behavior.silent = false;
  analyzeCalls.length = 0;
  listeners.clear();
  clearReviewCache();
  gameIndex = 0;
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  cleanup();
});

// --- Tests ------------------------------------------------------------------

test("idle starts a run that completes with rows", async () => {
  const { result } = renderReview();
  try {
    assert.equal(result.current.running, false);
    assert.equal(result.current.rows, null);

    act(() => {
      result.current.start();
    });
    assert.equal(result.current.running, true);
    assert.ok(result.current.progress.total > 0);

    await waitFor(() => assert.equal(result.current.running, false), { timeout: 15_000 });
    assert.equal(result.current.failed, false);
    assert.equal(result.current.cancelled, false);
    assert.ok(result.current.rows, "expected rows after a completed run");
    assert.equal(result.current.rows!.length, result.current.progress.total - 1);
    assert.equal(result.current.cached, false);
    assert.ok(analyzeCalls.length > 0, "expected the lease to be used");
  } finally {
    cleanup();
  }
});

test("cancel stops the run and keeps a resumable partial", async () => {
  behavior.delayMs = 60;
  const { result } = renderReview();
  try {
    act(() => {
      result.current.start();
    });
    assert.equal(result.current.running, true);

    await waitFor(() => assert.ok(result.current.progress.done >= 1), { timeout: 15_000 });
    act(() => {
      result.current.cancel();
    });

    // cancel() flips the flags synchronously; the pending runReview promise
    // then settles with the partial it kept.
    assert.equal(result.current.running, false);
    assert.equal(result.current.cancelled, true);
    await waitFor(() => assert.ok(result.current.partialDone > 0), { timeout: 15_000 });
    assert.equal(result.current.resumable, true);
    assert.equal(result.current.rows, null);
  } finally {
    behavior.delayMs = 5;
    cleanup();
  }
});

test("resume continues from the partial and completes", async () => {
  behavior.delayMs = 60;
  const { result } = renderReview();
  try {
    act(() => {
      result.current.start();
    });
    await waitFor(() => assert.ok(result.current.progress.done >= 1), { timeout: 15_000 });
    act(() => {
      result.current.cancel();
    });
    await waitFor(() => assert.ok(result.current.partialDone > 0), { timeout: 15_000 });
    assert.equal(result.current.resumable, true);

    // A fast engine now: resume() reuses the scored prefix and finishes.
    behavior.delayMs = 5;
    act(() => {
      result.current.resume();
    });
    assert.equal(result.current.running, true);
    await waitFor(() => assert.equal(result.current.running, false), { timeout: 15_000 });
    assert.equal(result.current.cancelled, false);
    assert.ok(result.current.rows, "expected rows after resume completes");
  } finally {
    behavior.delayMs = 5;
    cleanup();
  }
});

test("an engine that stops answering fails the run", async () => {
  behavior.failAll = true;
  const { result } = renderReview();
  try {
    act(() => {
      result.current.start();
    });
    await waitFor(() => assert.equal(result.current.running, false), { timeout: 15_000 });
    assert.equal(result.current.failed, true);
    assert.equal(result.current.cancelled, false);
    assert.equal(result.current.rows, null);
  } finally {
    cleanup();
  }
});

test("a cached result returns without running the engine", async () => {
  const { tree, points } = nextGame();
  const fens = points.map((point) => point.fen);
  const { getNodeAt } = await import("@/src/chess/tree.ts");
  const ucis = points.slice(1).map((point) => getNodeAt(tree, point.path)?.uci ?? "");
  const key = reviewCacheKey(fens, ucis, "standard", "lite");
  const seeded = [
    { index: 0, playedUci: ucis[0] ?? "e2e4", beforePawns: 0.2, afterPawns: 0.2 },
  ] as never;
  setCachedReview(key, seeded as never);

  const { result } = renderHook(() =>
    useGameReview({ tree, points, engineBuild: "lite", engineThreads: 1, setupMode: false, userSide: "w" }),
  );
  try {
    assert.ok(result.current.rows, "expected the seeded cached rows");
    assert.equal(result.current.cached, true);
    assert.equal(result.current.running, false);
    assert.equal(analyzeCalls.length, 0, "cached result must not touch the engine");
  } finally {
    cleanup();
  }
});

test("changing engineThreads re-keys the running effect", async () => {
  behavior.delayMs = 60;
  const { tree, points } = nextGame();
  const initialProps = {
    tree,
    points,
    engineBuild: "lite" as const,
    engineThreads: 1,
    setupMode: false,
    userSide: "w" as const,
  };
  const rendered = renderHook((props: typeof initialProps) => useGameReview(props), { initialProps });
  try {
    act(() => {
      rendered.result.current.start();
    });
    await waitFor(() => assert.ok(analyzeCalls.length > 0), { timeout: 15_000 });
    const threadsSeen = new Set(analyzeCalls.map((call) => call.threads));
    assert.ok(threadsSeen.has(1), `expected threads=1 in analyze calls, saw ${[...threadsSeen]}`);
    const callsBefore = analyzeCalls.length;

    // engineThreads is an effect dep: changing it mid-run restarts the search.
    rendered.rerender({ ...initialProps, engineThreads: 8 });
    await waitFor(() => assert.ok(analyzeCalls.length > callsBefore), { timeout: 15_000 });
    const threadsAfter = new Set(analyzeCalls.slice(callsBefore).map((call) => call.threads));
    assert.ok(threadsAfter.has(1), `expected clamped threads=1 after re-key, saw ${[...threadsAfter]}`);
  } finally {
    behavior.delayMs = 5;
    cleanup();
  }
});
