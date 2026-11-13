"use client";

import { pgnEvalDisplay, type PgnEval } from "@/src/chess/pgn-eval";
import type { BoardOrientation } from "@/src/store/studio-store";
import { BoardEvalBar } from "../BoardEvalBar";
import { useLiveEval } from "./use-live-eval";

/** Level bar with no number: the shown ply has no eval (yet). Never reads as `0.00`. */
function NeutralEvalBar({ orientation }: { orientation: BoardOrientation }) {
  return <BoardEvalBar pawns={0} label="" orientation={orientation} neutral />;
}

/**
 * SIG-1312: eval bar of a live card at the shown ply. The broadcast's `[%eval]` wins when present;
 * otherwise the focused card asks local Stockfish and every other card shows a neutral bar. The
 * source is never shown. SIG-1313: `orientation` follows the card's flip (white at the bottom by default).
 */
export function LiveEvalBar({
  fen,
  pgnEval,
  focused,
  orientation = "white",
}: {
  fen: string;
  pgnEval: PgnEval | null;
  focused: boolean;
  orientation?: BoardOrientation;
}) {
  if (pgnEval) {
    const { pawns, label } = pgnEvalDisplay(pgnEval);
    // The focused card keeps its engine hook mounted (disabled) so the lease follows focus and the PGN eval.
    return focused ? (
      <FocusedEvalBar fen={fen} pgn={{ pawns, label }} orientation={orientation} />
    ) : (
      <BoardEvalBar pawns={pawns} label={label} orientation={orientation} />
    );
  }
  return focused ? <FocusedEvalBar fen={fen} pgn={null} orientation={orientation} /> : <NeutralEvalBar orientation={orientation} />;
}

/** Focused card: local Stockfish (shared `live` slot) only while the shown ply has no PGN eval. */
function FocusedEvalBar({
  fen,
  pgn,
  orientation,
}: {
  fen: string;
  pgn: { pawns: number; label: string } | null;
  orientation: BoardOrientation;
}) {
  const engine = useLiveEval(fen, { enabled: pgn === null });
  const value = pgn ?? engine;
  return value ? <BoardEvalBar pawns={value.pawns} label={value.label} orientation={orientation} /> : <NeutralEvalBar orientation={orientation} />;
}
