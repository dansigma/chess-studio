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
import {
  getDueRepertoireMoves,
  repertoireMoveKey,
  repertoireMoves,
  scheduleReview,
} from "@/src/chess/repertoire";
import { trainingAttempt } from "@/src/chess/training";
import {
  hydrateRepertoireProgress,
  readLocalRepertoireProgress,
  saveRepertoireProgress,
} from "@/src/lib/repertoire-progress";
import {
  hydrateExercises,
  readLocalExercises,
  saveExercises,
} from "@/src/lib/mistake-exercises-store";
import { playMoveSound, shouldPlayMoveSound } from "@/src/chess/move-sound";
import { emptyBoard, newId, nextActiveBoardId, withActive } from "./board-helpers";
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
  | "boardsHydrated"
  | "training"
  | "trainingStart"
  | "drillDueOnly"
  | "repertoireProgress"
  | "mistakeExercises"
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
  | "startDueDrill"
  | "recordRepertoireMove"
  | "setRepertoireProgress"
  | "hydrateRepertoire"
  | "setMistakeExercises"
  | "hydrateMistakeExercises"
  | "undo"
  | "redo"
  | "setBoardsHydrated"
  | "hydrateRemoteBoard"
  | "markSaved"
>;

export const initialBoardsState = {
  boards: [emptyBoard("Board", "initial-board")],
  // Matches the deterministic initial board id above (Workers forbids
  // crypto.randomUUID() at module init, so the placeholder id is fixed).
  activeBoardId: "initial-board",
  // SIG-907: gates restore-time orphan pruning. The dock restores its layout
  // before remote boards hydrate, so StudioDock must place verbatim until the
  // shell flips this after the boards query settles — pruning earlier would
  // drop valid `board:*` panels whose sessions have not loaded yet.
  boardsHydrated: false,
  training: false,
  trainingStart: null,
  drillDueOnly: false,
  repertoireProgress: typeof window !== "undefined" ? readLocalRepertoireProgress() : {},
  mistakeExercises: typeof window !== "undefined" ? readLocalExercises() : {},
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
      threat: null,
      training: false,
      trainingStart: null,
    }));
  },
  closeBoard: (id) => {
    set((state) => {
      const target = id ?? state.activeBoardId;
      // SIG-915: closing the active tab focuses the previous tab (else next),
      // like browser tabs. Non-active closes keep the current active id.
      const neighbor =
        state.activeBoardId === target
          ? nextActiveBoardId(state.boards, target)
          : state.activeBoardId;
      let boards = state.boards.filter((board) => board.id !== target);
      if (boards.length === 0) {
        boards = [emptyBoard()];
      }
      const activeBoardId = neighbor ?? boards[0].id;
      return { boards, activeBoardId, threat: null, training: false, trainingStart: null, drillDueOnly: false };
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
      // SIG-968: the snapshot belongs to the source board — a clone of an
      // annotated tree starts with no undo (the tree itself carries the notes).
      reviewAnnotateUndo: undefined,
      dirty: true,
      preview: false,
    };
    set((state) => ({
      boards: [...state.boards, clone],
      activeBoardId: clone.id,
      training: false,
      trainingStart: null,
      drillDueOnly: false,
    }));
  },
  setActiveBoard: (id) =>
    set({
      activeBoardId: id,
      enginePreview: null,
      threat: null,
      setupMode: false,
      training: false,
      trainingStart: null,
      drillDueOnly: false,
    }),
  makeUciMove: (from, to, promotion) => {
    if (get().training) {
      const board = get().active();
      const uci = `${from}${to}${promotion ?? ""}`;
      const currentFen = getFenAt(board.tree, board.path);
      const attempt = trainingAttempt(board.tree, board.path, uci);
      const isDueOnly = get().drillDueOnly;

      if (attempt.kind === "complete") {
        set({ statusMessage: "Line complete." });
        return false;
      }
      if (attempt.kind === "refused") {
        const valid = repertoireMoves(board.tree, board.path);
        for (const candidate of valid) {
          get().recordRepertoireMove(currentFen, candidate.uci, false);
        }
        set({ statusMessage: "Not in the repertoire." });
        return false;
      }

      get().recordRepertoireMove(currentFen, uci, true);
      const previous = board.path;

      if (isDueOnly) {
        soundForAdvance(get, previous);
        const remaining = getDueRepertoireMoves(board.tree, get().repertoireProgress);
        if (remaining.length === 0) {
          set((state) => ({
            training: false,
            trainingStart: null,
            drillDueOnly: false,
            statusMessage: "All reviews complete!",
            threat: null,
            boards: withActive(state.boards, state.activeBoardId, (active) => ({
              ...active,
              path: attempt.path,
            })),
          }));
        } else {
          const nextTarget = remaining[0];
          set((state) => ({
            trainingStart: [...nextTarget.path],
            statusMessage: null,
            threat: null,
            boards: withActive(state.boards, state.activeBoardId, (active) => ({
              ...active,
              path: [...nextTarget.path],
            })),
          }));
        }
        return true;
      }

      set((state) => ({
        statusMessage: repertoireMoves(board.tree, attempt.path).length === 0 ? "Line complete." : null,
        threat: null,
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
        threat: null,
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
    // SIG-906: clear the threat arrow; the toggle stays on so useThreat
    // recomputes for the new FEN.
    set({ enginePreview: null, threat: null });
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
      threat: null,
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
      threat: null,
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
      threat: null,
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
      threat: null,
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
      threat: null,
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
      threat: null,
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
        drillDueOnly: false,
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
      drillDueOnly: false,
      statusMessage: repertoireMoves(board.tree, start).length === 0 ? "Line complete." : null,
    });
  },
  stopTraining: () => set({ training: false, trainingStart: null, drillDueOnly: false }),
  startDueDrill: () => {
    const board = get().active();
    const dueMoves = getDueRepertoireMoves(board.tree, get().repertoireProgress);
    if (dueMoves.length === 0) {
      set({ statusMessage: "No reviews due." });
      return;
    }
    const target = dueMoves[0];
    set((state) => ({
      training: true,
      trainingStart: [...target.path],
      drillDueOnly: true,
      statusMessage: null,
      threat: null,
      boards: withActive(state.boards, state.activeBoardId, (b) => ({
        ...b,
        path: [...target.path],
      })),
    }));
  },
  recordRepertoireMove: (fen, uci, correct) => {
    const state = get();
    const key = repertoireMoveKey(fen, uci);
    const existing = state.repertoireProgress[key];
    const updated = scheduleReview(existing, correct);
    const progress = {
      ...state.repertoireProgress,
      [key]: updated,
    };
    set({ repertoireProgress: progress });
    void saveRepertoireProgress(progress, state.user?.id ?? null);
  },
  setRepertoireProgress: (progress) => {
    set({ repertoireProgress: progress });
    void saveRepertoireProgress(progress, get().user?.id ?? null);
  },
  hydrateRepertoire: async () => {
    const progress = await hydrateRepertoireProgress(get().user?.id ?? null);
    set({ repertoireProgress: progress });
  },
  setMistakeExercises: (exercises) => {
    set({ mistakeExercises: exercises });
    void saveExercises(exercises, get().user?.id ?? null);
  },
  hydrateMistakeExercises: async () => {
    const exercises = await hydrateExercises(get().user?.id ?? null);
    set({ mistakeExercises: exercises });
  },
  setBoardsHydrated: () => set({ boardsHydrated: true }),
  undo: () => get().back(),
  redo: () => get().forward(),
  hydrateRemoteBoard: (board) => {
    set((state) => {
      const exists = state.boards.some((item) => item.remoteId === board.remoteId);
      if (exists) {
        return {
          boards: state.boards.map((item) =>
            item.remoteId === board.remoteId ? { ...board, dirty: false } : item,
          ),
        };
      }
      const isPlaceholder =
        state.boards.length === 1 &&
        state.boards[0].path.length === 0 &&
        state.boards[0].tree.children.length === 0 &&
        !state.boards[0].remoteId;
      if (isPlaceholder) {
        return { boards: [board], activeBoardId: board.id };
      }
      return { boards: [...state.boards, board] };
    });
  },
  markSaved: (id, remoteId) => {
    set((state) => ({
      boards: state.boards.map((board) =>
        board.id === id ? { ...board, remoteId, dirty: false } : board,
      ),
    }));
  },
});
