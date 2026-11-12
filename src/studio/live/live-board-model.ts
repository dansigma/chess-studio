// SIG-1292: pure model of a live board's notation. No React, no I/O.
//
// A game reaches the store either from the stream (a full PGN, authoritative) or from a polled JSON
// snapshot (only `fen` + `lastMove`; the store then sets `pgn` to null). The notation tree is kept
// in step with the snapshot: one new ply is appended locally from `lastMoveUci`; any bigger jump (or
// no tree yet) is "stale" and the caller refetches the round PGN.
import { Chess } from "chess.js";
import { fenKey, getNodeAt, goEnd, playMove, type GameTree, type Path } from "@/src/chess/tree";
import { fenPly } from "@/src/lib/live/merge";
import type { LiveGame } from "@/src/lib/live/types";
import type { Side } from "./live-clock";

/** Boards open at once. Past the cap the store refuses a new board (see `openBoard`). */
export const MAX_LIVE_BOARDS = 6;

export function mainlineLength(tree: GameTree): number {
  let length = 0;
  for (let node = tree.children[0]; node; node = node.children[0]) {
    length += 1;
  }
  return length;
}

/** Plies played according to the snapshot FEN (assumes the standard start position), or null. */
export function pliesPlayed(fen: string): number | null {
  const ply = fenPly(fen);
  return ply === null ? null : ply - 2;
}

export type Reconciled = {
  tree: GameTree | null;
  /** The tree is behind the game (or missing) and cannot be repaired locally: refetch the round PGN. */
  stale: boolean;
};

/**
 * Bring `tree` up to the game's position. Same length: unchanged (same object). One ply behind with a
 * `lastMoveUci` that leads to the game's FEN: append it. Anything else behind: stale.
 */
export function reconcileNotation(tree: GameTree | null, game: LiveGame): Reconciled {
  if (!tree) {
    return { tree: null, stale: true };
  }
  const target = pliesPlayed(game.fen);
  const length = mainlineLength(tree);
  if (target === null || length >= target) {
    return { tree, stale: false };
  }
  if (length + 1 === target && game.lastMoveUci) {
    const end = goEnd(tree, []);
    const endFen = getNodeAt(tree, end)?.fen ?? tree.startFen;
    const uci = game.lastMoveUci;
    try {
      const chess = new Chess(endFen, { skipValidation: true });
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
      if (fenKey(chess.fen()) === fenKey(game.fen)) {
        const next = playMove(tree, end, {
          san: move.san,
          uci,
          fen: chess.fen(),
          from: move.from,
          to: move.to,
        });
        return { tree: next.tree, stale: false };
      }
    } catch {
      // illegal against our tree: fall through to a refetch
    }
  }
  return { tree, stale: true };
}

/**
 * `[%clk]` of `side` at `path` (mainline): the clock the side had after its latest move at or before
 * that ply. Null when it has no clock there (no move yet, or the PGN carries no clocks).
 */
export function clockAtPath(tree: GameTree, path: Path, side: Side): number | null {
  const whiteFirst = (tree.startFen.split(/\s+/)[1] ?? "w") !== "b";
  const nodes: (number | undefined)[] = [];
  let siblings = tree.children;
  for (const index of path) {
    const node = siblings[index];
    if (!node) {
      break;
    }
    nodes.push(node.clockMs);
    siblings = node.children;
  }
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const mover: Side = (i % 2 === 0) === whiteFirst ? "white" : "black";
    if (mover === side) {
      return nodes[i] ?? null;
    }
  }
  return null;
}

/** The viewed path: `null` follows the latest move. A path that no longer exists (the line was corrected) follows too. */
export function resolveViewPath(tree: GameTree | null, browsing: Path | null): Path | null {
  if (!tree || browsing === null) {
    return null;
  }
  return browsing.length === 0 || getNodeAt(tree, browsing) ? browsing : null;
}
