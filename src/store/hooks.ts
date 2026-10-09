"use client";

import { getFenAt, getLastMove } from "@/src/chess/tree";
import {
  selectActiveBoard,
  selectActiveBoardId,
  selectActivePathKey,
  useStudioStore,
  type BoardSession,
} from "@/src/store/studio-store";

// SIG-857: all board lookups funnel through selectActiveBoard so components
// subscribe to the resolved board instead of repeating the find inline.
export function useActiveBoard(): BoardSession {
  return useStudioStore(selectActiveBoard);
}

export function useActiveBoardId(): string {
  return useStudioStore(selectActiveBoardId);
}

export function useActivePathKey(): string {
  return useStudioStore(selectActivePathKey);
}

export function useActiveFen(): string {
  return useStudioStore((state) => {
    const board = selectActiveBoard(state);
    return getFenAt(board.tree, board.path);
  });
}

export function useBoardFen(): string {
  return useStudioStore((state) => {
    if (state.enginePreview) {
      return state.enginePreview.fen;
    }
    const board = selectActiveBoard(state);
    return getFenAt(board.tree, board.path);
  });
}

export function useLastMoveSquares(): string {
  return useStudioStore((state) => {
    const board = selectActiveBoard(state);
    const move = getLastMove(board.tree, board.path);
    return move ? `${move.from}${move.to}` : "";
  });
}

export function useBoardLastMoveSquares(): string {
  return useStudioStore((state) => {
    if (state.enginePreview) {
      return state.enginePreview.lastMove;
    }
    const board = selectActiveBoard(state);
    const move = getLastMove(board.tree, board.path);
    return move ? `${move.from}${move.to}` : "";
  });
}

export function useSideToMove(): "w" | "b" {
  const fen = useActiveFen();
  return fen.split(" ")[1] === "b" ? "b" : "w";
}
