import { Chess } from "chess.js";
import { sideMaterialOn } from "../review";
import {
  PIECE_VALUE,
  analyze,
  attacksFrom,
  isSafeSquare,
  opposite,
  parseFen,
  squareIndex,
  squareName,
} from "./board";
import { memoize } from "./cache";
import { compareThreats, playUci } from "./threats";
import type { Color, MoveFacts, PieceType, PvFacts } from "./types";

function loadChess(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function balance(chess: Chess, side: Color): number {
  return sideMaterialOn(chess, side) - sideMaterialOn(chess, opposite(side));
}

type PvRun = PvFacts & { lastMoverTurnDelta: number };

function walkPv(fenAfter: string, line: string[], mover: Color, base: number): PvRun | null {
  const walker = loadChess(fenAfter);
  if (!walker) {
    return null;
  }
  const moves: string[] = [];
  let min = 0;
  let lastMoverTurnDelta = balance(walker, mover) - base;
  min = lastMoverTurnDelta;
  for (const uci of line) {
    if (!playUci(walker, uci)) {
      break;
    }
    moves.push(uci);
    if (walker.turn() === mover) {
      lastMoverTurnDelta = balance(walker, mover) - base;
      min = Math.min(min, lastMoverTurnDelta);
    }
  }
  return {
    moves,
    materialDelta: balance(walker, mover) - base,
    minMaterialDelta: min,
    endsInMate: walker.isCheckmate() && walker.turn() !== mover,
    lastMoverTurnDelta,
  };
}

function compute(fenBefore: string, uci: string, pvKey: string): MoveFacts | null {
  const start = loadChess(fenBefore);
  const chess = loadChess(fenBefore);
  const before = parseFen(fenBefore);
  if (!start || !chess || !before) {
    return null;
  }
  const move = playUci(chess, uci);
  const fenAfter = chess.fen();
  const after = move ? parseFen(fenAfter) : null;
  if (!move || !after) {
    return null;
  }
  const mover = move.color;
  const from = squareIndex(move.from);
  const to = squareIndex(move.to);
  const enPassant = move.flags.includes("e");
  const victimIndex = enPassant ? squareIndex(`${move.to[0]}${move.from[1]}`) : to;
  const prior = analyze(before.board);
  const now = analyze(after.board);

  const reach = attacksFrom(after.board, to);
  const control = (list: ReturnType<typeof analyze>): Set<number> => {
    const set = new Set<number>();
    list.board.forEach((piece, index) => {
      if (piece?.color === mover) {
        for (const square of list.attacks[index] ?? []) {
          set.add(square);
        }
      }
    });
    return set;
  };
  const controlBefore = control(prior);
  const newlyControlled = [...control(now)]
    .filter((square) => !controlBefore.has(square))
    .sort((a, b) => a - b)
    .map(squareName);

  const unblocks: MoveFacts["unblocks"] = [];
  const blocks: MoveFacts["blocks"] = [];
  for (let i = 0; i < 64; i++) {
    const was = before.board[i];
    const is = after.board[i];
    if (!was || !is || i === from || i === to || was.type !== is.type || was.color !== is.color) {
      continue;
    }
    const oldSet = new Set(prior.attacks[i]);
    const newSet = new Set(now.attacks[i]);
    if (is.color === mover) {
      const gained = [...newSet].filter((square) => !oldSet.has(square));
      if (gained.length > 0) {
        unblocks.push({ square: squareName(i), gained: gained.sort((a, b) => a - b).map(squareName) });
      }
    } else {
      const lost = [...oldSet].filter((square) => !newSet.has(square));
      if (lost.length > 0) {
        blocks.push({ square: squareName(i), lost: lost.sort((a, b) => a - b).map(squareName) });
      }
    }
  }

  const landed = after.board[to];
  const capturedValue = move.captured ? PIECE_VALUE[move.captured] : 0;
  const staticSacrifice =
    move.piece !== "k" &&
    landed !== null &&
    !isSafeSquare(after.board, to, landed) &&
    PIECE_VALUE[move.piece] - capturedValue >= 2;

  const given = pvKey ? pvKey.split(" ") : [];
  const line = given[0] === uci ? given.slice(1) : given;
  const run = pvKey ? walkPv(fenAfter, line, mover, balance(start, mover)) : null;
  const pv: PvFacts | null = run
    ? {
        moves: run.moves,
        materialDelta: run.materialDelta,
        minMaterialDelta: run.minMaterialDelta,
        endsInMate: run.endsInMate,
      }
    : null;
  const pvSacrifice =
    run !== null &&
    run.moves.length > 0 &&
    run.minMaterialDelta <= -2 &&
    (run.endsInMate || run.lastMoverTurnDelta <= -2);

  const comparison = compareThreats(fenBefore, uci);
  return {
    uci,
    san: move.san,
    mover,
    piece: move.piece as PieceType,
    from: move.from,
    to: move.to,
    promotion: (move.promotion ?? null) as PieceType | null,
    capture: move.captured
      ? { type: move.captured as PieceType, square: squareName(victimIndex), enPassant }
      : null,
    castle: move.flags.includes("k") ? "k" : move.flags.includes("q") ? "q" : null,
    check: move.san.includes("+") || move.san.includes("#"),
    mate: move.san.includes("#"),
    sacrifice: staticSacrifice || pvSacrifice,
    attacks: reach.filter((s) => after.board[s] && after.board[s]?.color !== mover).map(squareName),
    defends: reach.filter((s) => after.board[s]?.color === mover).map(squareName),
    newlyControlled,
    unblocks,
    blocks,
    threats: {
      neutralized: comparison?.neutralized ?? [],
      created: comparison?.created.threats ?? [],
      exposed: comparison?.exposed ?? [],
    },
    pv,
  };
}

const cached = memoize(compute, 128);

/**
 * Facts about `uci` played from `fenBefore`; null when the move is not legal
 * there. `pv` is an optional engine continuation (UCI): it may start with the
 * move itself or with the reply. The module never runs an engine.
 */
export function computeMoveFacts(fenBefore: string, uci: string, pv?: string[]): MoveFacts | null {
  return cached(fenBefore, uci, pv && pv.length > 0 ? pv.join(" ") : "");
}
