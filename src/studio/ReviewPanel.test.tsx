// SIG-1110: ReviewPanel visible-state tests (idle, running, failed,
// cancelled with Resume, done). Store-seeded boards, deterministic lease mock,
// no worker; mirrors the e2e assertions in e2e/game-review.spec.ts.
import assert from "node:assert/strict";
import { after, before, beforeEach, test, mock } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { EngineInfo } from "@/src/engine/stockfish-client";
import type { PositionEval } from "@/src/chess/review-engine";
import type { BoardSession } from "@/src/store/slices/types";

// --- Controllable lease (same shape as useGameReview.test.tsx) ---------------

type Listener = (info: EngineInfo) => void;

const behavior = { delayMs: 5, failAll: false };
const analyzeCalls: Array<{ fen: string; depth: number; lines: number; threads: number }> = [];
const listeners = new Set<Listener>();

function evaluationFor(options: { depth: number; lines: number }): PositionEval {
  return {
    depth: options.depth,
    lines: Array.from({ length: options.lines }, (_, index) => ({
      whitePawns: 0.2 - index * 0.05,
      uci: null,
    })),
  };
}

function toInfo(fen: string, evaluation: PositionEval): EngineInfo {
  return {
    depth: evaluation.depth,
    running: false,
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
      analyze: (fen: string, depth: number, lines: number, threads: number) => {
        analyzeCalls.push({ fen, depth, lines, threads });
        const captured = { ...behavior };
        setTimeout(() => {
          if (captured.failAll) {
            for (const listener of [...listeners]) {
              listener({ depth: 0, running: false, ready: true, failed: true, lines: [], nps: 0, nodes: 0, threaded: false, fen });
            }
            return;
          }
          const evaluation = evaluationFor({ depth, lines });
          for (const listener of [...listeners]) {
            listener(toInfo(fen, evaluation));
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

const { ReviewPanel } = await import("./ReviewPanel.tsx");
const { importPgn } = await import("@/src/chess/pgn.ts");
const { clearReviewCache } = await import("./review/review-cache.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");
const { tReview, reviewFailedText, reviewCancelledText } = await import("@/src/chess/review-strings.ts");

// --- Fixtures ----------------------------------------------------------------

const GAMES = [
  `[Event "Panel A"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *`,
  `[Event "Panel B"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7 5. Bf4 O-O *`,
  `[Event "Panel C"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *`,
  `[Event "Panel D"]\n\n1. c4 e5 2. Nc3 Nf6 3. Nf3 Nc6 4. g3 d5 5. cxd5 Nxd5 *`,
  `[Event "Panel E"]\n\n1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 5. a3 Bxc3+ *`,
] as const;

let gameIndex = 0;

function seedBoard(): void {
  const pgn = GAMES[gameIndex % GAMES.length];
  gameIndex += 1;
  const imported = importPgn(pgn);
  const path = imported.path;
  const board: BoardSession = {
    id: `panel-board-${gameIndex}`,
    remoteId: null,
    title: imported.title,
    tree: imported.tree,
    path,
    headers: imported.headers,
    orientation: "white",
    repertoireColor: null,
    dirty: false,
    preview: false,
  };
  useStudioStore.setState({
    boards: [board],
    activeBoardId: board.id,
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    setupMode: false,
  });
}

// --- Suite setup --------------------------------------------------------------

const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
const resizeDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");

before(() => {
  setupDom();
  (globalThis as Record<string, unknown>).fetch = async () => ({ ok: false }) as never;
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver === "undefined") {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
});

after(() => {
  if (fetchDescriptor) {
    Object.defineProperty(globalThis, "fetch", fetchDescriptor);
  } else {
    delete (globalThis as Record<string, unknown>).fetch;
  }
  if (resizeDescriptor) {
    Object.defineProperty(globalThis, "ResizeObserver", resizeDescriptor);
  } else {
    delete (globalThis as Record<string, unknown>).ResizeObserver;
  }
  teardownDom();
});

beforeEach(() => {
  behavior.delayMs = 5;
  behavior.failAll = false;
  analyzeCalls.length = 0;
  listeners.clear();
  clearReviewCache();
  act(() => {
    useStudioStore.getState().setLocale("en");
  });
  cleanup();
});

// --- Tests --------------------------------------------------------------------

test("idle shows the run button", () => {
  seedBoard();
  try {
    render(<ReviewPanel />);
    assert.ok(screen.getByRole("button", { name: tReview("en", "panel.reviewGame") }));
    assert.equal(screen.queryByRole("progressbar"), null);
  } finally {
    cleanup();
  }
});

test("running shows progress and Cancel", async () => {
  behavior.delayMs = 200;
  seedBoard();
  try {
    render(<ReviewPanel />);
    fireEvent.click(screen.getByRole("button", { name: tReview("en", "panel.reviewGame") }));
    assert.ok(await screen.findByRole("progressbar", undefined, { timeout: 5_000 }));
    assert.ok(screen.getByRole("button", { name: tReview("en", "panel.cancel") }));
  } finally {
    behavior.delayMs = 5;
    cleanup();
  }
});

test("failed shows the failure message and a retry", async () => {
  behavior.failAll = true;
  seedBoard();
  try {
    render(<ReviewPanel />);
    fireEvent.click(screen.getByRole("button", { name: tReview("en", "panel.reviewGame") }));
    const status = await screen.findByRole("status", undefined, { timeout: 15_000 });
    assert.match(status.textContent ?? "", /engine stopped responding/i);
    // Retry: the initial run button is still available (no rows were stored).
    assert.ok(screen.getByRole("button", { name: tReview("en", "panel.reviewGame") }));
    assert.ok(reviewFailedText, "reviewFailedText helper is the message source");
  } finally {
    cleanup();
  }
});

test("cancelled with a partial shows Resume", async () => {
  behavior.delayMs = 30;
  seedBoard();
  const callsBefore = analyzeCalls.length;
  try {
    render(<ReviewPanel />);
    fireEvent.click(screen.getByRole("button", { name: tReview("en", "panel.reviewGame") }));
    await screen.findByRole("progressbar", undefined, { timeout: 5_000 });
    // Wait until the first position scored so the partial is resumable.
    await waitFor(() => assert.ok(analyzeCalls.length >= callsBefore + 2), { timeout: 15_000 });
    fireEvent.click(screen.getByRole("button", { name: tReview("en", "panel.cancel") }));
    const status = await screen.findByRole("status", undefined, { timeout: 15_000 });
    assert.match(status.textContent ?? "", /cancelled at/i);
    assert.ok(reviewCancelledText, "reviewCancelledText helper is the message source");
    // The resume affordance carries the scored prefix counts (partial array
    // length), not the status text's move progress — so match by prefix. The
    // partial arrives async after cancel(), so wait for the button.
    assert.ok(await screen.findByRole("button", { name: /Resume review/ }, { timeout: 15_000 }));
    assert.ok(screen.getByRole("button", { name: tReview("en", "panel.reviewAgain") }));
  } finally {
    behavior.delayMs = 5;
    cleanup();
  }
});

test("done shows the report card and key moments", async () => {
  seedBoard();
  try {
    render(<ReviewPanel />);
    fireEvent.click(screen.getByRole("button", { name: tReview("en", "panel.reviewGame") }));
    assert.ok(await screen.findByRole("button", { name: tReview("en", "panel.reviewAgain") }, { timeout: 30_000 }));
    assert.ok(screen.getAllByText(tReview("en", "report.keyMoments")).length >= 1);
    assert.ok(screen.getByRole("img", { name: new RegExp(tReview("en", "chart.ariaLabel"), "i") }));
  } finally {
    cleanup();
  }
});
