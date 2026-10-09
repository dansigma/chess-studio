import { START_FEN, createEmptyTree, getFenAt } from "@/src/chess/tree";
import type { BoardSession } from "./types";
import { selectActiveBoard } from "./selectors";

export function newId(): string {
  return crypto.randomUUID();
}

// NOTE: id must be injectable — Workers forbids crypto.randomUUID() during
// global-scope (module init) evaluation ("Disallowed operation called within
// global scope... generating random values are not allowed within global
// scope"). The initial store board passes a deterministic id; every other
// call site runs inside handlers/effects, where newId() is allowed.
export function emptyBoard(title = "Board", id = newId()): BoardSession {
  return {
    id,
    remoteId: null,
    title,
    tree: createEmptyTree(),
    path: [],
    headers: {},
    orientation: "white",
    dirty: true,
    preview: false,
  };
}

export function withActive(
  boards: BoardSession[],
  activeBoardId: string,
  updater: (board: BoardSession) => BoardSession,
): BoardSession[] {
  return boards.map((board) =>
    board.id === activeBoardId ? updater(board) : board,
  );
}

export function analysisFen(state: {
  boards: BoardSession[];
  activeBoardId: string;
}): string {
  const analysis =
    state.boards.find((board) => !board.preview) ?? selectActiveBoard(state);
  return analysis ? getFenAt(analysis.tree, analysis.path) : START_FEN;
}
