"use client";

import { useCallback, useState } from "react";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import { fenKey, findPathForFen, getNodeAt, type Path } from "@/src/chess/tree";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import type { ExplorerResponse } from "@/src/lib/explorer-types";
import { useActiveFen } from "@/src/store/hooks";

type Locked = { fen: string; path: Path; label: string | null };

export type LockablePosition = {
  /** The position the panel shows: the locked one, else the board's. */
  fen: string;
  locked: boolean;
  lock: () => void;
  unlock: () => void;
  /** Move that reached the locked position ("12…Nf6"); null at the start. */
  lockedLabel: string | null;
  /** Node path of the locked position when it was locked. */
  lockedPath: Path | null;
  /** False when a locked position is not a node of the active game. */
  canPlay: boolean;
  /** Plays a move from the shown position (goes to the locked node first). */
  playUci: (from: string, to: string, promotion?: string) => boolean;
};

/** SIG-1455: panel-local position lock for the explorer-family panels. */
export function useLockablePosition(): LockablePosition {
  const activeFen = useActiveFen();
  const [locked, setLocked] = useState<Locked | null>(null);
  const lockedFen = locked?.fen ?? null;
  const canPlay = useStudioStore((state) => {
    if (!lockedFen) return true;
    return findPathForFen(selectActiveBoard(state).tree, lockedFen, locked?.path) !== null;
  });

  const lock = useCallback(() => {
    const state = useStudioStore.getState();
    const board = selectActiveBoard(state);
    const node = getNodeAt(board.tree, board.path);
    const fen = node?.fen ?? board.tree.startFen;
    let label: string | null = null;
    if (node) {
      const ply = board.path.length;
      const before = ply === 1 ? board.tree.startFen : (getNodeAt(board.tree, board.path.slice(0, -1))?.fen ?? board.tree.startFen);
      const side = sideFromFen(before);
      const startMove = Number(board.tree.startFen.split(/\s+/)[5]) || 1;
      const startSide = sideFromFen(board.tree.startFen);
      const number = startMove + Math.floor((ply - 1 + (startSide === "b" ? 1 : 0)) / 2);
      const san = formatSan(node.san, state.settings.moveNotation, side);
      label = `${number}${side === "w" ? "." : "…"}${san}`;
    }
    setLocked({ fen, path: [...board.path], label });
  }, []);
  const unlock = useCallback(() => setLocked(null), []);

  const playUci = useCallback(
    (from: string, to: string, promotion?: string) => {
      const state = useStudioStore.getState();
      if (lockedFen) {
        const path = findPathForFen(selectActiveBoard(state).tree, lockedFen, locked?.path);
        if (!path) return false;
        state.goPath(path);
      }
      return useStudioStore.getState().makeUciMove(from, to, promotion);
    },
    [lockedFen, locked],
  );

  return {
    fen: lockedFen ?? activeFen,
    locked: locked !== null,
    lock,
    unlock,
    lockedLabel: locked?.label ?? null,
    lockedPath: locked?.path ?? null,
    canPlay,
    playUci,
  };
}

/**
 * SIG-1455: the data a locked panel renders. Its own query wins once it has
 * answered for the locked position; until then the shared feed bridges the
 * gap only if it still shows that same position (no one-frame empty flash).
 */
export function lockedExplorerData(
  own: ExplorerResponse | null,
  shared: ExplorerResponse | null,
  fen: string,
): ExplorerResponse | null {
  const key = fenKey(fen);
  if (own && fenKey(own.fen) === key) return own;
  return shared && fenKey(shared.fen) === key ? shared : null;
}
