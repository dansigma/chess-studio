"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Chessboard } from "react-chessboard";
import { boardCoordinateOptions, boardSquareStyles, type BoardTheme } from "@/src/chess/board-themes";
import { piecesForSet, type PieceSet } from "@/src/chess/piece-sets";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
import { useDialogFocus } from "@/src/studio/ui/use-dialog-focus";
import { isPromotionMove, PROMOTION_PIECES, type PromotionPiece } from "./engine";
import { squareAnchor } from "./feedback";
import type { PuzzleFeedback } from "./use-puzzle-feedback";
import type { PuzzleSession } from "./use-puzzle-session";

export function promotionOverlayAnchor(
  square: string,
  orientation: "white" | "black",
): { leftPercent: number; atTop: boolean } | null {
  if (!/^[a-h][1-8]$/.test(square)) {
    return null;
  }
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const col = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;
  return { leftPercent: col * 12.5, atTop: row < 4 };
}

type PendingPromotion = {
  from: string;
  to: string;
  fen: string;
  puzzleId: string;
};

const PROMOTION_ARIA_KEYS: Record<PromotionPiece, "puzzle.promotion.q" | "puzzle.promotion.r" | "puzzle.promotion.b" | "puzzle.promotion.n"> = {
  q: "puzzle.promotion.q",
  r: "puzzle.promotion.r",
  b: "puzzle.promotion.b",
  n: "puzzle.promotion.n",
};

export function PuzzleBoard({
  session,
  feedback,
  boardTheme,
  pieceSet,
  showCoordinates,
  locale = "en",
}: {
  session: PuzzleSession;
  feedback: PuzzleFeedback;
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  showCoordinates: boolean;
  locale?: SiteLocale;
}) {
  const { puzzle, fen, status, last, viewPly, selected, userTurn, gained, onDrop, setSelected } = session;
  const { orientation, squareStyles, arrows, dests } = feedback;
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const activePromotion =
    puzzle &&
    pendingPromotion &&
    userTurn &&
    pendingPromotion.fen === fen &&
    pendingPromotion.puzzleId === puzzle.id
      ? pendingPromotion
      : null;

  useDialogFocus(pickerRef, activePromotion !== null);

  useEffect(() => {
    if (!activePromotion) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setPendingPromotion(null);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activePromotion]);

  if (!puzzle) {
    return null;
  }

  const themeStyles = boardSquareStyles(boardTheme);
  const pieces = piecesForSet(pieceSet);
  const promotingColor = fen.split(" ")[1] === "b" ? "b" : "w";
  const anchor = activePromotion ? promotionOverlayAnchor(activePromotion.to, orientation) : null;

  function submitPromotion(piece: PromotionPiece) {
    if (!activePromotion) {
      return;
    }
    const { from, to } = activePromotion;
    setPendingPromotion(null);
    onDrop(from, to, piece);
  }

  function onPickerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!activePromotion || !anchor) {
      return;
    }
    const lower = event.key.toLowerCase();
    if (lower === "q" || lower === "r" || lower === "b" || lower === "n") {
      event.preventDefault();
      event.stopPropagation();
      submitPromotion(lower);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const buttons = Array.from(pickerRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (buttons.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const visualStep = event.key === "ArrowDown" ? 1 : -1;
    const domStep = anchor.atTop ? visualStep : -visualStep;
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (baseIndex + domStep + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  }

  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center [container-type:size]">
      <div className="relative size-[min(100cqw,100cqh,520px)] lg:size-[min(100cqw,100cqh)] overflow-hidden rounded-lg shadow-[0_6px_20px_rgb(0_0_0/0.28)] ring-1 ring-studio-border-strong">
        <Chessboard
          key={`${puzzle.id}-${pieceSet}`}
          options={{
            id: `puzzle-${puzzle.id}`,
            position: fen,
            boardOrientation: orientation,
            showNotation: showCoordinates,
            ...boardCoordinateOptions(boardTheme),
            animationDurationInMs: 180,
            allowDrawingArrows: false,
            clearArrowsOnClick: false,
            clearArrowsOnPositionChange: false,
            arrows,
            lightSquareStyle: themeStyles.light,
            darkSquareStyle: themeStyles.dark,
            squareStyles,
            pieces,
            boardStyle: { width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" },
            canDragPiece: ({ piece }) => {
              if (!userTurn) {
                return false;
              }
              const color = piece.pieceType.startsWith("w") ? "w" : "b";
              return color === (orientation === "black" ? "b" : "w");
            },
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              if (!userTurn || !targetSquare) {
                return false;
              }
              if (isPromotionMove(fen, sourceSquare, targetSquare)) {
                setPendingPromotion({ from: sourceSquare, to: targetSquare, fen, puzzleId: puzzle.id });
                setSelected(null);
                return false;
              }
              return onDrop(sourceSquare, targetSquare);
            },
            onSquareClick: ({ square, piece }) => {
              if (!userTurn) {
                return;
              }
              if (selected && dests.includes(square)) {
                if (isPromotionMove(fen, selected, square)) {
                  setPendingPromotion({ from: selected, to: square, fen, puzzleId: puzzle.id });
                  setSelected(null);
                  return;
                }
                onDrop(selected, square);
                return;
              }
              if (piece) {
                const color = piece.pieceType.startsWith("w") ? "w" : "b";
                if (color === (orientation === "black" ? "b" : "w")) {
                  setSelected(square);
                  return;
                }
              }
              setSelected(null);
            },
          }}
        />
        {activePromotion && anchor ? (
          <div
            className="absolute inset-0 z-20 bg-studio-scrim"
            onClick={() => setPendingPromotion(null)}
            data-testid="promotion-backdrop"
          >
            <div
              ref={pickerRef}
              role="dialog"
              aria-modal="true"
              aria-label={tPuzzle(locale, "puzzle.promotion.dialog")}
              data-promotion-open=""
              data-testid="promotion-picker"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={onPickerKeyDown}
              className={`absolute z-30 flex w-[12.5%] overflow-hidden rounded-lg border border-studio-border-strong bg-studio-elevated shadow-2xl ${
                anchor.atTop ? "top-0 flex-col" : "bottom-0 flex-col-reverse"
              }`}
              style={{ left: `${anchor.leftPercent}%` }}
            >
              {PROMOTION_PIECES.map((piece) => {
                const code = `${promotingColor}${piece.toUpperCase()}`;
                const renderPiece = pieces[code];
                return (
                  <button
                    key={piece}
                    type="button"
                    aria-label={tPuzzle(locale, PROMOTION_ARIA_KEYS[piece])}
                    data-promotion-piece={piece}
                    onClick={() => submitPromotion(piece)}
                    className="flex aspect-square w-full items-center justify-center p-1 hover:bg-studio-hover-strong focus-visible:bg-studio-hover-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-studio-accent"
                  >
                    {renderPiece ? renderPiece({ svgStyle: { width: "100%", height: "100%" } }) : piece.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {status === "solved" && gained > 0 && last && viewPly == null ? (
          <Award square={last.to} orientation={orientation} points={gained} />
        ) : null}
      </div>
    </div>
  );
}

function Award({
  square,
  orientation,
  points,
}: {
  square: string;
  orientation: "white" | "black";
  points: number;
}) {
  const anchor = squareAnchor(square, orientation);
  if (!anchor) {
    return null;
  }
  return (
    <span
      className="pointer-events-none absolute z-10 rounded-full bg-studio-success px-2 py-0.5 text-caption font-semibold text-white"
      style={{
        left: `${anchor.x * 100}%`,
        top: `${anchor.y * 100}%`,
        animation: "puzzle-award 900ms ease-out forwards",
      }}
    >
      +{points}
    </span>
  );
}
