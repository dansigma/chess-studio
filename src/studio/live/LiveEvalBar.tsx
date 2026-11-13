"use client";

import { pgnEvalDisplay, type PgnEval } from "@/src/chess/pgn-eval";
import { BoardEvalBar } from "../BoardEvalBar";
import { useLiveEval } from "./use-live-eval";

/** Level bar with no number: the shown ply has no eval (yet). Never reads as `0.00`. */
function NeutralEvalBar() {
  return <BoardEvalBar pawns={0} label="" orientation="white" neutral />;
}

/**
 * SIG-1312: eval bar of a live card at the shown ply. The broadcast's `[%eval]` wins when present;
 * otherwise the focused card asks local Stockfish and every other card shows a neutral bar. The
 * source is never shown.
 */
export function LiveEvalBar({ fen, pgnEval, focused }: { fen: string; pgnEval: PgnEval | null; focused: boolean }) {
  if (pgnEval) {
    const { pawns, label } = pgnEvalDisplay(pgnEval);
    // The focused card keeps its engine hook mounted (disabled) so the lease follows focus and the PGN eval.
    return focused ? (
      <FocusedEvalBar fen={fen} pgn={{ pawns, label }} />
    ) : (
      <BoardEvalBar pawns={pawns} label={label} orientation="white" />
    );
  }
  return focused ? <FocusedEvalBar fen={fen} pgn={null} /> : <NeutralEvalBar />;
}

/** Focused card: local Stockfish (shared `live` slot) only while the shown ply has no PGN eval. */
function FocusedEvalBar({ fen, pgn }: { fen: string; pgn: { pawns: number; label: string } | null }) {
  const engine = useLiveEval(fen, { enabled: pgn === null });
  const value = pgn ?? engine;
  return value ? <BoardEvalBar pawns={value.pawns} label={value.label} orientation="white" /> : <NeutralEvalBar />;
}
