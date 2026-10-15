import { Chess, type Move } from "chess.js";
import { applyNullMoveFen } from "../null-move";
import {
  PIECE_VALUE,
  analyze,
  attackersOf,
  attacksFrom,
  isSafeSquare,
  opposite,
  parseFen,
  squareIndex,
  squareName,
} from "./board";
import { memoize } from "./cache";
import type {
  Color,
  PieceType,
  Threat,
  ThreatComparison,
  ThreatKind,
  ThreatSet,
} from "./types";

const KIND_ORDER: Record<ThreatKind, number> = {
  "mate-in-1": 0,
  "hanging-capture": 1,
  "winning-capture": 2,
  fork: 3,
};

export function uciOf(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/**
 * Everything `by` could do with its legal moves in `chess` (where it is `by`'s
 * turn): mate in one, captures of loose or more valuable pieces, and forks.
 */
function threatsFor(chess: Chess, by: Color): Threat[] {
  const parsed = parseFen(chess.fen());
  if (!parsed) {
    return [];
  }
  const { board } = parsed;
  const analysis = analyze(board);
  const victimColor = opposite(by);
  const found = new Map<string, Threat>();

  const add = (kind: ThreatKind, move: Move, targets: string[]) => {
    const uci = uciOf(move);
    const id = `${kind}:${uci}`;
    if (!found.has(id)) {
      found.set(id, { id, kind, by, from: move.from, to: move.to, uci, targets });
    }
  };

  for (const move of chess.moves({ verbose: true })) {
    const from = squareIndex(move.from);
    const to = squareIndex(move.to);
    const enPassant = move.flags.includes("e");
    const victimIndex = enPassant ? squareIndex(`${move.to[0]}${move.from[1]}`) : to;

    if (move.san.endsWith("#")) {
      const king = analysis.kings[victimColor];
      add("mate-in-1", move, king === null ? [] : [squareName(king)]);
    }

    if (move.captured) {
      const defenders = analysis.attackedBy[victimColor][victimIndex] ?? [];
      if (defenders.length === 0) {
        add("hanging-capture", move, [squareName(victimIndex)]);
      } else if (move.piece !== "k" && PIECE_VALUE[move.captured] > PIECE_VALUE[move.piece]) {
        add("winning-capture", move, [squareName(victimIndex)]);
      }
    }

    if (move.piece === "k") {
      continue;
    }
    const landed = { type: (move.promotion ?? move.piece) as PieceType, color: by };
    const after = board.slice();
    after[from] = null;
    after[to] = landed;
    if (enPassant) {
      after[victimIndex] = null;
    }
    const targets = attacksFrom(after, to).filter((square) => {
      const piece = after[square];
      if (!piece || piece.color !== victimColor) {
        return false;
      }
      return (
        piece.type === "k" ||
        PIECE_VALUE[piece.type] > PIECE_VALUE[landed.type] ||
        attackersOf(after, square, victimColor).length === 0
      );
    });
    const meaningful = targets.some((square) => (after[square]?.type ?? "p") !== "p");
    if (targets.length >= 2 && meaningful && isSafeSquare(after, to, landed)) {
      add("fork", move, targets.map(squareName));
    }
  }

  return [...found.values()].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.uci.localeCompare(b.uci),
  );
}

function loadChess(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/** Threats of the side to move, using its real legal moves (no null move). */
export const computeThreatsToMove = memoize((fen: string): ThreatSet => {
  const chess = loadChess(fen);
  if (!chess) {
    return { by: "w", status: "invalid", threats: [] };
  }
  const by = chess.turn();
  if (chess.moves().length === 0) {
    return { by, status: "game-over", threats: [] };
  }
  return { by, status: "ok", threats: threatsFor(chess, by) };
});

/**
 * What the side NOT to move could do if it were its turn (null move). A side
 * in check cannot pass, so those positions report `in-check` with no threats.
 */
export const computeThreats = memoize((fen: string): ThreatSet => {
  const chess = loadChess(fen);
  if (!chess) {
    return { by: "w", status: "invalid", threats: [] };
  }
  const by = opposite(chess.turn());
  if (chess.moves().length === 0) {
    return { by, status: "game-over", threats: [] };
  }
  if (chess.inCheck()) {
    return { by, status: "in-check", threats: [] };
  }
  let passed: Chess | null = null;
  try {
    passed = loadChess(applyNullMoveFen(fen));
  } catch {
    passed = null;
  }
  if (!passed) {
    return { by, status: "invalid", threats: [] };
  }
  return { by, status: "ok", threats: threatsFor(passed, by) };
});

function playUci(chess: Chess, uci: string): Move | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    return null;
  }
  try {
    return chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
    });
  } catch {
    return null;
  }
}

export { playUci };

/**
 * Threats before and after `uci`. `before` is what the opponent threatens
 * against the mover; `after` what the opponent can still do once the move is
 * on the board; `created` the mover's own new follow-up threats.
 */
export const compareThreats = memoize((fenBefore: string, uci: string): ThreatComparison | null => {
  const chess = loadChess(fenBefore);
  if (!chess) {
    return null;
  }
  const mover = chess.turn();
  if (!playUci(chess, uci)) {
    return null;
  }
  const fenAfter = chess.fen();
  const before = computeThreats(fenBefore);
  const after = computeThreatsToMove(fenAfter);
  const followUps = computeThreats(fenAfter);
  const available = new Set(computeThreatsToMove(fenBefore).threats.map((t) => t.id));
  const created: ThreatSet = {
    ...followUps,
    threats: followUps.threats.filter((t) => !available.has(t.id)),
  };
  const beforeIds = new Set(before.threats.map((t) => t.id));
  const afterIds = new Set(after.threats.map((t) => t.id));
  return {
    mover,
    before,
    after,
    created,
    neutralized: before.threats.filter((t) => !afterIds.has(t.id)),
    persisting: before.threats.filter((t) => afterIds.has(t.id)),
    exposed: after.threats.filter((t) => !beforeIds.has(t.id)),
  };
});
