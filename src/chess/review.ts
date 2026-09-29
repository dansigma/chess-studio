import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

export const REVIEW_DEPTH = 12;

const WIN_MULTIPLIER = -0.00368208;
const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const CP_CEILING = 1000;

export const REVIEW_LABELS = [
  "brilliant",
  "great",
  "book",
  "best",
  "interesting",
  "inaccuracy",
  "mistake",
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
  accuracy: number;
};

function clampCp(whitePawns: number): number {
  return Math.max(-CP_CEILING, Math.min(CP_CEILING, Math.round(whitePawns * 100)));
}

function playerCp(whitePawns: number, side: "w" | "b"): number {
  const cp = clampCp(whitePawns);
  return side === "w" ? cp : -cp;
}

export function sideMaterial(fen: string, side: Color): number {
  let total = 0;
  for (const row of new Chess(fen).board()) {
    for (const piece of row) {
      if (piece?.color === side) {
        total += PIECE_VALUE[piece.type];
      }
    }
  }
  return total;
}

export function isSacrifice(fenBefore: string, fenAfter: string, side: Color): boolean {
  return sideMaterial(fenAfter, side) < sideMaterial(fenBefore, side);
}

export function hangsPiece(fenBefore: string, fenAfter: string, uci: string, side: Color): boolean {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const moved = new Chess(fenBefore).get(from);
  if (!moved || moved.color !== side || moved.type === "p" || moved.type === "k") {
    return false;
  }
  const captured = new Chess(fenBefore).get(to);
  const capturedValue = captured && captured.color !== side ? PIECE_VALUE[captured.type] : 0;
  if (capturedValue === 0 || PIECE_VALUE[moved.type] <= capturedValue) {
    return false;
  }
  const after = new Chess(fenAfter);
  const opponent: Color = side === "w" ? "b" : "w";
  return after.isAttacked(to, opponent) && !after.isAttacked(to, side);
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
}): ReviewedMove {
  const prevCp = playerCp(input.before.whitePawns, input.side);
  const nextCp = playerCp(input.afterWhitePawns, input.side);
  const secondCp = input.before.secondWhitePawns == null ? null : playerCp(input.before.secondWhitePawns, input.side);
  const lossCp = Math.max(0, Math.round(prevCp - nextCp));
  const winDiff = winChance(prevCp) - winChance(nextCp);
  const playedBest = input.before.bestUci != null && input.playedUci === input.before.bestUci;
  const betterAlternative = !playedBest && prevCp > nextCp + 100;
  const accuracy = accuracyPercent(prevCp, nextCp);

  let label: ReviewLabel | null = null;
  if (betterAlternative && (winDiff > 20 || (lossCp > 400 && prevCp > 0))) {
    label = "blunder";
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
  } else if (winDiff <= 5 && winChance(nextCp) > 45) {
    label = "interesting";
  }

  return { label, lossCp, accuracy };
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
    book: 0,
    best: 0,
    interesting: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };
  for (const label of labels) {
    if (label) {
      counts[label] += 1;
    }
  }
  return counts;
}
