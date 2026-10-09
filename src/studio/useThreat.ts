"use client";

import { useEffect } from "react";
import { Chess } from "chess.js";
import { acquire } from "@/src/engine/shared-engine";
import { applyNullMoveFen } from "@/src/chess/null-move";
import { useActiveFen } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";

export const THREAT_DEPTH = 14;

const SQUARE_RE = /^[a-h][1-8]$/;

/** Compute the null-move FEN to analyze for the threat, or null for no-op positions. */
export function threatNullFenFor(fen: string): string | null {
  try {
    const chess = new Chess(fen);
    if (chess.isGameOver()) {
      return null;
    }
    const nullFen = applyNullMoveFen(fen);
    const reply = new Chess(nullFen);
    if (reply.moves().length === 0) {
      return null;
    }
    return nullFen;
  } catch {
    return null;
  }
}

/** Split a UCI string into arrow squares, or null when malformed. */
export function threatSquaresFromUci(uci: string | undefined): { from: string; to: string } | null {
  if (!uci || uci.length < 4) {
    return null;
  }
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (!SQUARE_RE.test(from) || !SQUARE_RE.test(to) || from === to) {
    return null;
  }
  return { from, to };
}

/**
 * SIG-906: one-shot opponent-threat computation. When `showThreat` is on,
 * analyzes the null-move FEN on the dedicated `threat` slot (highest priority,
 * preempts EnginePanel) and stores the first best-line move as `threat`.
 * Ephemeral: cleared on position change / toggle-off; never touches node marks.
 */
export function useThreat(): void {
  // Real position, NOT useBoardFen (preview FENs must not drive the threat).
  const fen = useActiveFen();
  const showThreat = useStudioStore((state) => state.showThreat);
  const build = useStudioStore((state) => state.settings.engineBuild);
  const threads = useStudioStore((state) => state.settings.engineThreads);

  useEffect(() => {
    const store = useStudioStore.getState();
    if (!showThreat) {
      store.setThreat(null);
      return;
    }
    const nullFen = threatNullFenFor(fen);
    if (!nullFen) {
      store.setThreat(null);
      return;
    }
    let cancelled = false;
    const lease = acquire("threat", build);
    const unsubscribe = lease.subscribe((info) => {
      if (cancelled || info.failed || !info.ready) {
        return;
      }
      // SIG-851 style guard: ignore snapshots for a FEN we already left.
      if (info.fen !== nullFen) {
        return;
      }
      const uci = info.lines[0]?.pvUci[0];
      if (!uci || uci.length < 4) {
        return;
      }
      if (threatSquaresFromUci(uci) === null) {
        return;
      }
      if (useStudioStore.getState().showThreat === false) {
        return;
      }
      // FEN-guard like enginePreview.key/info.fen: pin the arrow to the
      // position it was computed for; render re-checks threat.fen.
      useStudioStore.getState().setThreat({ uci, fen });
      // One-shot: free the worker so the preempted victim resumes.
      lease.stop();
      lease.release();
    });
    lease.analyze(nullFen, THREAT_DEPTH, 1, threads);
    return () => {
      cancelled = true;
      unsubscribe();
      lease.stop();
      lease.release();
      useStudioStore.getState().setThreat(null);
    };
  }, [fen, showThreat, build, threads]);
}
