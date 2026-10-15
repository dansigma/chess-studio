"use client";

import { Chessboard } from "react-chessboard";
import { boardSquareStyles, type BoardTheme } from "@/src/chess/board-themes";
import { piecesForSet, type PieceSet } from "@/src/chess/piece-sets";
import { squareAnchor } from "./feedback";
import type { PuzzleFeedback } from "./use-puzzle-feedback";
import type { PuzzleSession } from "./use-puzzle-session";

export function PuzzleBoard({
  session,
  feedback,
  boardTheme,
  pieceSet,
  showCoordinates,
}: {
  session: PuzzleSession;
  feedback: PuzzleFeedback;
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  showCoordinates: boolean;
}) {
  const { puzzle, fen, status, last, selected, userTurn, gained, onDrop, setSelected } = session;
  const { orientation, squareStyles, arrows, dests } = feedback;

  if (!puzzle) {
    return null;
  }

  const themeStyles = boardSquareStyles(boardTheme);
  const pieces = piecesForSet(pieceSet);

  return (
    <div className="flex h-full min-h-0 w-full items-center justify-center [container-type:size]">
      <div className="relative size-[min(100cqw,100cqh,520px)] overflow-hidden rounded-lg shadow-[0_6px_20px_rgb(0_0_0/0.28)] ring-1 ring-studio-border-strong">
        <Chessboard
          key={`${puzzle.id}-${pieceSet}`}
          options={{
            id: `puzzle-${puzzle.id}`,
            position: fen,
            boardOrientation: orientation,
            showNotation: showCoordinates,
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
              if (!targetSquare) {
                return false;
              }
              return onDrop(sourceSquare, targetSquare);
            },
            onSquareClick: ({ square, piece }) => {
              if (!userTurn) {
                return;
              }
              if (selected && dests.includes(square)) {
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
        {status === "solved" && gained > 0 && last ? (
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
