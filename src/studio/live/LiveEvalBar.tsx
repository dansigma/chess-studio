"use client";

import { BoardEvalBar } from "../BoardEvalBar";
import { useLiveEval } from "./use-live-eval";

/** Eval bar beside the focused live board. Mounted for the focused board only, so the lease follows focus. */
export function LiveEvalBar({ fen }: { fen: string }) {
  const { pawns, label } = useLiveEval(fen, { enabled: true });
  return <BoardEvalBar pawns={pawns} label={label} orientation="white" />;
}
