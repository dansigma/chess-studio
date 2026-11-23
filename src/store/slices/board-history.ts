import { selectActiveBoard } from "./selectors";
import type { BoardSession, StudioState } from "./types";

const HISTORY_LIMIT = 100;

type Snapshot = Pick<BoardSession, "tree" | "path" | "headers" | "title" | "reviewAnnotateUndo">;
type Edit = { before: Snapshot; after: Snapshot };
type History = { undo: Edit[]; redo: Edit[] };

export type BoardHistories = ReadonlyMap<string, History>;

function snapshot({ tree, path, headers, title, reviewAnnotateUndo }: BoardSession): Snapshot {
  return { tree, path, headers, title, reviewAnnotateUndo };
}

function canUseHistory(state: StudioState): boolean {
  return !state.training && !state.retry.active && !state.setupMode;
}

function matches(board: BoardSession, version: Snapshot): boolean {
  return board.tree === version.tree && board.headers === version.headers &&
    board.reviewAnnotateUndo === version.reviewAnnotateUndo;
}

export function editBoard(
  state: StudioState,
  update: (board: BoardSession) => BoardSession,
  board = selectActiveBoard(state),
): Partial<StudioState> {
  const next = update(board);
  if (next === board) return {};

  const boards = state.boards.map((item) => item === board ? next : item);
  if (matches(board, next)) return { boards };

  const boardHistories = new Map(state.boardHistories);
  const undo = historyFor(state, board)?.undo ?? [];
  boardHistories.set(board.id, {
    undo: [...undo.slice(1 - HISTORY_LIMIT), { before: snapshot(board), after: snapshot(next) }],
    redo: [],
  });
  return {
    boards,
    boardHistories,
    pendingCutUndo: state.pendingCutUndo?.boardId === board.id ? null : state.pendingCutUndo,
  };
}

function historyFor(state: StudioState, board: BoardSession): History | undefined {
  const history = state.boardHistories.get(board.id);
  const version = history?.undo.at(-1)?.after ?? history?.redo.at(-1)?.before;
  return version && matches(board, version) ? history : undefined;
}

export function canStepBoardHistory(state: StudioState, direction: keyof History): boolean {
  if (!canUseHistory(state)) return false;
  return Boolean(historyFor(state, selectActiveBoard(state))?.[direction].length);
}

export function stepBoardHistory(
  state: StudioState,
  direction: keyof History,
  board = selectActiveBoard(state),
): Partial<StudioState> {
  const history = historyFor(state, board);
  const edit = history?.[direction].at(-1);
  if (!history || !edit) return {};

  const undoing = direction === "undo";
  const from = undoing ? edit.after : edit.before;
  const to = undoing ? edit.before : edit.after;
  const boardHistories = new Map(state.boardHistories);
  boardHistories.set(board.id, {
    undo: undoing ? history.undo.slice(0, -1) : [...history.undo, edit],
    redo: undoing ? [...history.redo, edit] : history.redo.slice(0, -1),
  });

  return {
    boardHistories,
    boards: state.boards.map((item) => item === board ? {
      ...item,
      ...to,
      // The title is part of a headers edit only if a tab rename hasn't superseded it.
      title: from.headers !== to.headers && item.title === from.title ? to.title : item.title,
      dirty: true,
    } : item),
    enginePreview: null,
    threat: null,
    variationChoice: null,
    pendingCutUndo: state.pendingCutUndo?.boardId === board.id ? null : state.pendingCutUndo,
  };
}

export function pruneBoardHistories(state: StudioState): BoardHistories {
  // A board can be closed or replaced by imports, setup, or hydration outside editBoard.
  const valid = new Map<string, History>();
  for (const board of state.boards) {
    const history = historyFor(state, board);
    if (history) valid.set(board.id, history);
  }
  return valid.size === state.boardHistories.size ? state.boardHistories : valid;
}
