// SIG-961: collects the facts an explanation may rely on. The only place the
// explain module touches the facts layer; everything downstream is a pure
// function of this bundle.
import { Chess } from "chess.js";
import { computeMoveFacts, computePositionFacts, type MoveFacts, type PositionFacts } from "@/src/chess/facts/index";

export type ExplainFacts = {
  before: PositionFacts;
  /** Position after the played move. */
  after: PositionFacts;
  played: MoveFacts;
  /** Facts about the engine's preferred move; null when unknown or when it is the played move. */
  best: MoveFacts | null;
  /** SAN of the engine's preferred move (also set when it equals the played move). */
  bestSan: string | null;
};

/** Engine continuation: the best move first, then the line. */
export function gatherFacts(fenBefore: string, playedUci: string, bestPv: string[]): ExplainFacts | null {
  const bestUci = bestPv[0] ?? null;
  const playedIsBest = bestUci === playedUci;
  const played = computeMoveFacts(fenBefore, playedUci, playedIsBest ? bestPv : undefined);
  if (!played) {
    return null;
  }
  const board = new Chess(fenBefore);
  board.move({ from: playedUci.slice(0, 2), to: playedUci.slice(2, 4), promotion: playedUci[4] });
  const best = bestUci && !playedIsBest ? computeMoveFacts(fenBefore, bestUci, bestPv) : null;
  return {
    before: computePositionFacts(fenBefore),
    after: computePositionFacts(board.fen()),
    played,
    best,
    bestSan: playedIsBest ? played.san : (best?.san ?? null),
  };
}

/** SAN for a UCI line from `fen`, stopping at the first illegal move. */
export function lineToSan(fen: string, ucis: string[]): Array<{ uci: string; san: string; fen: string }> {
  const board = new Chess(fen);
  const out: Array<{ uci: string; san: string; fen: string }> = [];
  for (const uci of ucis) {
    try {
      const move = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      out.push({ uci, san: move.san, fen: board.fen() });
    } catch {
      break;
    }
  }
  return out;
}
