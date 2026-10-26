// SIG-1094: one-click deviation fixes. `trainDeviationLine` activates the
// side's repertoire board at the deviation position, marks the repertoire's
// own move due, and starts training there; `addGapToRepertoire` appends the
// opponent's novelty move to the repertoire board exactly once and selects
// it. Both fail closed (status hint, no crash) when the side has no marked
// repertoire board or the event kind does not apply.
import { Chess } from "chess.js";
import type { StateCreator } from "zustand";
import { addOpponentMove, findPathToPosition, withMoveDue } from "@/src/chess/repertoire-actions";
import type { DeviationEvent } from "@/src/chess/repertoire-deviation";
import { tRepertoire } from "@/src/i18n/repertoire-strings";
import { saveRepertoireProgress } from "@/src/lib/repertoire-progress";
import { withActive } from "./board-helpers";
import { selectRepertoireBoard } from "./selectors";
import type { BoardOrientation, StudioState } from "./types";

export type RepertoireActionsSlice = Pick<
  StudioState,
  "trainDeviationLine" | "addGapToRepertoire"
>;

function parseUci(playedUci: string): { from: string; to: string; promotion?: string } | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(playedUci)) {
    return null;
  }
  const from = playedUci.slice(0, 2);
  const to = playedUci.slice(2, 4);
  const promotion = playedUci.length > 4 ? playedUci.slice(4) : undefined;
  return { from, to, promotion };
}

export const createRepertoireActionsSlice: StateCreator<
  StudioState,
  [],
  [],
  RepertoireActionsSlice
> = (set, get) => ({
  trainDeviationLine: (event: DeviationEvent, color: BoardOrientation) => {
    if (event.kind !== "user_deviation" || !event.repertoireMoves[0]) {
      return;
    }
    const locale = get().settings.locale;
    const board = selectRepertoireBoard(get(), color);
    if (!board) {
      set({ statusMessage: tRepertoire(locale, "repertoire.deviation.noBoard") });
      return;
    }
    // Deviation position must still exist in the repertoire; a stale event
    // (repertoire edited since the badge rendered) fails closed so training
    // never starts on the wrong line.
    const target = findPathToPosition(board.tree, event.fen);
    if (!target) {
      set({ statusMessage: tRepertoire(locale, "repertoire.deviation.missingLine") });
      return;
    }
    // setActiveBoard clears training, so activate first, then land the path
    // and due mark in one write before startTraining() reads the active
    // path. Never goPath here — it no-ops while training.
    get().setActiveBoard(board.id);
    const moveUci = event.repertoireMoves[0].uci;
    const progress = withMoveDue(get().repertoireProgress, event.fen, moveUci, new Date());
    set((state) => ({
      statusMessage: null,
      repertoireProgress: progress,
      boards: withActive(state.boards, state.activeBoardId, (active) => ({
        ...active,
        path: [...target],
      })),
    }));
    void saveRepertoireProgress(progress, get().user?.id ?? null);
    get().startTraining();
  },
  addGapToRepertoire: (event: DeviationEvent, color: BoardOrientation) => {
    if (event.kind !== "opponent_gap") {
      return;
    }
    const locale = get().settings.locale;
    const board = selectRepertoireBoard(get(), color);
    if (!board) {
      set({ statusMessage: tRepertoire(locale, "repertoire.deviation.noBoard") });
      return;
    }
    // Derive the post-move FEN/coordinates from the pre-move FEN + played
    // UCI (same Chess grain as makeUciMove); fail closed on illegal input so
    // a corrupt event can never corrupt the tree.
    const parts = parseUci(event.playedUci);
    if (!parts) {
      return;
    }
    let san: string;
    let fen: string;
    try {
      const chess = new Chess(event.fen);
      const move = chess.move({ from: parts.from, to: parts.to, promotion: parts.promotion });
      san = move.san;
      fen = chess.fen();
    } catch {
      set({ statusMessage: tRepertoire(locale, "repertoire.deviation.gapInvalid") });
      return;
    }
    const added = addOpponentMove(board.tree, event.fen, {
      san,
      uci: event.playedUci,
      fen,
      from: parts.from,
      to: parts.to,
    });
    // Same fail-closed grain as above: the event predates a repertoire edit.
    if (!added) {
      set({ statusMessage: tRepertoire(locale, "repertoire.deviation.missingLine") });
      return;
    }
    get().setActiveBoard(board.id);
    set((state) => ({
      statusMessage: tRepertoire(locale, "repertoire.deviation.gapAdded"),
      boards: withActive(state.boards, state.activeBoardId, (active) => ({
        ...active,
        tree: added.tree,
        path: [...added.path],
        dirty: true,
      })),
    }));
  },
});
