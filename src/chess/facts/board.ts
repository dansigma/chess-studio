import type { Color, PieceType } from "./types";

export type Piece = { type: PieceType; color: Color };
/** 64 squares, index = rank * 8 + file, rank 0 is rank "1", file 0 is "a". */
export type Board = Array<Piece | null>;

export type ParsedFen = {
  board: Board;
  turn: Color;
  castling: string;
  enPassant: string | null;
};

/** Material value used for comparing pieces; the king is never traded. */
export const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** Ordering of capturers: the king always captures last. */
export const ATTACKER_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

const FILES = "abcdefgh";
type Dir = readonly [number, number];
const ROOK_DIRS: readonly Dir[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS: readonly Dir[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT_STEPS: readonly Dir[] = [
  [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1],
];
const KING_STEPS: readonly Dir[] = [...ROOK_DIRS, ...BISHOP_DIRS];

export const fileOf = (index: number): number => index & 7;
export const rankOf = (index: number): number => index >> 3;
export const opposite = (color: Color): Color => (color === "w" ? "b" : "w");

export function squareName(index: number): string {
  return `${FILES[index & 7]}${(index >> 3) + 1}`;
}

export function squareIndex(square: string): number {
  const file = FILES.indexOf(square[0] ?? "");
  const rank = Number(square[1]) - 1;
  if (file < 0 || !Number.isInteger(rank) || rank < 0 || rank > 7) {
    return -1;
  }
  return rank * 8 + file;
}

/** Rank counted from `color`'s own side: 0 = its back rank. */
export function relativeRank(index: number, color: Color): number {
  return color === "w" ? rankOf(index) : 7 - rankOf(index);
}

export function sliderDirs(type: PieceType): readonly Dir[] {
  if (type === "r") {
    return ROOK_DIRS;
  }
  if (type === "b") {
    return BISHOP_DIRS;
  }
  if (type === "q") {
    return KING_STEPS;
  }
  return [];
}

export function parseFen(fen: string): ParsedFen | null {
  const parts = fen.trim().split(/\s+/);
  const rows = (parts[0] ?? "").split("/");
  if (rows.length !== 8) {
    return null;
  }
  const board: Board = new Array<Piece | null>(64).fill(null);
  for (let row = 0; row < 8; row++) {
    const rank = 7 - row;
    let file = 0;
    for (const ch of rows[row] ?? "") {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
        continue;
      }
      const type = ch.toLowerCase() as PieceType;
      if (file > 7 || !"pnbrqk".includes(type)) {
        return null;
      }
      board[rank * 8 + file] = { type, color: ch === type ? "b" : "w" };
      file++;
    }
    if (file !== 8) {
      return null;
    }
  }
  const ep = parts[3];
  return {
    board,
    turn: parts[1] === "b" ? "b" : "w",
    castling: parts[2] && parts[2] !== "-" ? parts[2] : "",
    enPassant: ep && ep !== "-" ? ep : null,
  };
}

export function step(index: number, df: number, dr: number): number {
  const file = fileOf(index) + df;
  const rank = rankOf(index) + dr;
  return file < 0 || file > 7 || rank < 0 || rank > 7 ? -1 : rank * 8 + file;
}

/** Squares the piece on `index` attacks (or defends); blockers are included. */
export function attacksFrom(board: Board, index: number): number[] {
  const piece = board[index];
  if (!piece) {
    return [];
  }
  const out: number[] = [];
  if (piece.type === "p") {
    const dr = piece.color === "w" ? 1 : -1;
    for (const df of [-1, 1]) {
      const to = step(index, df, dr);
      if (to >= 0) {
        out.push(to);
      }
    }
    return out;
  }
  if (piece.type === "n" || piece.type === "k") {
    for (const [df, dr] of piece.type === "n" ? KNIGHT_STEPS : KING_STEPS) {
      const to = step(index, df, dr);
      if (to >= 0) {
        out.push(to);
      }
    }
    return out;
  }
  for (const [df, dr] of sliderDirs(piece.type)) {
    let to = step(index, df, dr);
    while (to >= 0) {
      out.push(to);
      if (board[to]) {
        break;
      }
      to = step(to, df, dr);
    }
  }
  return out;
}

/** Pieces of `color` attacking `target`, found by looking outward from it. */
export function attackersOf(board: Board, target: number, color: Color): number[] {
  const out: number[] = [];
  const pawnRank = color === "w" ? -1 : 1;
  for (const df of [-1, 1]) {
    const from = step(target, df, pawnRank);
    const piece = from >= 0 ? board[from] : null;
    if (piece && piece.color === color && piece.type === "p") {
      out.push(from);
    }
  }
  for (const [df, dr] of KNIGHT_STEPS) {
    const from = step(target, df, dr);
    const piece = from >= 0 ? board[from] : null;
    if (piece && piece.color === color && piece.type === "n") {
      out.push(from);
    }
  }
  for (const [df, dr] of KING_STEPS) {
    const from = step(target, df, dr);
    const piece = from >= 0 ? board[from] : null;
    if (piece && piece.color === color && piece.type === "k") {
      out.push(from);
    }
  }
  for (const dirs of [ROOK_DIRS, BISHOP_DIRS]) {
    const wanted = dirs === ROOK_DIRS ? "r" : "b";
    for (const [df, dr] of dirs) {
      let from = step(target, df, dr);
      while (from >= 0) {
        const piece = board[from];
        if (piece) {
          if (piece.color === color && (piece.type === wanted || piece.type === "q")) {
            out.push(from);
          }
          break;
        }
        from = step(from, df, dr);
      }
    }
  }
  return out.sort((a, b) => a - b);
}

export type Analysis = {
  board: Board;
  /** attacks[i]: squares attacked by the piece on i (empty if none). */
  attacks: number[][];
  /** attackedBy[color][sq]: squares of `color` pieces attacking sq. */
  attackedBy: Record<Color, number[][]>;
  kings: Record<Color, number | null>;
};

export function analyze(board: Board): Analysis {
  const attacks: number[][] = [];
  const attackedBy: Record<Color, number[][]> = {
    w: Array.from({ length: 64 }, () => []),
    b: Array.from({ length: 64 }, () => []),
  };
  const kings: Record<Color, number | null> = { w: null, b: null };
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    const list = piece ? attacksFrom(board, i).sort((a, b) => a - b) : [];
    attacks.push(list);
    if (!piece) {
      continue;
    }
    if (piece.type === "k") {
      kings[piece.color] = i;
    }
    for (const to of list) {
      attackedBy[piece.color][to]?.push(i);
    }
  }
  return { board, attacks, attackedBy, kings };
}

/** Cheapest capturer value among `squares`, Infinity when there is none. */
export function cheapest(board: Board, squares: number[]): number {
  let best = Infinity;
  for (const index of squares) {
    const piece = board[index];
    if (piece) {
      best = Math.min(best, ATTACKER_VALUE[piece.type]);
    }
  }
  return best;
}

/** A piece standing on `index` would not simply be lost there. */
export function isSafeSquare(board: Board, index: number, mover: Piece): boolean {
  const enemy = attackersOf(board, index, opposite(mover.color));
  if (enemy.length === 0) {
    return true;
  }
  const defended = attackersOf(board, index, mover.color).length > 0;
  return defended && cheapest(board, enemy) >= ATTACKER_VALUE[mover.type];
}
