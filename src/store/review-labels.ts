// SIG-1219: the finished (or partial) Game Review labels of the board the
// Review panel is on, keyed by `path.join(".")`. The review itself lives in
// ReviewPanel's hook; the notation list and the board only need "which tier is
// this move", so ReviewPanel publishes that here and they subscribe.
import { create } from "zustand";
import type { ReviewLabel } from "@/src/chess/review";
import { useActiveBoardId } from "./hooks";

export type ReviewLabelMap = ReadonlyMap<string, ReviewLabel>;

const EMPTY: ReviewLabelMap = new Map();

type State = {
  boardId: string | null;
  labels: ReviewLabelMap;
  set: (boardId: string | null, labels: ReviewLabelMap) => void;
};

export const useReviewLabelsStore = create<State>((set) => ({
  boardId: null,
  labels: EMPTY,
  set: (boardId, labels) => set({ boardId, labels }),
}));

/** Labels for `boardId`, or an empty map when the review belongs to another board. */
export function useReviewLabels(boardId: string): ReviewLabelMap {
  return useReviewLabelsStore((state) => (state.boardId === boardId ? state.labels : EMPTY));
}

/** The tier of the move at `pathKey` on the active board, if the review has scored it. */
export function useReviewTier(pathKey: string): ReviewLabel | undefined {
  const boardId = useActiveBoardId();
  return useReviewLabelsStore((state) => (state.boardId === boardId ? state.labels.get(pathKey) : undefined));
}
