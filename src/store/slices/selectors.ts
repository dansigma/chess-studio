import type { BoardSession } from "./types";

type ActiveBoardState = {
  boards: BoardSession[];
  activeBoardId: string;
};

export const selectActiveBoardId = (_state: {
  boards: BoardSession[];
  activeBoardId: string;
}): string => _state.activeBoardId;

// SIG-857: single shared active-board lookup. Every consumer (store actions,
// hooks, components) goes through here instead of repeating
// `boards.find(...) ?? boards[0]` inline.
export const selectActiveBoard = (state: ActiveBoardState): BoardSession =>
  state.boards.find((board) => board.id === state.activeBoardId) ??
  state.boards[0];

// SIG-857: primitive derivations so menu chrome re-renders only when the
// count changes instead of on every boards array identity change.
export const selectDirtyCount = (state: { boards: BoardSession[] }): number =>
  state.boards.reduce((count, board) => count + (board.dirty ? 1 : 0), 0);

export const selectActivePathKey = (state: ActiveBoardState): string =>
  selectActiveBoard(state).path.join(".");
