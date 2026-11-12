"use client";

import { useEffect, useMemo, useState } from "react";
import { importPgn } from "@/src/chess/pgn";
import type { GameTree } from "@/src/chess/tree";
import type { LiveGame } from "@/src/lib/live/types";
import { reconcileNotation } from "./live-board-model";
import { requestGamePgn } from "./live-round-pgn";

type Known = { pgn: string | null; tree: GameTree };

/**
 * Notation tree of a live game. A streamed `game.pgn` is authoritative. Without it (polled round) the
 * last known tree is advanced by one ply from `lastMoveUci`, and refetched from the round PGN when the
 * game moved by more than one ply or no tree exists yet. At most one refetch per position (`fen`).
 */
export function useLiveBoardNotation(roundId: string, gameId: string, game: LiveGame | undefined): GameTree | null {
  const [known, setKnown] = useState<Known | null>(null);
  if (game?.pgn && known?.pgn !== game.pgn) {
    setKnown({ pgn: game.pgn, tree: importPgn(game.pgn).tree });
  }
  const reconciled = useMemo(() => (game ? reconcileNotation(known?.tree ?? null, game) : null), [known, game]);
  if (reconciled && !reconciled.stale && reconciled.tree && reconciled.tree !== known?.tree) {
    setKnown({ pgn: game?.pgn ?? null, tree: reconciled.tree });
  }
  const stale = reconciled?.stale ?? false;
  const fen = game?.fen;

  useEffect(() => {
    if (!stale) {
      return;
    }
    let cancelled = false;
    requestGamePgn(roundId, gameId).then(
      (pgn) => {
        if (!cancelled && pgn) {
          setKnown({ pgn: null, tree: importPgn(pgn).tree });
        }
      },
      () => undefined, // rate limits show in the connection indicator; the next position retries
    );
    return () => {
      cancelled = true;
    };
  }, [roundId, gameId, fen, stale]);

  return known?.tree ?? null;
}
