import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

export const REVIEW_DEPTH = 12;

const WIN_MULTIPLIER = -0.00368208;
const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const CP_CEILING = 1000;

export const REVIEW_LABELS = [
  "brilliant",
  "great",
  "best",
  "veryGood",
  "decent",
  "book",
  "inaccuracy",
  "mistake",
  "miss",
  "blunder",
] as const;

export type ReviewLabel = (typeof REVIEW_LABELS)[number];

export type PositionScore = {
  whitePawns: number;
  bestUci: string | null;
  secondWhitePawns: number | null;
  depth?: number;
};

export type ReviewedMove = {
  label: ReviewLabel | null;
  lossCp: number;
  /** Win-chance points the mover gave up versus the engine's best line (never negative). */
  winLoss: number;
  accuracy: number;
};

// "Miss": the mover squanders an advantage created by the opponent's previous
// error. Design decision: it needs all three conditions below, and it ranks
// between blunder (which keeps precedence) and mistake/inaccuracy (which it
// replaces). Tune here.
export const MISS_OPPONENT_LOSS = 10; // opponent's last move lost at least this many win-chance points
export const MISS_BEST_WIN_CHANCE = 70; // the best move here reaches at least this win chance (%)
export const MISS_OWN_LOSS = 10; // the played move loses at least this many points vs best

// Non-best moves are split by win-chance loss: <= VERY_GOOD_LOSS very good, <= DECENT_LOSS decent.
// Both tiers keep the old "interesting" guard: a move that leaves the mover
// clearly worse (win chance after the move <= NOT_LOST_WIN_CHANCE) is never
// "Very good" or "Decent", however small the loss, so a lost position is not
// praised.
export const VERY_GOOD_LOSS = 2;
export const DECENT_LOSS = 5;
export const NOT_LOST_WIN_CHANCE = 45;

function clampCp(whitePawns: number): number {
  return Math.max(-CP_CEILING, Math.min(CP_CEILING, Math.round(whitePawns * 100)));
}

function playerCp(whitePawns: number, side: "w" | "b"): number {
  const cp = clampCp(whitePawns);
  return side === "w" ? cp : -cp;
}

export function sideMaterialOn(board: Chess, side: Color): number {
  let total = 0;
  for (const row of board.board()) {
    for (const piece of row) {
      if (piece?.color === side) {
        total += PIECE_VALUE[piece.type];
      }
    }
  }
  return total;
}

export function sideMaterial(fen: string, side: Color): number {
  return sideMaterialOn(new Chess(fen), side);
}

export function isSacrificeOn(before: Chess, after: Chess, side: Color): boolean {
  // Detects any material decrease for `side` between the two boards, including
  // opponent captures (inherited `isSacrifice` semantics). Callers decide
  // whether that counts as a voluntary sacrifice. Promoted pawns still count
  // as pawns in `sideMaterialOn`, so promotions are not valued here.
  return sideMaterialOn(after, side) < sideMaterialOn(before, side);
}

export function isSacrifice(fenBefore: string, fenAfter: string, side: Color): boolean {
  return isSacrificeOn(new Chess(fenBefore), new Chess(fenAfter), side);
}

export function hangsPieceOn(before: Chess, after: Chess, uci: string, side: Color): boolean {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const moved = before.get(from);
  if (!moved || moved.color !== side || moved.type === "p" || moved.type === "k") {
    return false;
  }
  const captured = before.get(to);
  const capturedValue = captured && captured.color !== side ? PIECE_VALUE[captured.type] : 0;
  if (capturedValue === 0 || PIECE_VALUE[moved.type] <= capturedValue) {
    return false;
  }
  const opponent: Color = side === "w" ? "b" : "w";
  return after.isAttacked(to, opponent) && !after.isAttacked(to, side);
}

export function hangsPiece(fenBefore: string, fenAfter: string, uci: string, side: Color): boolean {
  return hangsPieceOn(new Chess(fenBefore), new Chess(fenAfter), uci, side);
}

export function lineHolds(side: "w" | "b", bestWhitePawns: number, playedWhitePawns: number): boolean {
  const best = playerCp(bestWhitePawns, side);
  const played = playerCp(playedWhitePawns, side);
  return played >= best - 30;
}

export function winChance(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(WIN_MULTIPLIER * cp)) - 1);
}

export function accuracyPercent(prevCp: number, nextCp: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * (winChance(prevCp) - winChance(nextCp))) - 3.1669 + 1;
  return Math.max(0, Math.min(100, raw));
}

export function gradeMove(input: {
  side: "w" | "b";
  playedUci: string;
  before: PositionScore;
  afterWhitePawns: number;
  sacrifice: boolean;
  /** Win-chance points the opponent's previous move lost; enables "miss". */
  opponentLastLoss?: number;
}): ReviewedMove {
  const prevCp = playerCp(input.before.whitePawns, input.side);
  const nextCp = playerCp(input.afterWhitePawns, input.side);
  const secondCp = input.before.secondWhitePawns == null ? null : playerCp(input.before.secondWhitePawns, input.side);
  const lossCp = Math.max(0, Math.round(prevCp - nextCp));
  const winDiff = winChance(prevCp) - winChance(nextCp);
  const playedBest = input.before.bestUci != null && input.playedUci === input.before.bestUci;
  const betterAlternative = !playedBest && prevCp > nextCp + 100;
  const accuracy = accuracyPercent(prevCp, nextCp);
  const winLoss = Math.max(0, winDiff);
  const isMiss =
    betterAlternative &&
    (input.opponentLastLoss ?? 0) >= MISS_OPPONENT_LOSS &&
    winChance(prevCp) >= MISS_BEST_WIN_CHANCE &&
    winDiff >= MISS_OWN_LOSS;

  let label: ReviewLabel | null = null;
  if (betterAlternative && (winDiff > 20 || (lossCp > 400 && prevCp > 0))) {
    label = "blunder";
  } else if (isMiss) {
    label = "miss";
  } else if (betterAlternative && (winDiff > 10 || (lossCp > 200 && prevCp > 100))) {
    label = "mistake";
  } else if (betterAlternative && (winDiff > 5 || (lossCp > 100 && prevCp >= 0))) {
    label = "inaccuracy";
  } else if (
    playedBest &&
    input.sacrifice &&
    winChance(prevCp) >= 25 &&
    winChance(nextCp) >= 25 &&
    secondCp != null &&
    (prevCp - secondCp >= 150 || winChance(prevCp) - winChance(secondCp) > 10)
  ) {
    label = "brilliant";
  } else if (playedBest && secondCp != null && winChance(prevCp) - winChance(secondCp) > 10) {
    label = "great";
  } else if (playedBest) {
    label = "best";
  } else if (winChance(nextCp) > NOT_LOST_WIN_CHANCE && winDiff <= VERY_GOOD_LOSS) {
    label = "veryGood";
  } else if (winChance(nextCp) > NOT_LOST_WIN_CHANCE && winDiff <= DECENT_LOSS) {
    label = "decent";
  }

  return { label, lossCp, winLoss, accuracy };
}

const BOOK_KEEPS: ReadonlySet<ReviewLabel> = new Set(["brilliant", "great", "best"]);

export function mergeBookLabel(inBook: boolean, label: ReviewLabel | null): ReviewLabel | null {
  if (!inBook) {
    return label;
  }
  return label && BOOK_KEEPS.has(label) ? label : "book";
}

export function bookFlags(playedUcis: string[], replies: Array<readonly string[] | null>): boolean[] {
  const flags = playedUcis.map(() => false);
  for (let index = 0; index < playedUcis.length; index += 1) {
    const repliesAtPly = replies[index];
    if (!repliesAtPly || !repliesAtPly.includes(playedUcis[index])) {
      break;
    }
    flags[index] = true;
  }
  return flags;
}

export function harmonicAccuracy(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((total, value) => total + 1 / Math.max(value, 0.5), 0);
  return Math.round((values.length / sum) * 10) / 10;
}

export function countLabels(labels: Array<ReviewLabel | null>): Record<ReviewLabel, number> {
  const counts = {
    brilliant: 0,
    great: 0,
    best: 0,
    veryGood: 0,
    decent: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    miss: 0,
    blunder: 0,
  };
  for (const label of labels) {
    if (label) {
      counts[label] += 1;
    }
  }
  return counts;
}
