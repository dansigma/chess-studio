// SIG-959: deterministic position facts. Pure — no React, no engine, no store.
import { analyze, parseFen } from "./board";
import { memoize } from "./cache";
import { computeKingSafety } from "./king";
import { computeDiagonalFacts, computeFileFacts, computeSeventhRankFacts } from "./lines";
import { computeOutposts, computePawnFacts, computeWeakSquares } from "./pawns";
import { computePieceFacts } from "./pieces";
import type { PositionFacts } from "./types";

export * from "./types";
export { compareThreats, computeThreats, computeThreatsToMove } from "./threats";
export { computeMoveFacts } from "./move-facts";

function emptyFacts(fen: string): PositionFacts {
  return {
    fen,
    valid: false,
    turn: "w",
    pieces: [],
    skewers: [],
    files: [],
    seventhRank: [],
    diagonals: [],
    pawns: [],
    weakSquares: [],
    outposts: [],
    kings: [],
  };
}

export const computePositionFacts = memoize((fen: string): PositionFacts => {
  try {
    const parsed = parseFen(fen);
    if (!parsed) {
      return emptyFacts(fen);
    }
    const analysis = analyze(parsed.board);
    const { pieces, skewers } = computePieceFacts(analysis);
    return {
      fen,
      valid: true,
      turn: parsed.turn,
      pieces,
      skewers,
      files: computeFileFacts(analysis),
      seventhRank: computeSeventhRankFacts(analysis),
      diagonals: computeDiagonalFacts(analysis),
      pawns: computePawnFacts(analysis),
      weakSquares: computeWeakSquares(analysis),
      outposts: computeOutposts(analysis),
      kings: computeKingSafety(analysis, parsed.castling),
    };
  } catch {
    return emptyFacts(fen);
  }
});
