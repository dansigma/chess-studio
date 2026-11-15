"use client";

import { Chessboard } from "react-chessboard";
import { boardCoordinateOptions, boardSquareStyles } from "@/src/chess/board-themes";
import type { BoardMarks } from "@/src/chess/marks";
import { mergeStudyArrows, mergeStudySquareStyles } from "./study-marks.ts";
import { piecesForSet } from "@/src/chess/piece-sets";
import { useStudioStore } from "@/src/store/studio-store";

export type StudyBoardSquareStyles = Record<
  string,
  { backgroundColor?: string; backgroundImage?: string; boxShadow?: string }
>;

export type StudyBoardArrow = { startSquare: string; endSquare: string; color: string };

type PieceInfo = { pieceType: string };

/** react-chessboard wrapper with theme, pieces and coordinates taken from the studio settings. */
export function StudyBoard({
  id,
  fen,
  orientation,
  arrows = [],
  marks,
  squareStyles = {},
  interactive = false,
  canDragPiece,
  onMove,
  onSquareClick,
}: {
  id: string;
  fen: string;
  orientation: "white" | "black";
  arrows?: StudyBoardArrow[];
  /** The author's marks; arrows given above are drawn on top, square styles given below win. */
  marks?: BoardMarks;
  squareStyles?: StudyBoardSquareStyles;
  /** When false the board is display-only: no dragging, moves or square clicks. */
  interactive?: boolean;
  canDragPiece?: (args: { piece: PieceInfo }) => boolean;
  /** Return true to accept the move. */
  onMove?: (from: string, to: string) => boolean;
  onSquareClick?: (args: { square: string; piece: PieceInfo | null }) => void;
}) {
  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const showCoordinates = useStudioStore((state) => state.settings.showCoordinates);
  const theme = boardSquareStyles(boardTheme);
  return (
    <Chessboard
      key={`${id}-${pieceSet}`}
      options={{
        id,
        position: fen,
        boardOrientation: orientation,
        showNotation: showCoordinates,
        ...boardCoordinateOptions(boardTheme),
        animationDurationInMs: 0,
        showAnimations: false,
        allowDrawingArrows: false,
        clearArrowsOnClick: false,
        clearArrowsOnPositionChange: false,
        arrows: mergeStudyArrows(marks, arrows),
        lightSquareStyle: theme.light,
        darkSquareStyle: theme.dark,
        squareStyles: mergeStudySquareStyles(marks, squareStyles),
        pieces: piecesForSet(pieceSet),
        boardStyle: { width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" },
        canDragPiece: ({ piece }) => (interactive ? (canDragPiece ? canDragPiece({ piece }) : true) : false),
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          if (!interactive || !targetSquare || !onMove) {
            return false;
          }
          return onMove(sourceSquare, targetSquare);
        },
        onSquareClick: ({ square, piece }) => {
          if (interactive) {
            onSquareClick?.({ square, piece });
          }
        },
      }}
    />
  );
}
