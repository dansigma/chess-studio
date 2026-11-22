import { scopeFilter, scopeIncludesPosition } from "@/src/chess/repertoire-scope";
import { Chess } from "chess.js";
import type { StateCreator, StoreApi } from "zustand";
import {
  cloneTree,
  continuationsAt,
  fenKey,
  getFenAt,
  getLastMove,
  getNodeAt,
  goBack,
  goEnd,
  goForward,
  goForwardN,
  goStart,
  insertLine,
  pathAlongLine,
  pathsEqual,
  playMove,
  setNodeComment,
} from "@/src/chess/tree";
import {
  getDueRepertoireMoves,
  repertoireMoveKey,
  repertoireMoves,
  scheduleReview,
  type DueRepertoireMove,
} from "@/src/chess/repertoire";
import { persistBoardClose } from "@/src/lib/close-board-persistence";
import { pickOpponentReply, trainingAttempt, trainingColor } from "@/src/chess/training";
import { sideFromFen } from "@/src/chess/move-notation";
import { tRepertoire } from "@/src/i18n/repertoire-strings";
import { tPanels } from "@/src/i18n/studio-panel-strings";
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
  next?: number[],
): void {
  if (suppressMoveSound) {
    return;
  }
  const state = get();
  if (
    shouldPlayMoveSound(state.settings.moveSound, previous, next ?? state.active().path)
  ) {
    playMoveSound();
  }
}

const TRAINING_REPLY_DELAY_MS = 400;

function boardTrainingScope(state: StudioState, board: BoardSession) {
  return state.settings.trainingScope[trainingColor(board) === "w" ? "white" : "black"];
}

function trainingFilter(state: StudioState, board: BoardSession) {
  const color = state.trainingUserColor === "w" ? "white" : "black";
  return scopeFilter(board.tree, state.settings.trainingScope[color], state.trainingCatalogPositions);
}

function trainingLineStatus(state: StudioState, board: BoardSession, path: number[], filter: ReturnType<typeof scopeFilter>) {
  return repertoireMoves(board.tree, path, filter).length === 0
    ? tPanels(state.settings.locale, "repertoire.lineComplete")
    : null;
}

function advanceTraining(
  set: StoreApi<StudioState>["setState"],
  get: () => StudioState,
  board: BoardSession,
  path: number[],
): void {
  set((state) => ({
    statusMessage: trainingLineStatus(state, board, path, trainingFilter(state, board)),
    trainingMiss: null,
    threat: null,
    boards: withActive(state.boards, state.activeBoardId, (active) => ({ ...active, path })),
  }));
  soundForAdvance(get, board.path);
}

function scheduleTrainingReply(
  set: StoreApi<StudioState>["setState"],
  get: () => StudioState,
): void {
  const state = get();
  const board = state.active();
  if (
    !state.training || state.drillDueOnly ||
    repertoireMoves(board.tree, board.path, trainingFilter(state, board)).length === 0 ||
    sideFromFen(getFenAt(board.tree, board.path)) === state.trainingUserColor
  ) {
    return;
  }

  // Each start gets its own path array, even when restarting at the same position.
  const session = state.trainingStart;
  setTimeout(() => {
    const current = get();
    const active = current.active();
    if (
      !current.training || current.drillDueOnly || current.trainingStart !== session ||
      active.id !== board.id || active.tree !== board.tree || !pathsEqual(active.path, board.path)
    ) {
      return;
    }
    const reply = pickOpponentReply(active.tree, active.path, current.repertoireProgress, Math.random, trainingFilter(current, active));
    if (reply) {
      advanceTraining(set, get, active, reply);
    }
  }, TRAINING_REPLY_DELAY_MS);
}

const DUE_REPLAY_DELAY_MS = 300;

function targetExists(board: BoardSession, target: DueRepertoireMove, filter: ReturnType<typeof scopeFilter>): boolean {
  const fen = target.path.length ? getNodeAt(board.tree, target.path)?.fen : board.tree.startFen;
  return !!fen &&
    repertoireMoveKey(fen, target.uci) === target.key &&
    continuationsAt(board.tree, target.path).some((move, index) =>
      move.uci === target.uci && (!filter || filter([...target.path, index], fen)),
    );
}

function queueDueQuestion(
  set: StoreApi<StudioState>["setState"],
  get: () => StudioState,
  remaining: DueRepertoireMove[],
  total: number,
  from: number[],
): void {
  const state = get();
  const board = state.active();
  const filter = trainingFilter(state, board);
  const queue = remaining.filter((target) => targetExists(board, target, filter));
  // Finish the current line before returning to sibling variations in DFS order.
  const next = queue.findIndex((target) => pathsEqual(target.path.slice(0, from.length), from));
  const [target] = queue.splice(Math.max(0, next), 1);
  const path = target && next === -1 ? [] : from;
  const replaying = !!target && !pathsEqual(path, target.path);
  set({
    training: !!target,
    trainingStart: target ? state.trainingStart : null,
    trainingCatalogPositions: target ? state.trainingCatalogPositions : undefined,
    trainingMiss: null,
    drillDueOnly: !!target,
    dueDrill: target ? { queue: [target, ...queue], total, replaying } : null,
    statusMessage: target ? null : tRepertoire(state.settings.locale, "repertoire.training.reviewsComplete"),
    threat: null,
    boards: withActive(state.boards, state.activeBoardId, (active) => ({ ...active, path })),
  });
  scheduleDueReplay(set, get);
}

function advanceDueReplay(
  set: StoreApi<StudioState>["setState"],
  get: () => StudioState,
  skip: boolean,
): void {
  const state = get();
  const board = state.active();
  const drill = state.dueDrill;
  if (!state.training || !drill?.replaying) {
    return;
  }
  const [target, ...remaining] = drill.queue;
  if (!targetExists(board, target, trainingFilter(state, board))) {
    queueDueQuestion(set, get, remaining, drill.total, []);
    return;
  }
  const path = skip ? target.path : target.path.slice(0, board.path.length + 1);
  set({
    dueDrill: { ...drill, replaying: !pathsEqual(path, target.path) },
    threat: null,
    boards: withActive(state.boards, state.activeBoardId, (active) => ({ ...active, path })),
  });
  if (!skip) {
    soundForAdvance(get, board.path);
    scheduleDueReplay(set, get);
  }
}

function scheduleDueReplay(
  set: StoreApi<StudioState>["setState"],
  get: () => StudioState,
): void {
  const { activeBoardId, dueDrill, trainingStart } = get();
  if (!dueDrill?.replaying) {
    return;
  }
  setTimeout(() => {
    const state = get();
    if (
      state.trainingStart === trainingStart &&
      state.activeBoardId === activeBoardId &&
      state.dueDrill === dueDrill
    ) {
      advanceDueReplay(set, get, false);
    }
  }, DUE_REPLAY_DELAY_MS);
}

// Local navigation/move state: boards, selection, path, and training mode.
export type BoardsSlice = Pick<
  StudioState,
  | "boards"
  | "activeBoardId"
  | "boardsHydrated"
  | "training"
  | "trainingStart"
  | "trainingCatalogPositions"
  | "trainingMiss"
  | "showTrainingHint"
  | "trainingUserColor"
  | "drillDueOnly"
  | "dueDrill"
  | "skipDueReplay"
  | "repertoireProgress"
  | "mistakeExercises"
  | "variationChoice"
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
  | "chooseVariation"
  | "cancelVariationChoice"
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
  trainingCatalogPositions: undefined,
  dueDrill: null,
  trainingMiss: null,
  trainingUserColor: "w" as const,
  drillDueOnly: false,
  repertoireProgress: typeof window !== "undefined" ? readLocalRepertoireProgress() : {},
  mistakeExercises: typeof window !== "undefined" ? readLocalExercises() : {},
  // SIG-1187: pending Forward continuation choice; null when no chooser open.
  variationChoice: null,
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
    if (get().retry.active) {
      get().exitRetry();
    }
    const board = emptyBoard();
    set((state) => ({
      boards: [...state.boards, board],
      activeBoardId: board.id,
      threat: null,
      training: false,
      trainingStart: null,
      trainingCatalogPositions: undefined,
      dueDrill: null,
      trainingMiss: null,
      drillDueOnly: false,
      // SIG-1187: a new active board never inherits a pending chooser.
      variationChoice: null,
    }));
  },
  closeBoard: (id) => {
    if (get().retry.active) {
      get().exitRetry();
    }
    const closed = get().boards.find((board) => board.id === (id ?? get().activeBoardId));
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
      return { boards, activeBoardId, threat: null, training: false, trainingStart: null, trainingCatalogPositions: undefined, dueDrill: null, trainingMiss: null, drillDueOnly: false, variationChoice: null };
    });
    // SIG-1199: persist the close now; the shell's debounced saves lag behind.
    persistBoardClose(get(), closed);
  },
  cloneBoard: () => {
    if (get().retry.active) {
      get().exitRetry();
    }
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
      // SIG-1092: a clone is a new board, not a second holder of the mark.
      repertoireColor: null,
      dirty: true,
      preview: false,
    };
    set((state) => ({
      boards: [...state.boards, clone],
      activeBoardId: clone.id,
      training: false,
      trainingStart: null,
      trainingCatalogPositions: undefined,
      dueDrill: null,
      trainingMiss: null,
      drillDueOnly: false,
      // SIG-1187: a clone is a new board, not a second holder of the choice.
      variationChoice: null,
    }));
  },
  setActiveBoard: (id) => {
    if (get().retry.active) {
      get().exitRetry();
    }
    set({
      activeBoardId: id,
      enginePreview: null,
      threat: null,
      setupMode: false,
      training: false,
      trainingStart: null,
      trainingCatalogPositions: undefined,
      dueDrill: null,
      trainingMiss: null,
      drillDueOnly: false,
      // SIG-1187: a board switch never carries a pending chooser.
      variationChoice: null,
    });
  },
  makeUciMove: (from, to, promotion) => {
    // SIG-1209: an open retry owns the board; its moves never enter the tree.
    if (get().retry.active) {
      return get().retryMove(from, to, promotion);
    }
    if (get().training) {
      const board = get().active();
      const uci = `${from}${to}${promotion ?? ""}`;
      const currentFen = getFenAt(board.tree, board.path);
      const { drillDueOnly: isDueOnly, dueDrill, trainingUserColor, trainingMiss, settings } = get();
      if (dueDrill?.replaying) {
        return false;
      }
      const filter = trainingFilter(get(), board);
      const target = dueDrill?.queue[0];
      if (dueDrill && target && !targetExists(board, target, filter)) {
        queueDueQuestion(set, get, dueDrill.queue.slice(1), dueDrill.total, []);
        return false;
      }
      const positionKey = fenKey(currentFen);
      const miss = trainingMiss?.fenKey === positionKey ? trainingMiss : null;
      if (!isDueOnly && sideFromFen(currentFen) !== trainingUserColor) {
        return false;
      }
      const attempt = trainingAttempt(board.tree, board.path, uci, filter);

      if (attempt.kind === "complete") {
        set({
          statusMessage: tPanels(settings.locale, "repertoire.lineComplete"),
        });
        return false;
      }
      const alternate = !!target && attempt.kind === "accepted" && uci !== target.uci;
      if (attempt.kind === "refused" || alternate) {
        if (miss) {
          set({ trainingMiss: { ...miss, hint: 2 } });
        } else {
          const valid = target ? [target] : repertoireMoves(board.tree, board.path, filter);
          for (const candidate of valid) {
            get().recordRepertoireMove(currentFen, candidate.uci, false);
          }
          set({
            trainingMiss: { fenKey: positionKey, uci: valid[0].uci, hint: 0, alternate },
            statusMessage: tRepertoire(settings.locale, alternate
              ? "repertoire.training.tryReviewMove"
              : "repertoire.training.wrongMove"),
          });
        }
        return false;
      }

      if (!miss) {
        get().recordRepertoireMove(currentFen, uci, true);
      }
      if (dueDrill) {
        soundForAdvance(get, board.path, attempt.path);
        queueDueQuestion(set, get, dueDrill.queue.slice(1), dueDrill.total, attempt.path);
        return true;
      }

      advanceTraining(set, get, board, attempt.path);
      scheduleTrainingReply(set, get);
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
        // SIG-1187: the cursor left the pending choice — see back().
        variationChoice: null,
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
    if (get().training || get().retry.active) {
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
  insertEngineLines: (fen, lines) => {
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
    for (const line of lines) {
      const { pvUci, evalLabel } = Array.isArray(line) ? { pvUci: line } : line;
      const chess = new Chess(fen);
      const moves: {
        san: string;
        uci: string;
        fen: string;
        from: string;
        to: string;
      }[] = [];
      for (const uci of pvUci) {
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
      const previous = merged;
      const ucis = moves.map((move) => move.uci);
      let tip = pathAlongLine(merged, board.path, ucis);
      if (!tip) {
        merged = insertLine(merged, board.path, moves);
        tip = pathAlongLine(merged, board.path, ucis);
      }
      if (evalLabel && tip && !getNodeAt(merged, tip)?.comment) {
        merged = setNodeComment(merged, tip, evalLabel);
      }
      if (merged !== previous) {
        inserted += 1;
      }
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
    if (get().retry.active) {
      get().exitRetry();
    }
    if (get().training) {
      return;
    }
    const previous = get().active().path;
    set((state) => ({
      threat: null,
      // SIG-1187: a direct notation jump resolves the choice itself.
      variationChoice: null,
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        path,
        // SIG-1186: cursor navigation must persist `current_node_path` —
        // mark dirty even though the tree is unchanged.
        dirty: true,
      })),
    }));
    soundForAdvance(get, previous);
  },
  back: () => {
    if (get().retry.active) {
      get().exitRetry();
    }
    if (get().training) {
      return;
    }
    set((state) => ({
      threat: null,
      // SIG-1187: the cursor left the pending choice — drop the chooser so a
      // later Forward re-evaluates instead of no-op'ing on a stale choice.
      variationChoice: null,
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        path: goBack(board.path),
        // SIG-1186: cursor-only change — see goPath.
        dirty: true,
      })),
    }));
  },
  forward: () => {
    if (get().retry.active) {
      get().exitRetry();
    }
    if (get().training) {
      return;
    }
    // SIG-1187: a pending chooser owns the next step — Forward waits for it.
    if (get().variationChoice) {
      return;
    }
    const board = get().active();
    const continuations = continuationsAt(board.tree, board.path);
    if (continuations.length === 0) {
      return;
    }
    if (continuations.length === 1) {
      const previous = board.path;
      set((state) => ({
        threat: null,
        // SIG-1187: advancing one ply is also a cursor move — drop any stale
        // pending choice so Forward never no-ops after the cursor leaves it.
        variationChoice: null,
        boards: withActive(state.boards, state.activeBoardId, (active) => ({
          ...active,
          path: goForward(active.tree, active.path),
          // SIG-1186: cursor-only change — see goPath.
          dirty: true,
        })),
      }));
      soundForAdvance(get, previous);
      return;
    }
    // 2+ children: open the chooser; the board stays put and stays silent.
    set({ variationChoice: { boardId: board.id, path: [...board.path] } });
  },
  chooseVariation: (index) => {
    if (get().retry.active) {
      get().exitRetry();
    }
    const choice = get().variationChoice;
    if (!choice) {
      return;
    }
    const board = get().active();
    const stillCurrent = board.id === choice.boardId && pathsEqual(board.path, choice.path);
    const continuations = stillCurrent ? continuationsAt(board.tree, choice.path) : [];
    if (!stillCurrent || !Number.isInteger(index) || index < 0 || index >= continuations.length) {
      // Stale board/path or bad index: drop the choice without moving.
      set({ variationChoice: null });
      return;
    }
    const previous = board.path;
    set((state) => ({
      threat: null,
      variationChoice: null,
      boards: withActive(state.boards, state.activeBoardId, (active) => ({
        ...active,
        path: [...choice.path, index],
        // SIG-1186: cursor-only change — see goPath.
        dirty: true,
      })),
    }));
    soundForAdvance(get, previous);
  },
  cancelVariationChoice: () => {
    if (get().variationChoice) {
      set({ variationChoice: null });
    }
  },
  toStart: () => {
    if (get().retry.active) {
      get().exitRetry();
    }
    if (get().training) {
      return;
    }
    set((state) => ({
      threat: null,
      // SIG-1187: the cursor left the pending choice — see back().
      variationChoice: null,
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        path: goStart(),
        // SIG-1186: cursor-only change — see goPath.
        dirty: true,
      })),
    }));
  },
  toEnd: () => {
    if (get().retry.active) {
      get().exitRetry();
    }
    if (get().training) {
      return;
    }
    const previous = get().active().path;
    set((state) => ({
      threat: null,
      // SIG-1187: the cursor left the pending choice — see back().
      variationChoice: null,
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        path: goEnd(board.tree, board.path),
        // SIG-1186: cursor-only change — see goPath.
        dirty: true,
      })),
    }));
    soundForAdvance(get, previous);
  },
  skipForward: () => {
    if (get().retry.active) {
      get().exitRetry();
    }
    if (get().training) {
      return;
    }
    const previous = get().active().path;
    set((state) => ({
      threat: null,
      // SIG-1187: the cursor left the pending choice — see back().
      variationChoice: null,
      boards: withActive(state.boards, state.activeBoardId, (board) => ({
        ...board,
        path: goForwardN(board.tree, board.path, 10),
        // SIG-1186: cursor-only change — see goPath.
        dirty: true,
      })),
    }));
    soundForAdvance(get, previous);
  },
  startTraining: (catalogPositions) => {
    if (get().retry.active) {
      get().exitRetry();
    }
    const state = get();
    const board = state.active();
    const restart = state.training && state.trainingStart;
    const scope = boardTrainingScope(state, board);
    const candidate = restart || board.path;
    const filter = scopeFilter(board.tree, scope, catalogPositions);
    const start = scopeIncludesPosition(board.tree, candidate, filter) ? [...candidate] : [];
    set({
      training: true,
      trainingStart: start,
      trainingCatalogPositions: catalogPositions,
      trainingMiss: null,
      trainingUserColor: trainingColor(board),
      drillDueOnly: false,
      dueDrill: null,
      // SIG-1187: entering training parks navigation — drop a pending chooser.
      variationChoice: null,
      statusMessage: trainingLineStatus(state, board, start, filter),
      boards: !pathsEqual(board.path, start)
        ? withActive(state.boards, state.activeBoardId, (active) => ({ ...active, path: [...start] }))
        : state.boards,
    });
    scheduleTrainingReply(set, get);
  },
  stopTraining: () => set((state) => ({
    training: false,
    trainingCatalogPositions: undefined,
    trainingStart: null,
    dueDrill: null,
    trainingMiss: null,
    drillDueOnly: false,
    statusMessage: state.training ? null : state.statusMessage,
  })),
  showTrainingHint: () => {
    const { training, trainingMiss, fen } = get();
    if (training && trainingMiss?.fenKey === fenKey(fen()) && trainingMiss.hint < 2) {
      set({ trainingMiss: { ...trainingMiss, hint: trainingMiss.hint === 0 ? 1 : 2 } });
    }
  },
  startDueDrill: (catalogPositions) => {
    if (get().retry.active) {
      get().exitRetry();
    }
    const board = get().active();
    const trainingUserColor = trainingColor(board);
    const filter = scopeFilter(board.tree, boardTrainingScope(get(), board), catalogPositions);
    const dueMoves = getDueRepertoireMoves(board.tree, get().repertoireProgress, trainingUserColor, undefined, filter);
    if (dueMoves.length === 0) {
      if (get().drillDueOnly) {
        get().stopTraining();
      }
      set({ statusMessage: tRepertoire(get().settings.locale, "repertoire.training.noReviewsDue") });
      return;
    }
    set({
      trainingStart: [],
      trainingCatalogPositions: catalogPositions,
      trainingUserColor,
      enginePreview: null,
      variationChoice: null,
    });
    queueDueQuestion(set, get, dueMoves, dueMoves.length, []);
  },
  skipDueReplay: () => advanceDueReplay(set, get, true),
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
