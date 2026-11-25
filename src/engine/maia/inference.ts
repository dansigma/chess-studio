import { Chess } from "chess.js";
import { BOARD_SQUARES, TOKEN_WIDTH, encodeHistory, legalMoves } from "./encode";
import type { MaiaPosition, MaiaResult } from "./protocol";

export type RunMaiaModel = (
  tokens: Float32Array,
  batch: number,
  elo: number,
  output: "move_logits" | "value_logits",
) => Promise<Float32Array>;

function softmax(logits: readonly number[]): number[] {
  const peak = Math.max(...logits);
  const weights = logits.map((logit) => Math.exp(logit - peak));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  return weights.map((weight) => weight / sum);
}

export async function analyzeMaia({ fens, elo }: MaiaPosition, run: RunMaiaModel): Promise<MaiaResult> {
  const fen = fens.at(-1);
  if (!fen) throw new Error("Maia requires a current position");
  const board = new Chess(fen);
  if (board.isGameOver()) return { moves: [] };

  const legal = legalMoves(board);
  const logits = await run(encodeHistory(fens), 1, elo, "move_logits");
  const probabilities = softmax(legal.map(({ index }) => logits[index]));
  const candidates = legal.map((move, index) => ({ ...move, prob: probabilities[index] }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 5);

  const stride = BOARD_SQUARES * TOKEN_WIDTH;
  const batch = new Float32Array(stride * candidates.length);
  candidates.forEach(({ after }, index) => {
    batch.set(encodeHistory([...fens, after]), index * stride);
  });

  // Both players use the selected Elo, so swapping the ratings is implicit.
  const values = await run(batch, candidates.length, elo, "value_logits");
  return {
    moves: candidates.map(({ uci, prob }, index) => {
      // The next position's labels are [loss, draw, win] for the opponent,
      // which are [win, draw, loss] for the player choosing this move.
      const [win, draw, loss] = softmax(Array.from(values.subarray(index * 3, index * 3 + 3)));
      return { uci, prob, wdl: [win, draw, loss] };
    }),
  };
}
