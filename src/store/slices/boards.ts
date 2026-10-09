import { Chess } from "chess.js";
import type { StateCreator } from "zustand";
import {
  cloneTree,
  getFenAt,
  getLastMove,
  goBack,
  goEnd,
  goForward,
  goForwardN,
  goStart,
  insertLine,
  playMove,
} from "@/src/chess/tree";
import { repertoireMoves } from "@/src/chess/repertoire";
import { trainingAttempt } from "@/src/chess/training";
import { playMoveSound, shouldPlayMoveSound } from "@/src/chess/move-sound";
import { emptyBoard, newId, withActive } from "./board-helpers";
import { selectActiveBoard } from "./selectors";
import type { BoardSession, StudioState } from "./types";

// The bulk-playback flag suppresses per-move sounds while playUciSequence
// replays many moves, then plays a single advance sound at the end.
let suppressMoveSound = false;

function soundForAdvance(
  get: () => StudioState,
  previous: number[],
): void {
  if (suppressMoveSound) {
    return;
  }
  const state = get();
  if (
    shouldPlayMoveSound(state.settings.moveSound, previous, state.active().path)
  ) {
    playMoveSound();
  }
}

// Local navigation/move state: boards, selection, path, and training mode.
export type BoardsSlice = Pick<
  StudioState,
  | "boards"
  | "activeBoardId"
  | "training"
  | "trainingStart"
  | "active"
  | "fen"
  | "lastMove"
  | "sideToMove"
  | "newBoard"
  | "closeBoard"
  | "cloneBoard"
  | "setActiveBoard"
  | "makeUciMove"
  | "playUciSequence"
  | "insertEngineLines"
  | "goPath"
  | "back"
  | "forward"
  | "toStart"
  | "toEnd"
  | "skipForward"
  | "startTraining"
  | "stopTraining"
  | "undo"
  | "redo"
>;

export const initialBoardsState = {
  boards: [emptyBoard("Board", "initial-board")],
  // Matches the deterministic initial board id above (Workers forbids
  // crypto.randomUUID() at module init, so the placeholder id is fixed).
  activeBoardId: "initial-board",
  training: false,
  trainingStart: null,
};

export const createBoardsSlice: StateCreator<StudioState, [], [], BoardsSlice> = (
  set,
  get,
) => ({
  ...initialBoardsState,
  active: () => {
    return selectActiveBoard(get());
  },
  fen: () => {
    const board = get().active();
    return getFenAt(board.tree, board.path);
  },
  lastMove: () => {
    const board = get().active();
    return getLastMove(board.tree, board.path);
  },
  sideToMove: () => {
    const fen = get().fen();
    return fen.split(" ")[1] === "b" ? "b" : "w";
  },
  newBoard: () => {
    const board = emptyBoard();
    set((state) => ({
      boards: [...state.boards, board],
      activeBoardId: board.id,
      training: false,
      trainingStart: null,
    }));
  },
  closeBoard: (id) => {
    set((state) => {
      const target = id ?? state.activeBoardId;
      let boards = state.boards.filter((board) => board.id !== target);
      if (boards.length === 0) {
        boards = [emptyBoard()];
      }
      const activeBoardId =
        state.activeBoardId === target ? boards[0].id : state.activeBoardId;
      return { boards, activeBoardId, training: false, trainingStart: null };
    });
  },
  cloneBoard: () => {
    const current = get().active();
    const clone: BoardSession = {
      ...current,
      id: newId(),
      remoteId: null,
      title: `${current.title} copy`,
      tree: cloneTree(current.tree),
      path: [...current.path],
      headers: { ...current.headers },
      dirty: true,
      preview: false,
    };
    set((state) => ({
      boards: [...state.boards, clone],
      activeBoardId: clone.id,
      training: false,
      trainingStart: null,
    }));
  },
  setActiveBoard: (id) =>
    set({
      activeBoardId: id,
      enginePreview: null,
      setupMode: false,
      training: false,
      trainingStart: null,
    }),
  makeUciMove: (from, to, promotion) => {
    if (get().training) {
      const board = get().active();
      const uci = `${from}${to}${promotion ?? ""}`;
      const attempt = trainingAttempt(board.tree, board.path, uci);
      if (attempt.kind === "complete") {
        set({ statusMessage: "Line complete." });
        return false;
      }
      if (attempt.kind === "refused") {
        set({ statusMessage: "Not in the repertoire." });
        return false;
      }
      const previous = board.path;
      set((state) => ({
        statusMessage: repertoireMoves(board.tree, attempt.path).length === 0 ? "Line complete." : null,
        boards: withActive(state.boards, state.activeBoardId, (active) => ({
          ...active,
          path: attempt.path,
        })),
      }));
    soundForAdvance(get, previous);
      return true;
    }
    const board = get().active();
    const previous = board.path;
    const chess = new Chess(getFenAt(board.tree, previous));
    try {
      const move = chess.move({ from, to, promotion });
      const next = playMove(board.tree, previous, {
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion ?? ""}`,
        fen: chess.fen(),
        from: move.from,
        to: move.to,
      });
      set((state) => ({
        boards: withActive(state.boards, state.activeBoardId, (active) => ({
          ...active,
          tree: next.tree,
          path: next.path,
          dirty: true,
        })),
      }));
      soundForAdvance(get, previous);
      return true;
    } catch {
      // Surface the failure instead of dying silently: reaching here means a
      // legal-looking move could not be applied (corrupt tree/path state).
      set({ statusMessage: "That move could not be applied." });
      return false;
    }
  },
  playUciSequence: (ucis) => {
    if (get().training) {
      return;
    }
    const previous = get().active().path;
    set({ enginePreview: null });
    suppressMoveSound = true;
    try {
      for (const uci of ucis) {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci[4] : undefined;
        const ok = get().makeUciMove(from, to, promotion);
        if (!ok) {
          break;
        }
      }
    } finally {
      suppressMoveSound = false;
    }
    soundForAdvance(get, previous);
  },
  insertEngineLines: (fen, pvUcisList) => {
    if (get().training) {
      return;
    }
    // Stale guard: the engine may have been analyzing an older position when
    // the user clicked; never insert lines for a FEN the board has left.
    if (get().fen() !== fen) {
      return;
    }
    const board = get().active();
    let merged = board.tree;
    let inserted = 0;
    for (const pvUcis of pvUcisList) {
      const chess = new Chess(fen);
      const moves: {
        san: string;
        uci: string;
        fen: string;
        from: string;
        to: string;
      }[] = [];
      for (const uci of pvUcis) {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci[4] : undefined;
        try {
          const move = chess.move({ from, to, promotion });
          moves.push({
            san: move.san,
            uci: `${move.from}${move.to}${move.promotion ?? ""}`,
            fen: chess.fen(),
            from: move.from,
            to: move.to,
          });
        } catch {
          break;
        }
      }
      if (moves.length === 0) {
        continue;
      }
      merged = insertLine(merged, board.path, moves);
      inserted += 1;
    }
    if (inserted === 0) {
      set({ statusMessage: "Already in notation." });
      return;
    }
    const tree = merged;
    set((state) => ({
      statusMessage: `Inserted ${inserted} line${inserted === 1 ? "" : "s"}.`,
      boards: withActive(state.boards, state.activeBoardId, (active) => ({
        ...active,
        tree,
        dirty: true,
      })),
    }));
  },
  goPath: (path) => {
    if (get().training) {
      return;
    }
    const previous = get().active().path;
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        path,
      })),
    }));
    soundForAdvance(get, previous);
  },
  back: () => {
    if (get().training) {
      return;
    }
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        path: goBack(board.path),
      })),
    }));
  },
  forward: () => {
    if (get().training) {
      return;
    }
    const previous = get().active().path;
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        path: goForward(board.tree, board.path),
      })),
    }));
    soundForAdvance(get, previous);
  },
  toStart: () => {
    if (get().training) {
      return;
    }
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        path: goStart(),
      })),
    }));
  },
  toEnd: () => {
    if (get().training) {
      return;
    }
    const previous = get().active().path;
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        path: goEnd(board.tree, board.path),
      })),
    }));
    soundForAdvance(get, previous);
  },
  skipForward: () => {
    if (get().training) {
      return;
    }
    const previous = get().active().path;
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        path: goForwardN(board.tree, board.path, 10),
      })),
    }));
    soundForAdvance(get, previous);
  },
  startTraining: () => {
    const state = get();
    if (state.training && state.trainingStart) {
      const start = state.trainingStart;
      set((current) => ({
        statusMessage: null,
        boards: withActive(current.boards, current.activeBoardId, (board) => ({
          ...board,
          path: [...start],
        })),
      }));
      const board = get().active();
      if (repertoireMoves(board.tree, board.path).length === 0) {
        set({ statusMessage: "Line complete." });
      }
      return;
    }
    const board = state.active();
    const start = [...board.path];
    set({
      training: true,
      trainingStart: start,
      statusMessage: repertoireMoves(board.tree, start).length === 0 ? "Line complete." : null,
    });
  },
  stopTraining: () => set({ training: false, trainingStart: null }),
  undo: () => get().back(),
  redo: () => get().forward(),
});
