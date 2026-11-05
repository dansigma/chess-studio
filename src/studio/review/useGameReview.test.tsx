// SIG-1110: useGameReview lifecycle tests (idle, run, cancel, resume,
// failure, cached result, effect restart). Runs under `node --test` with the
// SIG-1045 happy-dom harness; no worker needed. SIG-1223: the hook builds a
// `ReviewEnginePool`; the real pool and search adapter run over fake worker
// clients that speak EngineInfo snapshots.
import assert from "node:assert/strict";
import { after, before, beforeEach, test, mock } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import type { EngineInfo } from "@/src/engine/stockfish-client";
import type { PositionEval } from "@/src/chess/review-engine";

type Listener = (info: EngineInfo) => void;

type Behavior = {
  /** ms to wait before answering each analyze; null answers come from fail()/silence. */
  delayMs: number;
  /** when true every search emits a failed snapshot (immediate null). */
  failAll: boolean;
  /** when true searches never emit (hang — caller cancels first). */
  silent: boolean;
  /** Workers the (mocked) pool-size formula asks for. */
  poolSize: number;
};

const behavior: Behavior = { delayMs: 5, failAll: false, silent: false, poolSize: 1 };

type AnalyzeCall = { fen: string; depth: number; lines: number; threads: number; fresh: boolean };
const analyzeCalls: AnalyzeCall[] = [];
let inFlight = 0;
let maxInFlight = 0;
const createdClients: Array<{ disposed: boolean }> = [];

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

function fakeWorkerClient() {
  const listeners = new Set<Listener>();
  const state = { disposed: false };
  createdClients.push(state);
  return {
    analyze: (fen: string, depth: number, lines: number, threads: number, _searchMoves?: string, fresh?: boolean) => {
      analyzeCalls.push({ fen, depth, lines, threads, fresh: fresh ?? false });
      if (behavior.silent) {
        return;
      }
      const captured = { ...behavior };
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      setTimeout(() => {
        inFlight -= 1;
        if (state.disposed) {
          return;
        }
        if (captured.failAll) {
          for (const listener of [...listeners]) {
            listener({ depth: 0, running: false, ready: true, failed: true, lines: [], nps: 0, nodes: 0, threaded: false, fen });
          }
          return;
        }
        const evaluation = evaluationFor(fen, { depth, lines });
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
    dispose: () => {
      state.disposed = true;
      listeners.clear();
    },
  };
}

// The real pool over fake workers; the size formula is controlled per test.
const realPool = await import("@/src/engine/review-pool.ts");
mock.module("@/src/engine/review-pool", {
  namedExports: {
    ...realPool,
    reviewPoolSize: () => behavior.poolSize,
    createReviewPool: (options: { size: number; isCancelled?: () => boolean }) =>
      new realPool.ReviewEnginePool({ ...options, createClient: fakeWorkerClient }),
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

function renderReview(overrides?: { setupMode?: boolean }) {
  const { tree, points } = nextGame();
  const initialProps = {
    tree,
    points,
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
  behavior.poolSize = 1;
  analyzeCalls.length = 0;
  createdClients.length = 0;
  inFlight = 0;
  maxInFlight = 0;
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
    const rows = result.current.rows as unknown[] | null;
    assert.ok(rows, "expected rows after a completed run");
    assert.equal(rows.length, result.current.progress.total - 1);
    assert.equal(result.current.cached, false);
    assert.ok(analyzeCalls.length > 0, "expected the review workers to be used");
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
  const key = reviewCacheKey(fens, ucis, "standard");
  const seeded = [
    { index: 0, playedUci: ucis[0] ?? "e2e4", beforePawns: 0.2, afterPawns: 0.2 },
  ] as never;
  setCachedReview(key, seeded as never);

  const { result } = renderHook(() =>
    useGameReview({ tree, points, setupMode: false, userSide: "w" }),
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

test("changing the analysis engine settings does not touch a running review", async () => {
  // SIG-1223: the review is decoupled from Settings. Flip build and threads
  // mid-run: the run neither restarts (no repeated first position) nor changes
  // its search parameters, and every search is single-threaded.
  behavior.delayMs = 30;
  const { tree, points } = nextGame();
  const initialProps = { tree, points, setupMode: false, userSide: "w" as const };
  const rendered = renderHook((props: typeof initialProps) => useGameReview(props), { initialProps });
  try {
    act(() => {
      rendered.result.current.start();
    });
    await waitFor(() => assert.ok(analyzeCalls.length >= 2), { timeout: 15_000 });
    act(() => {
      useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, engineBuild: "standard", engineThreads: 4 } });
    });
    await waitFor(() => assert.equal(rendered.result.current.running, false), { timeout: 15_000 });
    assert.ok(rendered.result.current.rows, "expected a finished review");
    const firstFen = points[0]?.fen;
    assert.equal(analyzeCalls.filter((call) => call.fen === firstFen).length, 1, "no restart from the first position");
    assert.ok(analyzeCalls.every((call) => call.threads === 1), "review searches are always Threads 1");
    assert.ok(analyzeCalls.every((call) => call.fresh), "every position is searched with a fresh hash");
  } finally {
    cleanup();
  }
});

test("a multi-worker pool reviews positions concurrently and finishes with every row", async () => {
  behavior.poolSize = 2;
  behavior.delayMs = 40;
  const { result } = renderReview();
  try {
    act(() => {
      result.current.start();
    });
    await waitFor(() => assert.equal(result.current.running, false), { timeout: 15_000 });
    assert.ok(result.current.rows, "expected rows");
    assert.equal(result.current.rows!.length, result.current.progress.total - 1);
    assert.equal(maxInFlight, 2, "two searches should have been in flight together");
    assert.equal(createdClients.length, 2, "one client per pool worker");
    assert.ok(createdClients.every((client) => client.disposed), "workers are terminated when the review finishes");
  } finally {
    cleanup();
  }
});

test("cancel terminates every pool worker", async () => {
  behavior.poolSize = 2;
  behavior.delayMs = 60;
  const { result } = renderReview();
  try {
    act(() => {
      result.current.start();
    });
    await waitFor(() => assert.equal(createdClients.length, 2), { timeout: 15_000 });
    act(() => {
      result.current.cancel();
    });
    await waitFor(() => assert.ok(createdClients.every((client) => client.disposed)), { timeout: 15_000 });
    assert.equal(result.current.cancelled, true);
  } finally {
    cleanup();
  }
});

// --- SIG-1225: the opening book is resolved first ---------------------------

test("a resolved book skips the engine for book positions and shows no note", async () => {
  (globalThis as Record<string, unknown>).fetch = async () =>
    ({ ok: true, json: async () => ({ available: true, plies: 3, partial: false, counts: [] }) }) as never;
  const { tree, points } = nextGame();
  const { result } = renderHook(() => useGameReview({ tree, points, setupMode: false, userSide: "w" }));
  try {
    act(() => {
      result.current.start();
    });
    await waitFor(() => assert.equal(result.current.running, false), { timeout: 15_000 });
    const rows = result.current.rows as Array<{ label: string | null }> | null;
    assert.ok(rows);
    assert.deepEqual(rows.slice(0, 3).map((row) => row.label), ["book", "book", "book"]);
    assert.equal(rows[3].label === "book", false);
    assert.equal(result.current.bookUnavailable, false);
    // Positions 0..2 are never searched; the engine starts at position 3.
    const searched = new Set(analyzeCalls.map((call) => call.fen));
    for (const point of points.slice(0, 3)) {
      assert.equal(searched.has(point.fen), false);
    }
    assert.equal(searched.has(points[3].fen), true);
  } finally {
    cleanup();
    (globalThis as Record<string, unknown>).fetch = async () => ({ ok: false }) as never;
  }
});

test("an unavailable book scores every position, shows the note and is not cached", async () => {
  // The suite's default fetch fails, which is exactly the fallback.
  const { tree, points } = nextGame();
  const { getNodeAt } = await import("@/src/chess/tree.ts");
  const ucis = points.slice(1).map((point) => getNodeAt(tree, point.path)?.uci ?? "");
  const { getCachedReview } = await import("./review-cache.ts");
  const { result } = renderHook(() => useGameReview({ tree, points, setupMode: false, userSide: "w" }));
  try {
    act(() => {
      result.current.start();
    });
    await waitFor(() => assert.equal(result.current.running, false), { timeout: 15_000 });
    assert.equal(result.current.bookUnavailable, true);
    assert.ok(result.current.rows, "the review still completes");
    const rows = result.current.rows as Array<{ label: string | null }>;
    assert.ok(rows.every((row) => row.label !== "book"));
    const searched = new Set(analyzeCalls.map((call) => call.fen));
    assert.equal(searched.size, points.length, "every position was scored");
    assert.equal(
      getCachedReview(reviewCacheKey(points.map((point) => point.fen), ucis, "standard")),
      null,
      "a no-book review is not cached",
    );
  } finally {
    cleanup();
  }
});
