import { Chess } from "chess.js";
import { encodeHistory, legalMoves } from "./encode";
import type { MaiaPosition, MaiaResult } from "./protocol";

/** One forward pass of the policy head on a single position: move logits over the vocabulary. */
export type RunMaiaModel = (tokens: Float32Array, elo: number) => Promise<Float32Array>;

function softmax(logits: readonly number[]): number[] {
  const peak = Math.max(...logits);
  const weights = logits.map((logit) => Math.exp(logit - peak));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  return weights.map((weight) => weight / sum);
}

export async function analyzeMaia({ fens, elo, lines }: MaiaPosition, run: RunMaiaModel): Promise<MaiaResult> {
  const fen = fens.at(-1);
  if (!fen) throw new Error("Maia requires a current position");
  const board = new Chess(fen);
  // Only "no legal move" ends the analysis: draw rules (fifty moves, repetition)
  // still leave moves a human could play.
  const legal = legalMoves(board);
  if (legal.length === 0) return { moves: [] };
  const logits = await run(encodeHistory(fens), elo);
  if (legal.some(({ index }) => !(index < logits.length))) {
    throw new Error("Maia move vocabulary does not match the model output");
  }
  const probabilities = softmax(legal.map(({ index }) => logits[index]));
  const candidates = legal.map((move, index) => ({ ...move, prob: probabilities[index] }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, lines);

  // Policy only: the value head (W/D/L) is not shown, so it is not computed.
  return { moves: candidates.map(({ uci, prob }) => ({ uci, prob })) };
}
