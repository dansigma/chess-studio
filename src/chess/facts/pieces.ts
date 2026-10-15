import {
  PIECE_VALUE,
  cheapest,
  isSafeSquare,
  opposite,
  sliderDirs,
  squareName,
  step,
  type Analysis,
  type Board,
} from "./board";
import type { PieceFact, PieceType, PinFact, SkewerFact, XrayFact } from "./types";

const TYPE_ORDER: Record<PieceType, number> = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };

type Contact = { slider: number; first: number; second: number | null };

/** For every slider ray: the first piece it meets and the one right behind it. */
function rayContacts(board: Board): Contact[] {
  const out: Contact[] = [];
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!piece) {
      continue;
    }
    for (const [df, dr] of sliderDirs(piece.type)) {
      let cursor = step(i, df, dr);
      let first = -1;
      while (cursor >= 0) {
        if (board[cursor]) {
          if (first < 0) {
            first = cursor;
          } else {
            out.push({ slider: i, first, second: cursor });
            first = -2;
            break;
          }
        }
        cursor = step(cursor, df, dr);
      }
      if (first >= 0) {
        out.push({ slider: i, first, second: null });
      }
    }
  }
  return out;
}

function movedBoard(board: Board, from: number, to: number): Board {
  const next = board.slice();
  next[to] = next[from] ?? null;
  next[from] = null;
  return next;
}

export function computePieceFacts(analysis: Analysis): {
  pieces: PieceFact[];
  skewers: SkewerFact[];
} {
  const { board, attacks, attackedBy } = analysis;
  const pins = new Map<number, PinFact & { value: number }>();
  const xrays = new Map<number, XrayFact[]>();
  const skewers: SkewerFact[] = [];

  for (const contact of rayContacts(board)) {
    const slider = board[contact.slider];
    const front = board[contact.first];
    const behind = contact.second === null ? null : board[contact.second];
    if (!slider || !front || !behind || contact.second === null) {
      continue;
    }
    if (behind.color !== slider.color && behind.type !== "p") {
      const list = xrays.get(contact.slider) ?? [];
      list.push({ through: squareName(contact.first), target: squareName(contact.second) });
      xrays.set(contact.slider, list);
    }
    // A pawn behind the front piece is nothing worth pinning or skewering.
    if (front.color === slider.color || behind.color !== front.color || behind.type === "p") {
      continue;
    }
    if (front.type === "k") {
      skewers.push({
        by: squareName(contact.slider),
        front: squareName(contact.first),
        behind: squareName(contact.second),
      });
    } else if (behind.type === "k") {
      pins.set(contact.first, {
        kind: "absolute",
        by: squareName(contact.slider),
        to: squareName(contact.second),
        value: Infinity,
      });
    } else if (PIECE_VALUE[behind.type] > PIECE_VALUE[front.type]) {
      const known = pins.get(contact.first);
      if (!known || (known.kind === "relative" && known.value < PIECE_VALUE[behind.type])) {
        pins.set(contact.first, {
          kind: "relative",
          by: squareName(contact.slider),
          to: squareName(contact.second),
          value: PIECE_VALUE[behind.type],
        });
      }
    } else if (PIECE_VALUE[front.type] > PIECE_VALUE[behind.type]) {
      skewers.push({
        by: squareName(contact.slider),
        front: squareName(contact.first),
        behind: squareName(contact.second),
      });
    }
  }

  const pieces: PieceFact[] = [];
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!piece) {
      continue;
    }
    const enemy = opposite(piece.color);
    const targets = attacks[i] ?? [];
    const attackerIdx = attackedBy[enemy][i] ?? [];
    const defenderIdx = attackedBy[piece.color][i] ?? [];
    const hanging =
      piece.type !== "k" &&
      attackerIdx.length > 0 &&
      (defenderIdx.length === 0 || cheapest(board, attackerIdx) < PIECE_VALUE[piece.type]);

    const safeSquares: string[] = [];
    if (piece.type !== "p" && piece.type !== "k") {
      for (const to of targets) {
        const occupant = board[to];
        if (occupant?.color === piece.color || occupant?.type === "k") {
          continue;
        }
        if (occupant && PIECE_VALUE[occupant.type] >= PIECE_VALUE[piece.type]) {
          safeSquares.push(squareName(to));
        } else if (isSafeSquare(movedBoard(board, i, to), to, piece)) {
          safeSquares.push(squareName(to));
        }
      }
    }

    const pin = pins.get(i);
    const forward = piece.type === "p" ? step(i, 0, piece.color === "w" ? 1 : -1) : -1;
    pieces.push({
      square: squareName(i),
      type: piece.type,
      color: piece.color,
      attacks: targets.map(squareName),
      attacksPieces: targets.filter((t) => board[t] && board[t]?.color !== piece.color).map(squareName),
      defends: targets.filter((t) => board[t]?.color === piece.color).map(squareName),
      attackers: attackerIdx.map(squareName),
      defenders: defenderIdx.map(squareName),
      hanging,
      pinned: pin ? { kind: pin.kind, by: pin.by, to: pin.to } : null,
      xrayThrough: xrays.get(i) ?? [],
      blocked: forward >= 0 && board[forward] !== null,
      trapped:
        hanging && piece.type !== "p" && piece.type !== "k" && safeSquares.length === 0,
      safeSquares,
    });
  }

  pieces.sort(
    (a, b) =>
      (a.color === b.color ? 0 : a.color === "w" ? -1 : 1) ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      a.square.localeCompare(b.square),
  );
  return { pieces, skewers };
}

