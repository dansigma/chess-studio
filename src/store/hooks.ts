"use client";

import { getFenAt, getLastMove } from "@/src/chess/tree";
import { useStudioStore, type BoardSession } from "@/src/store/studio-store";

export function useActiveBoard(): BoardSession {
  return useStudioStore((state) => {
    return state.boards.find((board) => board.id === state.activeBoardId) ?? state.boards[0];
  });
}

export function useActiveFen(): string {
  return useStudioStore((state) => {
    const board =
      state.boards.find((item) => item.id === state.activeBoardId) ?? state.boards[0];
    return getFenAt(board.tree, board.path);
  });
}

export function useBoardFen(): string {
  return useStudioStore((state) => {
    if (state.enginePreview) {
      return state.enginePreview.fen;
    }
    const board =
      state.boards.find((item) => item.id === state.activeBoardId) ?? state.boards[0];
    return getFenAt(board.tree, board.path);
  });
}

export function useLastMoveSquares(): string {
  return useStudioStore((state) => {
    const board =
      state.boards.find((item) => item.id === state.activeBoardId) ?? state.boards[0];
    const move = getLastMove(board.tree, board.path);
    return move ? `${move.from}${move.to}` : "";
  });
}

export function useBoardLastMoveSquares(): string {
  return useStudioStore((state) => {
    if (state.enginePreview) {
      return state.enginePreview.lastMove;
    }
    const board =
      state.boards.find((item) => item.id === state.activeBoardId) ?? state.boards[0];
    const move = getLastMove(board.tree, board.path);
    return move ? `${move.from}${move.to}` : "";
  });
}

export function useSideToMove(): "w" | "b" {
  const fen = useActiveFen();
  return fen.split(" ")[1] === "b" ? "b" : "w";
}
