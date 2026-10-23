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
    // SIG-1092: new boards carry no repertoire mark; the mark is assigned
    // explicitly via setBoardRepertoire, never inherited.
    repertoireColor: null,
    dirty: true,
    preview: false,
  };
}

export function withActive(
  boards: BoardSession[],
  activeBoardId: string,
  updater: (board: BoardSession) => BoardSession,
): BoardSession[] {
  // Resolve to the SAME board the UI reads: selectActiveBoard() falls back to
  // boards[0] when activeBoardId does not match. Without the same fallback
  // here, a stale activeBoardId turns every write into a silent no-op while
  // reads keep rendering boards[0] — the board looks healthy but no move,
  // navigation, or load ever lands.
  const target = boards.some((board) => board.id === activeBoardId)
    ? activeBoardId
    : boards[0]?.id;
  return boards.map((board) =>
    board.id === target ? updater(board) : board,
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

// SIG-915: browser-style tab close ordering. Closing the active tab focuses
// the previous tab, or the next when there is no previous (closed the first
// tab). Returns null when the closed board is the only one (caller reseeds).
export function nextActiveBoardId(
  boards: BoardSession[],
  closedId: string,
): string | null {
  const index = boards.findIndex((board) => board.id === closedId);
  if (index < 0) {
    return null;
  }
  if (index > 0) {
    return boards[index - 1].id;
  }
  return boards[index + 1]?.id ?? null;
}
