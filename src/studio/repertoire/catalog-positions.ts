import { Chess, type Square } from "chess.js";
import { fenKey } from "@/src/chess/tree";
import type { CatalogLine } from "@/src/lib/openings-catalog";

type PositionMatch<T> = { line: T; ply: number };
type InternalMove = { from: number; to: number; promotion?: string };

function playUci(chess: Chess, uci: string) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

// chess.js represents squares as 0x88 offsets starting at a8.
function squareOffset(square: string) {
  return (8 - Number(square[1])) * 16 + square.charCodeAt(0) - "a".charCodeAt(0);
}

type ChessInternals = {
  _moves?: unknown;
  _moveToSan?: unknown;
  _makeMove?: unknown;
};

// The fast path relies on chess.js private methods (about 4x faster than the
// public move()). If an upgrade renames them, fall back to the public API.
function hasInternals(chess: Chess) {
  const internals = chess as unknown as ChessInternals;
  return typeof internals._moves === "function"
    && typeof internals._moveToSan === "function"
    && typeof internals._makeMove === "function";
}

function catalogMove(chess: Chess, uci: string) {
  if (!hasInternals(chess)) {
    const move = playUci(chess, uci);
    return { san: move.san, after: move.after };
  }
  const from = uci.slice(0, 2) as Square;
  const source = squareOffset(from);
  const target = squareOffset(uci.slice(2, 4));
  const piece = chess.get(from)?.type;
  if (!piece) throw new Error(`Invalid catalog move: ${uci}`);

  // Catalog moves were validated when generated. Use chess.js's internal move
  // generator and SAN formatter to avoid the extra work in its verbose Move.
  // Only ambiguous SAN needs to check whether competing moves are legal.
  const options = piece === "p" ? { square: from } : { piece };
  const candidates: InternalMove[] = chess["_moves"]({ ...options, legal: false });
  let moves = candidates.filter((move) => move.to === target);
  if (piece !== "p" && moves.some((move) => move.from !== source)) {
    const legal: InternalMove[] = chess["_moves"](options);
    moves = legal.filter((move) => move.to === target);
  }
  const move = moves.find((move) => move.from === source && move.promotion === uci[4]);
  if (!move) throw new Error(`Invalid catalog move: ${uci}`);
  const san = chess["_moveToSan"](move, moves);
  chess["_makeMove"](move);
  return { san, after: chess.fen() };
}

export function replayCatalogPath(uci: readonly string[]) {
  const chess = new Chess();
  const keys = uci.map((move) => fenKey(playUci(chess, move).after));
  return { fen: chess.fen(), keys };
}

export function buildCatalogPositionIndex<T extends CatalogLine>(lines: readonly T[]) {
  const matches = new Map<string, PositionMatch<T>[]>();
  const endings = new Map<string, T>();
  const notation = new Map<T, string[]>();
  const prefixes = new Map<string, { fen: string; key: string; san: string }>();

  for (const line of lines) {
    let prefix = "";
    let fen: string | undefined;
    let chess: Chess | undefined;
    const plies = new Map<string, number>();
    const moves: string[] = [];

    for (const [index, uci] of line.uci.entries()) {
      prefix = prefix ? `${prefix} ${uci}` : uci;
      let position = prefixes.get(prefix);
      if (!position) {
        chess ??= new Chess(fen);
        const move = catalogMove(chess, uci);
        position = { fen: move.after, key: fenKey(move.after), san: move.san };
        prefixes.set(prefix, position);
      }

      fen = position.fen;
      moves.push(position.san);
      const ply = index + 1;
      // A repeated position contributes one row. Prefer the ending when it matches.
      if (!plies.has(position.key) || ply === line.uci.length) plies.set(position.key, ply);
      if (ply === line.uci.length) {
        const ending = endings.get(position.key);
        if (!ending || ply < ending.uci.length) endings.set(position.key, line);
      }
    }

    for (const [key, ply] of plies) {
      const rows = matches.get(key);
      const match = { line, ply };
      if (rows) rows.push(match);
      else matches.set(key, [match]);
    }
    notation.set(line, moves);
  }

  return {
    matches,
    notation,
    deepestEnding(keys: readonly string[]) {
      for (let index = keys.length - 1; index >= 0; index--) {
        const ending = endings.get(keys[index]);
        if (ending) return ending;
      }
    },
  };
}

type CatalogPositionIndex = ReturnType<typeof buildCatalogPositionIndex<CatalogLine>>;
const indexes = new WeakMap<readonly CatalogLine[], CatalogPositionIndex>();

export function catalogPositionIndex<T extends CatalogLine>(lines: readonly T[]) {
  let index = indexes.get(lines);
  if (!index) {
    index = buildCatalogPositionIndex(lines);
    indexes.set(lines, index);
  }
  return index as ReturnType<typeof buildCatalogPositionIndex<T>>;
}
