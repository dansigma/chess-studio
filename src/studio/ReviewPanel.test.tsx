// SIG-1110: ReviewPanel visible-state tests (idle, running, failed,
// cancelled with Resume, done). Store-seeded boards, deterministic worker mock,
// no worker; mirrors the e2e assertions in e2e/game-review.spec.ts.
import assert from "node:assert/strict";
import { after, before, beforeEach, test, mock } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { EngineInfo } from "@/src/engine/stockfish-client";
import type { PositionEval } from "@/src/chess/review-engine";
import type { BoardSession } from "@/src/store/slices/types";

// --- Controllable review worker (same shape as useGameReview.test.tsx) ------

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

// SIG-1223: the panel's hook builds a ReviewEnginePool; the real pool and
// search adapter run over one fake worker client (pool size 1).
const realPool = await import("@/src/engine/review-pool.ts");
const fakeWorkerClient = () => ({
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
  dispose: () => undefined,
});
mock.module("@/src/engine/review-pool", {
  namedExports: {
    ...realPool,
    reviewPoolSize: () => 1,
    createReviewPool: (options: { size: number; isCancelled?: () => boolean }) =>
      new realPool.ReviewEnginePool({ ...options, createClient: fakeWorkerClient }),
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

test("idle shows the explanatory line and the actions menu with report items disabled", () => {
  seedBoard();
  try {
    render(<ReviewPanel />);
    assert.ok(screen.getByText(tReview("en", "panel.emptyIdle")));
    assert.equal(screen.queryByRole("combobox", { name: tReview("en", "panel.depthLabel") }), null);
    const trigger = screen.getByRole("button", { name: tReview("en", "panel.actions") });
    assert.equal(trigger.getAttribute("aria-haspopup"), "menu");
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    const radios = within(menu).getAllByRole("menuitemradio");
    assert.equal(radios.length, 3);
    assert.equal(radios.filter((node) => node.getAttribute("aria-checked") === "true").length, 1);
    for (const key of ["annotate.title", "annotate.undo", "share.copyImage", "share.downloadImage", "share.copySummary"] as const) {
      const item = within(menu).getByRole("menuitem", { name: tReview("en", key) }) as HTMLButtonElement;
      assert.equal(item.disabled, true, `${key} is disabled before a report exists`);
    }
    fireEvent.click(radios.find((node) => node.getAttribute("aria-checked") !== "true")!);
    assert.equal(screen.queryByRole("menu"), null, "choosing a depth closes the menu");
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
    assert.equal(screen.queryByText(tReview("en", "panel.emptyIdle")), null);
    // Share row is gone; report actions live in the menu and are enabled now.
    assert.equal(screen.queryByText(tReview("en", "share.title")), null);
    fireEvent.click(screen.getByRole("button", { name: tReview("en", "panel.actions") }));
    const menu = screen.getByRole("menu");
    assert.equal((within(menu).getByRole("menuitem", { name: tReview("en", "share.copySummary") }) as HTMLButtonElement).disabled, false);
    assert.equal((within(menu).getByRole("menuitem", { name: tReview("en", "annotate.undo") }) as HTMLButtonElement).disabled, true);
    // Prev/next carry the shortcut key in their tooltip text.
    assert.equal(screen.getByRole("button", { name: tReview("en", "moments.prev") }).getAttribute("title"), "Previous moment ( [ )");
    assert.equal(screen.getByRole("button", { name: tReview("en", "moments.next") }).getAttribute("title"), "Next moment ( ] )");
  } finally {
    cleanup();
  }
});

test("SIG-1219: a count jumps to a move of that tier, and the scored labels are published for the board and move list", async () => {
  seedBoard();
  const { useReviewLabelsStore } = await import("@/src/store/review-labels.ts");
  try {
    render(<ReviewPanel />);
    fireEvent.click(screen.getByRole("button", { name: tReview("en", "panel.reviewGame") }));
    assert.ok(await screen.findByRole("button", { name: tReview("en", "panel.reviewAgain") }, { timeout: 30_000 }));
    // The labels are published from an effect after the report renders: wait for it, don't race it.
    await waitFor(() => assert.ok(useReviewLabelsStore.getState().labels.size > 0, "scored moves are published"));
    const published = useReviewLabelsStore.getState();
    assert.equal(published.boardId, useStudioStore.getState().active().id);
    assert.ok(![...published.labels.values()].includes("forced" as never), "forced moves carry no badge");

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-classification=table] button[data-tier-count]"));
    assert.ok(buttons.length > 0, "at least one non-zero count is a button");
    const button = buttons[0];
    const tier = button.getAttribute("data-tier-count");
    const visited: string[] = [];
    // Click until the cycle wraps: every stop is a move labelled with that tier.
    for (let click = 0; click < 12; click += 1) {
      fireEvent.click(button);
      const key = useStudioStore.getState().active().path.join(".");
      assert.equal(useReviewLabelsStore.getState().labels.get(key), tier, `click ${click + 1} lands on a ${tier} move`);
      if (visited.includes(key)) {
        break;
      }
      visited.push(key);
    }
    assert.equal(visited.length, Number(button.textContent), "the cycle visits exactly `count` moves");
  } finally {
    cleanup();
  }
});

test("SIG-1219: below the width threshold the card shows chips instead of the table", async () => {
  seedBoard();
  const resize = (globalThis as Record<string, unknown>).ResizeObserver;
  const callbacks: Array<(entries: unknown[]) => void> = [];
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    constructor(callback: (entries: unknown[]) => void) {
      callbacks.push(callback);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  try {
    render(<ReviewPanel />);
    fireEvent.click(screen.getByRole("button", { name: tReview("en", "panel.reviewGame") }));
    assert.ok(await screen.findByRole("button", { name: tReview("en", "panel.reviewAgain") }, { timeout: 30_000 }));
    assert.ok(document.querySelector("[data-classification=table]"), "wide by default");
    act(() => {
      for (const callback of callbacks) {
        callback([{ contentRect: { width: 260, height: 600 } }]);
      }
    });
    assert.equal(document.querySelector("[data-classification=table]"), null);
    assert.ok(document.querySelector("[data-classification=chips]"));
    act(() => {
      for (const callback of callbacks) {
        callback([{ contentRect: { width: 420, height: 600 } }]);
      }
    });
    assert.ok(document.querySelector("[data-classification=table]"), "wide again");
  } finally {
    (globalThis as Record<string, unknown>).ResizeObserver = resize;
    cleanup();
  }
});
