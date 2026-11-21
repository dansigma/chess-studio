import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { compilePuzzle } from "./engine";
import { emptyProgress } from "./engine";
import type { PuzzleFeedback } from "./use-puzzle-feedback";
import type { PuzzleSession } from "./use-puzzle-session";

let latestOptions: {
  position?: string;
  boardOrientation?: "white" | "black";
  onPieceDrop?: (args: { sourceSquare: string; targetSquare: string | null }) => boolean;
  onSquareClick?: (args: { square: string; piece?: { pieceType: string } | null }) => void;
} = {};

const realChessboard = await import("react-chessboard");
mock.module("react-chessboard", {
  namedExports: {
    ...realChessboard,
    Chessboard: ({ options }: { options: typeof latestOptions }) => {
      latestOptions = options;
      return <div data-testid="mock-chessboard" data-position={options.position} />;
    },
  },
});

const { PuzzleBoard, promotionOverlayAnchor } = await import("./PuzzleBoard.tsx");

const PROMO_PUZZLE = compilePuzzle({
  id: "promo-under",
  fen: "5rk1/4P3/6N1/8/8/8/8/4K3 w - - 0 1",
  moves: ["exf8=N"],
  rating: 1400,
  themes: ["promotion"],
});

function makeSession(overrides: Partial<PuzzleSession> = {}): PuzzleSession {
  return {
    puzzle: PROMO_PUZZLE,
    fen: PROMO_PUZZLE.fen,
    ply: 0,
    status: "playing",
    last: null,
    viewPly: null,
    scrubFrames: [],
    canScrub: false,
    stepView: () => {},
    selected: null,
    hintLevel: 0,
    reveal: false,
    miss: null,
    wrongTick: 0,
    correctTick: 0,
    sessionSolved: 0,
    strikes: 0,
    sessionOver: false,
    secondsLeft: 180,
    loadError: false,
    exhausted: false,
    caughtUp: false,
    nextDue: null,
    mistakesTotal: 0,
    mistakesIndex: 0,
    progress: emptyProgress(),
    delta: 0,
    gained: 0,
    xpResult: null,
    sessionXp: 0,
    sessionStart: null,
    attempts: [],
    summaryVisible: false,
    dueMistakes: null,
    finishSession: () => {},
    userTurn: true,
    expected: PROMO_PUZZLE.uci[0],
    onDrop: () => true,
    giveUp: () => {},
    nextPuzzle: () => {},
    retry: () => {},
    setSelected: () => {},
    setHintLevel: () => {},
    ...overrides,
  };
}

function makeFeedback(overrides: Partial<PuzzleFeedback> = {}): PuzzleFeedback {
  return {
    dests: [],
    orientation: "white",
    solverMoves: 1,
    solverIndex: 1,
    modeLabel: "Rated",
    continueLabel: "Next puzzle",
    sideToMove: "White",
    runStreak: 0,
    level: { level: 1, into: 0, span: 100, toNext: 100 },
    bubbleTitle: "White to move",
    bubbleBody: "Find the best move.",
    squareStyles: {},
    arrows: [],
    ...overrides,
  };
}

before(() => setupDom());
after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  latestOptions = {};
});

test("promotionOverlayAnchor respects white and black orientation", () => {
  assert.deepEqual(promotionOverlayAnchor("f8", "white"), { leftPercent: 62.5, atTop: true });
  assert.deepEqual(promotionOverlayAnchor("f8", "black"), { leftPercent: 25, atTop: false });
  assert.deepEqual(promotionOverlayAnchor("a1", "black"), { leftPercent: 87.5, atTop: true });
  assert.deepEqual(promotionOverlayAnchor("a1", "white"), { leftPercent: 0, atTop: false });
  assert.equal(promotionOverlayAnchor("bad", "white"), null);
});

test("drag promotion opens Q/R/B/N chooser with active pieceSet and submits underpromotion", () => {
  const drops: Array<[string, string, string | undefined]> = [];
  const session = makeSession({
    onDrop: (from, to, promotion) => {
      drops.push([from, to, promotion]);
      return true;
    },
  });

  render(
    <PuzzleBoard
      session={session}
      feedback={makeFeedback()}
      boardTheme="studio"
      pieceSet="cburnett"
      showCoordinates={true}
      locale="en"
    />,
  );

  let dropped: boolean | undefined;
  act(() => {
    dropped = latestOptions.onPieceDrop?.({ sourceSquare: "e7", targetSquare: "f8" });
  });
  assert.equal(dropped, false, "drop waits until user picks promotion piece");
  assert.equal(drops.length, 0);

  const picker = screen.getByTestId("promotion-picker");
  assert.equal(picker.getAttribute("role"), "dialog");
  assert.equal(picker.getAttribute("aria-modal"), "true");
  assert.ok(picker.hasAttribute("data-promotion-open"));
  assert.match(picker.className, /bg-studio-elevated/);
  assert.match(picker.className, /border-studio-border-strong/);
  assert.equal(picker.style.left, "62.5%");

  const buttons = within(picker).getAllByRole("button");
  assert.deepEqual(
    buttons.map((b) => b.getAttribute("data-promotion-piece")),
    ["q", "r", "b", "n"],
  );
  const knightImg = within(buttons[3] as HTMLElement).getByRole("presentation", { hidden: true }) as HTMLImageElement;
  assert.match(knightImg.src, /\/cburnett\/wN\.svg$/);

  fireEvent.click(buttons[3] as HTMLElement);
  assert.deepEqual(drops, [["e7", "f8", "n"]]);
  assert.equal(screen.queryByTestId("promotion-picker"), null);
});

test("click-to-move promotion opens chooser and dismisses via Escape or outside click", () => {
  const drops: Array<[string, string, string | undefined]> = [];
  const session = makeSession({
    selected: "e7",
    onDrop: (from, to, promotion) => {
      drops.push([from, to, promotion]);
      return true;
    },
  });
  const feedback = makeFeedback({ dests: ["f8", "e8"] });

  render(
    <PuzzleBoard
      session={session}
      feedback={feedback}
      boardTheme="studio"
      pieceSet="classic"
      showCoordinates={true}
      locale="en"
    />,
  );

  act(() => {
    latestOptions.onSquareClick?.({ square: "f8", piece: { pieceType: "bR" } });
  });
  const picker = screen.getByTestId("promotion-picker");
  assert.ok(picker.querySelector("svg"), "classic pieceSet renders SVG pieces");

  fireEvent.keyDown(window, { key: "Escape" });
  assert.equal(screen.queryByTestId("promotion-picker"), null);
  assert.equal(drops.length, 0);

  // Reopen via click-to-move and dismiss on backdrop click
  act(() => {
    latestOptions.onSquareClick?.({ square: "f8", piece: { pieceType: "bR" } });
  });
  screen.getByTestId("promotion-picker");
  fireEvent.click(screen.getByTestId("promotion-backdrop"));
  assert.equal(screen.queryByTestId("promotion-picker"), null);
  assert.equal(drops.length, 0);
});

test("promotion chooser closes automatically when position or puzzle changes and supports keyboard", () => {
  const drops: Array<[string, string, string | undefined]> = [];
  const session = makeSession({
    onDrop: (from, to, promotion) => {
      drops.push([from, to, promotion]);
      return true;
    },
  });

  const view = render(
    <PuzzleBoard
      session={session}
      feedback={makeFeedback()}
      boardTheme="studio"
      pieceSet="classic"
      showCoordinates={true}
      locale="en"
    />,
  );

  act(() => {
    latestOptions.onPieceDrop?.({ sourceSquare: "e7", targetSquare: "f8" });
  });
  const picker = screen.getByTestId("promotion-picker");
  fireEvent.keyDown(picker, { key: "n" });
  assert.deepEqual(drops, [["e7", "f8", "n"]]);
  assert.equal(screen.queryByTestId("promotion-picker"), null);

  // Open again, then change puzzle FEN -> auto-closes
  act(() => {
    latestOptions.onPieceDrop?.({ sourceSquare: "e7", targetSquare: "f8" });
  });
  screen.getByTestId("promotion-picker");
  view.rerender(
    <PuzzleBoard
      session={makeSession({ puzzle: { ...PROMO_PUZZLE, id: "other" } })}
      feedback={makeFeedback()}
      boardTheme="studio"
      pieceSet="classic"
      showCoordinates={true}
      locale="en"
    />,
  );
  assert.equal(screen.queryByTestId("promotion-picker"), null);
});

test("award badge only shows at live post-solve state and hides while scrubbing", () => {
  const solvedBase = {
    status: "solved" as const,
    userTurn: false,
    gained: 24,
    last: { from: "e7", to: "f8" },
  };
  const view = render(
    <PuzzleBoard
      session={makeSession({ ...solvedBase, viewPly: null })}
      feedback={makeFeedback()}
      boardTheme="studio"
      pieceSet="classic"
      showCoordinates={true}
      locale="en"
    />,
  );
  screen.getByText("+24");

  view.rerender(
    <PuzzleBoard
      session={makeSession({ ...solvedBase, viewPly: 0 })}
      feedback={makeFeedback()}
      boardTheme="studio"
      pieceSet="classic"
      showCoordinates={true}
      locale="en"
    />,
  );
  assert.equal(screen.queryByText("+24"), null);
});
