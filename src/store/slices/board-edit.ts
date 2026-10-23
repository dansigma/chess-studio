import { Chess } from "chess.js";
import type { StateCreator } from "zustand";
import {
  START_FEN,
  cloneTree,
  createEmptyTree,
  deleteAfter,
  deleteVariation,
  getFenAt,
  getMarksAt,
  getNodeAt,
  makeMainline,
  mainlinePathForFen,
  playMove,
  promoteVariation,
  setNodeComment,
  setNodeCommentBefore,
  setNodeMarks,
  setNodeNags,
} from "@/src/chess/tree";
import {
  exportPgn,
  importPgn,
  importSans,
  openablePgn,
  titleFromHeaders,
  type GameHeaders,
} from "@/src/chess/pgn";
import { toggleNag } from "@/src/chess/nags";
import { playMoveSound, shouldPlayMoveSound } from "@/src/chess/move-sound";
import {
  emptyMarks,
  marksAreEmpty,
  toggleArrowMark,
  toggleSquareMark,
} from "@/src/chess/marks";
import { isLegalSetupFen } from "@/src/chess/setup-fen";
import { applyNullMoveFen, NULL_MOVE_SAN, NULL_MOVE_UCI } from "@/src/chess/null-move";
import { emptyBoard, withActive, analysisFen } from "./board-helpers";
import type { BoardSession, StudioState } from "./types";

// SIG-944: board-editing/import/setup actions used to live inline in
// studio-store.ts. They all rewrite the active board's tree/path/headers, so
// they share the `withActive` + `dirty` shape and belong together.
function soundForAdvance(get: () => StudioState, previous: number[]): void {
  const state = get();
  if (shouldPlayMoveSound(state.settings.moveSound, previous, state.active().path)) {
    playMoveSound();
  }
}

export type BoardEditSlice = Pick<
  StudioState,
  | "setupMode"
  | "flip"
  | "importPgnText"
  | "openListedGame"
  | "importPlayerGame"
  | "exportActivePgn"
  | "pruneAfter"
  | "promoteVariation"
  | "makeMainline"
  | "deleteVariation"
  | "setMoveComment"
  | "setMoveCommentBefore"
  | "insertNullMove"
  | "clearBoardMarks"
  | "toggleMoveNag"
  | "clearMoveNags"
  | "annotateReview"
  | "undoReviewAnnotations"
  | "toggleBoardSquareMark"
  | "toggleBoardArrowMark"
  | "setHeaders"
  | "renameActive"
  | "setSetupMode"
  | "applySetupFen"
  | "openSharedPosition"
  | "setBoardRepertoire"
>;

export const initialBoardEditState = {
  setupMode: false,
};

export const createBoardEditSlice: StateCreator<StudioState, [], [], BoardEditSlice> = (
  set,
  get,
) => ({
  ...initialBoardEditState,
  flip: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        orientation: board.orientation === "white" ? "black" : "white",
        dirty: true,
      })),
    }));
  },
  // SIG-1092: mark one board per color as the repertoire. Setting a color
  // clears it from any other board holding it (so the partial unique index
  // holds) and marks both old and new holders dirty so the debounced
  // auto-save persists the unmark too. Passing null only clears this board.
  setBoardRepertoire: (boardId, color) => {
    set((state) => ({
      boards: state.boards.map((board) => {
        if (board.id === boardId) {
          return board.repertoireColor === color
            ? board
            : { ...board, repertoireColor: color, dirty: true };
        }
        if (color !== null && board.repertoireColor === color) {
          return { ...board, repertoireColor: null, dirty: true };
        }
        return board;
      }),
    }));
  },
  importPgnText: (pgn, title) => {
    const imported = openablePgn(pgn);
    if (!imported) {
      set({ statusMessage: "Could not open that PGN." });
      return;
    }
    set((state) => ({
      statusMessage: null,
      training: false,
      trainingStart: null,
      threat: null,
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        title: title ?? imported.title,
        tree: imported.tree,
        path: imported.path,
        headers: imported.headers,
        // SIG-968: a fresh import is a new game — drop any annotate undo.
        reviewAnnotateUndo: undefined,
        dirty: true,
      })),
    }));
  },
  openListedGame: (args) => {
    const sans = args.moves?.trim() ? args.moves.trim().split(/\s+/).filter(Boolean) : [];
    const imported =
      sans.length > 0 ? importSans(sans, args.headers ?? {}) : importPgn(args.pgn ?? "");
    const headers = args.headers ? { ...imported.headers, ...args.headers } : imported.headers;
    set((state) => {
      const atFen = args.atFen ?? analysisFen(state);
      const content = {
        title: args.title,
        tree: imported.tree,
        path: mainlinePathForFen(imported.tree, atFen),
        headers,
        // SIG-968: a fresh game replaces the tree — drop any annotate undo.
        reviewAnnotateUndo: undefined,
        dirty: false,
      };
      const previewMode = state.settings.gamePreviewEnabled && !args.openInNewBoard;
      if (previewMode) {
        const existing = state.boards.find((board) => board.preview);
        if (existing) {
          return {
            enginePreview: null,
            threat: null,
            setupMode: false,
            training: false,
            trainingStart: null,
            activeBoardId: existing.id,
            boards: state.boards.map((board) =>
              board.id === existing.id ? { ...board, ...content, preview: true } : board,
            ),
          };
        }
        const board: BoardSession = {
          ...emptyBoard(content.title),
          ...content,
          preview: true,
          dirty: false,
        };
        return {
          enginePreview: null,
          threat: null,
          setupMode: false,
          training: false,
          trainingStart: null,
          boards: [...state.boards, board],
          activeBoardId: board.id,
        };
      }
      const board: BoardSession = {
        ...emptyBoard(content.title),
        ...content,
        preview: false,
        dirty: false,
      };
      return {
        enginePreview: null,
        threat: null,
        setupMode: false,
        training: false,
        trainingStart: null,
        boards: [...state.boards, board],
        activeBoardId: board.id,
      };
    });
  },
  importPlayerGame: (game, options) => {
    const headers: GameHeaders = {
      Event: game.event ?? "?",
      White: game.whiteName,
      Black: game.blackName,
      Result:
        game.winner === "white"
          ? "1-0"
          : game.winner === "black"
            ? "0-1"
            : game.winner === "draw"
              ? "1/2-1/2"
              : "*",
    };
    if (game.whiteRating) {
      headers.WhiteElo = String(game.whiteRating);
    }
    if (game.blackRating) {
      headers.BlackElo = String(game.blackRating);
    }
    if (game.eco) {
      headers.ECO = game.eco;
    }
    if (game.opening) {
      headers.Opening = game.opening;
    }
    if (game.year) {
      headers.Date = `${game.year}.${game.month ? String(game.month).padStart(2, "0") : "??"}.??`;
    }
    get().openListedGame({
      title: `${game.whiteName} vs ${game.blackName}`,
      pgn: game.pgn,
      moves: game.moves,
      headers,
      openInNewBoard: options?.openInNewBoard,
    });
  },
  exportActivePgn: () => {
    const board = get().active();
    return exportPgn(board.tree, board.headers);
  },
  pruneAfter: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        tree: deleteAfter(board.tree, board.path),
        dirty: true,
      })),
    }));
  },
  promoteVariation: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const next = promoteVariation(board.tree, board.path);
        return { ...board, tree: next.tree, path: next.path, dirty: true };
      }),
    }));
  },
  makeMainline: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const next = makeMainline(board.tree, board.path);
        return { ...board, tree: next.tree, path: next.path, dirty: true };
      }),
    }));
  },
  deleteVariation: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const next = deleteVariation(board.tree, board.path);
        return { ...board, tree: next.tree, path: next.path, dirty: true };
      }),
    }));
  },
  setMoveComment: (comment) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        tree: setNodeComment(board.tree, board.path, comment),
        dirty: true,
      })),
    }));
  },
  setMoveCommentBefore: (comment) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        if (board.path.length === 0) {
          return board;
        }
        return {
          ...board,
          tree: setNodeCommentBefore(board.tree, board.path, comment),
          dirty: true,
        };
      }),
    }));
  },
  insertNullMove: () => {
    if (get().setupMode || get().training) {
      return false;
    }
    const board = get().active();
    const previous = board.path;
    try {
      const nextFen = applyNullMoveFen(getFenAt(board.tree, board.path));
      const next = playMove(board.tree, board.path, {
        san: NULL_MOVE_SAN,
        uci: NULL_MOVE_UCI,
        fen: nextFen,
        from: "",
        to: "",
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
      set({ statusMessage: "Could not insert null move" });
      return false;
    }
  },
  clearBoardMarks: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        if (marksAreEmpty(getMarksAt(board.tree, board.path))) {
          return board;
        }
        return {
          ...board,
          tree: setNodeMarks(board.tree, board.path, undefined),
          dirty: true,
        };
      }),
    }));
  },
  toggleMoveNag: (nag, path) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const target = path ?? board.path;
        const node = getNodeAt(board.tree, target);
        if (!node) {
          return board;
        }
        return {
          ...board,
          path: target,
          tree: setNodeNags(board.tree, target, toggleNag(node.nags, nag)),
          dirty: true,
        };
      }),
    }));
  },
  clearMoveNags: (path) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const target = path ?? board.path;
        if (!getNodeAt(board.tree, target)) {
          return board;
        }
        return {
          ...board,
          path: target,
          tree: setNodeNags(board.tree, target, undefined),
          dirty: true,
        };
      }),
    }));
  },
  // SIG-968: bulk-applies pure review edits (NAGs + "[Chess Studio review]"
  // comment blocks). Edits arrive address-complete from
  // buildReviewAnnotations, so they apply directly by path with no review
  // imports here — the snapshot holds the undo, not a recompute.
  annotateReview: (edits) => {
    if (edits.length === 0) {
      return;
    }
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        let tree = board.tree;
        for (const edit of edits) {
          if (edit.nags !== undefined) {
            tree = setNodeNags(tree, edit.path, edit.nags);
          }
          if (edit.comment !== undefined) {
            // setNodeComment no-ops to undefined on empty, which strips a
            // review block whose options produced no lines (evals + best-move
            // off with no user text) — the intended re-annotate cleanup.
            tree = setNodeComment(tree, edit.path, edit.comment);
          }
        }
        if (tree === board.tree) {
          return board;
        }
        return {
          ...board,
          tree,
          // One level only: each annotate overwrites the prior snapshot, so
          // undo always restores the tree as it was right before the latest
          // annotate. cloneTree keeps the snapshot detached from later edits.
          reviewAnnotateUndo: cloneTree(board.tree),
          dirty: true,
        };
      }),
    }));
  },
  undoReviewAnnotations: () => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        if (!board.reviewAnnotateUndo) {
          return board;
        }
        return {
          ...board,
          tree: board.reviewAnnotateUndo,
          // Consumed: a second undo is a no-op until the next annotate.
          reviewAnnotateUndo: undefined,
          dirty: true,
        };
      }),
    }));
  },
  toggleBoardSquareMark: (square, color) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const current = getMarksAt(board.tree, board.path) ?? emptyMarks();
        return {
          ...board,
          tree: setNodeMarks(board.tree, board.path, toggleSquareMark(current, square, color)),
          dirty: true,
        };
      }),
    }));
  },
  toggleBoardArrowMark: (from, to, color) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const current = getMarksAt(board.tree, board.path) ?? emptyMarks();
        return {
          ...board,
          tree: setNodeMarks(board.tree, board.path, toggleArrowMark(current, from, to, color)),
          dirty: true,
        };
      }),
    }));
  },
  setHeaders: (headers) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        headers,
        title: titleFromHeaders(headers),
        dirty: true,
      })),
    }));
  },
  renameActive: (title) => {
    set((state) => ({
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        title,
        dirty: true,
      })),
    }));
  },
  setSetupMode: (setupMode) => set({ setupMode, enginePreview: null, threat: null }),
  applySetupFen: (fen) => {
    const trimmed = fen.trim();
    if (!isLegalSetupFen(trimmed)) {
      set({ statusMessage: "Invalid setup position" });
      return false;
    }
    const chess = new Chess(trimmed);
    const startFen = chess.fen();
    const isStart = startFen === START_FEN;
    set((state) => ({
      setupMode: false,
      threat: null,
      statusMessage: "Position applied",
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const headers = { ...board.headers };
        if (isStart) {
          delete headers.FEN;
          delete headers.SetUp;
        } else {
          headers.FEN = startFen;
          headers.SetUp = "1";
        }
        return {
          ...board,
          tree: createEmptyTree(startFen),
          path: [],
          headers,
          // SIG-968: setup replaces the tree — drop any annotate undo.
          reviewAnnotateUndo: undefined,
          dirty: true,
        };
      }),
    }));
    return true;
  },
  openSharedPosition: (fen) => {
    const trimmed = fen.trim();
    if (!isLegalSetupFen(trimmed)) {
      return;
    }
    const startFen = new Chess(trimmed).fen();
    const isStart = startFen === START_FEN;
    set((state) => ({
      setupMode: false,
      enginePreview: null,
      threat: null,
      boards: withActive(state.boards, state.activeBoardId, (board) => {
        const headers = { ...board.headers };
        if (isStart) {
          delete headers.FEN;
          delete headers.SetUp;
        } else {
          headers.FEN = startFen;
          headers.SetUp = "1";
        }
        return {
          ...board,
          tree: createEmptyTree(startFen),
          path: [],
          headers,
          // SIG-968: a shared position replaces the tree — drop annotate undo.
          reviewAnnotateUndo: undefined,
          dirty: false,
        };
      }),
    }));
  },
});
