import type { BoardOrientation, BoardSession } from "./types";

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

// SIG-907: per-panel board lookup for split view. When `boardId` is set,
// resolve that session; fall back to the active board when absent or stale
// (mirrors the `withActive` boards[0]-fallback invariant so a stale panel id
// never renders blank after remote hydration replaces the placeholder).
export const selectBoard = (
  state: ActiveBoardState,
  boardId?: string,
): BoardSession =>
  boardId
    ? (state.boards.find((board) => board.id === boardId) ??
      selectActiveBoard(state))
    : selectActiveBoard(state);

// SIG-1092: the board marked as the repertoire for a color, if any.
// At most one board holds a given color (enforced by setBoardRepertoire and
// the partial unique index); returns null when none is marked.
export const selectRepertoireBoard = (
  state: { boards: BoardSession[] },
  color: BoardOrientation,
): BoardSession | null =>
  state.boards.find((board) => board.repertoireColor === color) ?? null;

// SIG-1092: autosave persist order. Moving the mark dirties both the old
// and new holders; persisting the mark UPDATE before the unmark UPDATE
// collides on boards_user_repertoire_color_uq when the new holder precedes
// the old one in `boards` order (and every retry repeats the same order).
// Unmarks sort first so the unique-slot handoff never overlaps.
export const compareRepertoirePersistOrder = (
  a: Pick<BoardSession, "repertoireColor">,
  b: Pick<BoardSession, "repertoireColor">,
): number => Number(a.repertoireColor !== null) - Number(b.repertoireColor !== null);

// SIG-857: primitive derivations so menu chrome re-renders only when the
// count changes instead of on every boards array identity change.
export const selectDirtyCount = (state: { boards: BoardSession[] }): number =>
  state.boards.reduce((count, board) => count + (board.dirty ? 1 : 0), 0);

export const selectActivePathKey = (state: ActiveBoardState): string =>
  selectActiveBoard(state).path.join(".");
