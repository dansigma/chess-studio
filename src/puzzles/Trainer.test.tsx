import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MistakeExercisesMap } from "../lib/mistake-exercises-store";
import { compilePuzzle, emptyProgress, type CompiledPuzzle } from "./engine";

const { PUZZLE_CATALOG } = await import("./catalog.ts");
const CATALOG_3PLY = PUZZLE_CATALOG.map(compilePuzzle).find((p) => p.uci.length === 3);
assert.ok(CATALOG_3PLY, "expected a 3-ply puzzle in catalog");

const UNDERPROMO_PUZZLE = compilePuzzle({
  id: "underpromo-tactic",
  fen: "5rk1/4P3/6N1/8/8/8/8/4K3 w - - 0 1",
  moves: ["exf8=N"],
  rating: 1200,
  themes: ["promotion"],
});

const ctl = {
  search: "",
  pushed: [] as string[],
  catalog: [CATALOG_3PLY] as CompiledPuzzle[],
  exercises: {} as MistakeExercisesMap,
  progress: emptyProgress(),
  boardOptions: {} as {
    position?: string;
    onPieceDrop?: (args: { sourceSquare: string; targetSquare: string | null }) => boolean;
    onSquareClick?: (args: { square: string; piece?: { pieceType: string } | null }) => void;
  },
};

mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({ push: (href: string) => ctl.pushed.push(href) }),
    usePathname: () => "/puzzles/play",
    useSearchParams: () => new URLSearchParams(ctl.search),
  },
});

const realChessboard = await import("react-chessboard");
mock.module("react-chessboard", {
  namedExports: {
    ...realChessboard,
    Chessboard: ({ options }: { options: typeof ctl.boardOptions }) => {
      ctl.boardOptions = options;
      return <div data-testid="trainer-board" data-position={options.position} />;
    },
  },
});

mock.module("../lib/supabase/client.ts", {
  namedExports: {
    createBrowserSupabase: () => null,
  },
});

const realMoveSound = await import("../chess/move-sound.ts");
mock.module("../chess/move-sound.ts", {
  namedExports: {
    ...realMoveSound,
    playMoveSound: () => {},
  },
});

const realProgress = await import("./progress.ts");
mock.module("./progress.ts", {
  namedExports: {
    ...realProgress,
    hydratePuzzleProgress: async () => ctl.progress,
    savePuzzleProgress: async () => {},
  },
});

mock.module("./puzzle-client.ts", {
  namedExports: {
    loadPuzzleCatalog: async () => ctl.catalog,
  },
});

const realExercises = await import("../lib/mistake-exercises-store.ts");
mock.module("../lib/mistake-exercises-store.ts", {
  namedExports: {
    ...realExercises,
    hydrateExercises: async () => ctl.exercises,
    saveExercises: async () => {},
    recordAttempt: (map: MistakeExercisesMap) => map,
  },
});

const { PuzzleTrainer } = await import("./Trainer.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

before(() => setupDom());
after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  ctl.search = "mode=rated";
  ctl.pushed = [];
  ctl.catalog = [CATALOG_3PLY];
  ctl.exercises = {};
  ctl.progress = emptyProgress();
  ctl.boardOptions = {};
  act(() => {
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "en", moveSound: false } });
  });
});

test("underpromotion tactic: dropping pawn opens chooser and knight promotion solves puzzle", async () => {
  ctl.catalog = [UNDERPROMO_PUZZLE];
  render(<PuzzleTrainer />);
  await waitFor(() => {
    assert.equal(screen.getByTestId("trainer-board").getAttribute("data-position"), UNDERPROMO_PUZZLE.fen);
  });

  // Dropping e7 -> f8 opens the promotion picker rather than auto-queening
  act(() => {
    const accepted = ctl.boardOptions.onPieceDrop?.({ sourceSquare: "e7", targetSquare: "f8" });
    assert.equal(accepted, false);
  });
  const picker = screen.getByTestId("promotion-picker");
  // Pressing H/Enter while promotion picker is open does not trigger trainer shortcuts
  fireEvent.keyDown(window, { key: "h" });
  assert.equal(screen.queryByText("The piece to move is highlighted."), null);

  fireEvent.click(within(picker).getByRole("button", { name: "Promote to Knight" }));
  await screen.findByText("Solved");
  assert.equal(screen.getByTestId("trainer-board").getAttribute("data-position"), UNDERPROMO_PUZZLE.endFen);
});

test("underpromotion tactic: picking queen when knight is expected fails the puzzle", async () => {
  ctl.catalog = [UNDERPROMO_PUZZLE];
  render(<PuzzleTrainer />);
  await waitFor(() => {
    assert.equal(screen.getByTestId("trainer-board").getAttribute("data-position"), UNDERPROMO_PUZZLE.fen);
  });

  act(() => {
    ctl.boardOptions.onPieceDrop?.({ sourceSquare: "e7", targetSquare: "f8" });
  });
  const picker = screen.getByTestId("promotion-picker");
  fireEvent.click(within(picker).getByRole("button", { name: "Promote to Queen" }));
  await screen.findByText("Incorrect");
});

test("keyboard flow: h hints while playing, Enter/Space advances, inputs & focused buttons are guarded", async () => {
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    const second = { ...UNDERPROMO_PUZZLE, id: "second-puz", rating: 2500 };
    ctl.catalog = [CATALOG_3PLY, second];
    render(<PuzzleTrainer />);
    await waitFor(() => {
      assert.equal(screen.getByTestId("trainer-board").getAttribute("data-position"), CATALOG_3PLY.fen);
    });

    // Editable target ignores 'h'
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "h" });
    assert.equal(screen.queryByText("The piece to move is highlighted."), null);
    input.remove();

    // Normal 'h' triggers hint
    fireEvent.keyDown(window, { key: "h" });
    await screen.findByText("The piece to move is highlighted.");

    // Solve the 3-ply puzzle
    const m0 = CATALOG_3PLY.uci[0];
    act(() => {
      ctl.boardOptions.onPieceDrop?.({ sourceSquare: m0.slice(0, 2), targetSquare: m0.slice(2, 4) });
    });
    // Wait for opponent auto-reply (340ms)
    await act(async () => {
      await sleep(420);
    });
    const m2 = CATALOG_3PLY.uci[2];
    act(() => {
      ctl.boardOptions.onPieceDrop?.({ sourceSquare: m2.slice(0, 2), targetSquare: m2.slice(2, 4) });
    });
    await screen.findByText("Solved");

    // Scrub backward and forward through played moves after solving
    const endPos = screen.getByTestId("trainer-board").getAttribute("data-position");
    assert.equal(endPos, CATALOG_3PLY.endFen);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    const afterBack1 = screen.getByTestId("trainer-board").getAttribute("data-position");
    assert.notEqual(afterBack1, endPos);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    assert.equal(screen.getByTestId("trainer-board").getAttribute("data-position"), CATALOG_3PLY.fen);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    assert.notEqual(screen.getByTestId("trainer-board").getAttribute("data-position"), CATALOG_3PLY.fen);

    // Pressing Enter while Analyze in Studio is focused must NOT trigger Continue
    const analyzeBtn = screen.getByRole("button", { name: "Analyze in Studio" });
    analyzeBtn.focus();
    fireEvent.keyDown(analyzeBtn, { key: "Enter" });
    assert.equal(screen.getByText("Solved") !== null, true);

    // Pressing Enter on non-interactive target advances to the next puzzle and resets viewPly
    fireEvent.keyDown(document.body, { key: "Enter" });
    await waitFor(() => {
      assert.equal(screen.getByTestId("trainer-board").getAttribute("data-position"), second.fen);
    });
  } finally {
    Math.random = origRandom;
  }
});

test("post-attempt failure lets user scrub forward into the revealed solution without leaving trainer", async () => {
  ctl.catalog = [CATALOG_3PLY];
  render(<PuzzleTrainer />);
  await waitFor(() => {
    assert.equal(screen.getByTestId("trainer-board").getAttribute("data-position"), CATALOG_3PLY.fen);
  });

  // Click "Show solution"
  fireEvent.click(screen.getByRole("button", { name: "Solution" }));
  await screen.findByText("Incorrect");
  await act(async () => {
    await sleep(480);
  });

  // At ply 0 (starting FEN), ArrowRight steps through m0 -> m1 -> m2 (endFen)
  fireEvent.keyDown(window, { key: "ArrowRight" });
  const after1 = screen.getByTestId("trainer-board").getAttribute("data-position");
  assert.notEqual(after1, CATALOG_3PLY.fen);
  fireEvent.keyDown(window, { key: "ArrowRight" });
  fireEvent.keyDown(window, { key: "ArrowRight" });
  assert.equal(screen.getByTestId("trainer-board").getAttribute("data-position"), CATALOG_3PLY.endFen);
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  assert.equal(screen.getByTestId("trainer-board").getAttribute("data-position"), CATALOG_3PLY.fen);
});

test("mistakes mode shows X of Y queue progress and active phase/tier filter pill with clear link", async () => {
  ctl.search = "mode=mistakes&phase=endgame&label=blunder";
  ctl.exercises = {
    "mx:p1": {
      exercise: {
        key: "mx:p1",
        fen: UNDERPROMO_PUZZLE.fen,
        solutionUci: UNDERPROMO_PUZZLE.uci,
        bestPv: UNDERPROMO_PUZZLE.uci,
        playedUci: "e7f8q",
        label: "blunder",
        phase: "endgame",
        lossCp: 350,
        beforePawns: 3.5,
        afterPawns: 0,
        motif: "mate",
        createdAt: "2020-01-01T00:00:00Z",
      },
      srs: null,
    },
    "mx:p2": {
      exercise: {
        key: "mx:p2",
        fen: CATALOG_3PLY.fen,
        solutionUci: CATALOG_3PLY.uci,
        bestPv: CATALOG_3PLY.uci,
        playedUci: "a1a2",
        label: "blunder",
        phase: "endgame",
        lossCp: 350,
        beforePawns: 3.5,
        afterPawns: 0,
        motif: "fork",
        createdAt: "2020-01-01T00:00:00Z",
      },
      srs: null,
    },
  };

  render(<PuzzleTrainer />);
  await waitFor(() => {
    assert.equal(screen.getByTestId("mistakes-queue-progress").textContent, "1 of 2");
  });

  const chip = screen.getByTestId("mistakes-filter-chip");
  assert.match(chip.textContent ?? "", /Endgame · Blunder/);
  assert.equal(within(chip).getByRole("link", { name: "Clear filter" }).getAttribute("href"), "/puzzles/play?mode=mistakes");

  // Solve first mistake and advance with Space key -> progress updates to 2 of 2
  const fen = screen.getByTestId("trainer-board").getAttribute("data-position");
  const isFirstUnderpromo = fen === UNDERPROMO_PUZZLE.fen;
  if (isFirstUnderpromo) {
    act(() => {
      ctl.boardOptions.onPieceDrop?.({ sourceSquare: "e7", targetSquare: "f8" });
    });
    fireEvent.click(within(screen.getByTestId("promotion-picker")).getByRole("button", { name: "Promote to Knight" }));
  } else {
    fireEvent.click(screen.getByRole("button", { name: "Solution" }));
  }
  await waitFor(() => {
    assert.ok(screen.queryByRole("button", { name: "Next puzzle" }));
  });

  fireEvent.keyDown(document.body, { key: " " });
  await waitFor(() => {
    assert.equal(screen.getByTestId("mistakes-queue-progress").textContent, "2 of 2");
  });
});

test("Rush disables scrubbing and filtered empty mistakes queue still renders filter pill with clear link", async () => {
  // 1. Rush mode: wrong move enters failed state with auto-advance, ArrowLeft/Right must not scrub
  ctl.search = "mode=rush";
  ctl.catalog = [CATALOG_3PLY];
  render(<PuzzleTrainer />);
  await waitFor(() => {
    assert.equal(screen.getByTestId("trainer-board").getAttribute("data-position"), CATALOG_3PLY.fen);
  });
  fireEvent.click(screen.getByRole("button", { name: "Solution" }));
  await screen.findByText("Incorrect");
  await act(async () => {
    await sleep(450);
  });
  const posAfterFail = screen.getByTestId("trainer-board").getAttribute("data-position");
  fireEvent.keyDown(window, { key: "ArrowRight" });
  assert.equal(screen.getByTestId("trainer-board").getAttribute("data-position"), posAfterFail);

  cleanup();

  // 2. Caught-up mistakes queue with active filter keeps clear link
  ctl.search = "mode=mistakes&phase=middlegame&label=mistake";
  ctl.exercises = {};
  render(<PuzzleTrainer />);
  await screen.findByText("All caught up");
  const chip = screen.getByTestId("mistakes-filter-chip");
  assert.match(chip.textContent ?? "", /Middlegame · Mistake/);
  assert.equal(within(chip).getByRole("link", { name: "Clear filter" }).getAttribute("href"), "/puzzles/play?mode=mistakes");
});


