"use client";

import { useEffect, useRef, useState } from "react";
import { acquire, type SharedEngineLease } from "@/src/engine/shared-engine";
import { formatScore, scoreNumber, type EngineInfo } from "@/src/engine/stockfish-client";
import { throttleLatest } from "@/src/lib/throttle";
import { useStudioStore } from "@/src/store/studio-store";

/**
 * Depth cap for the eval bar. A bar only needs a stable sign and rough magnitude, not the
 * depth-40 precision of the Studio panel, and `go` here is depth-only (no movetime). Depth 18
 * settles within a second or two on one thread and keeps the shared worker cheap while a game
 * streams a new position every few seconds; a deeper search would rarely finish before the next move.
 */
export const LIVE_EVAL_DEPTH = 18;
export const LIVE_EVAL_THROTTLE_MS = 150;

export type LiveEval = { pawns: number; label: string };

function sideToMove(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** White-POV eval of the first line, or null while no line exists yet. */
export function evalFromInfo(info: EngineInfo, fen: string): LiveEval | null {
  const line = info.lines[0];
  if (!line) {
    return null;
  }
  const side = sideToMove(fen);
  return { pawns: scoreNumber(line, side), label: formatScore(line, side) };
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

/**
 * Eval of `fen` (White's point of view) on the shared worker's `live` slot. The lease is held only
 * while `enabled` and the tab is visible, and is released on unmount; mount it for the focused board
 * only. Each new FEN calls `analyze` directly (it stops the running search itself).
 *
 * SIG-1312: null until the engine has a line (and again once disabled): a missing eval is never
 * shown as `0.00`. Pass `enabled: false` when the shown ply already has a PGN `[%eval]`, so the lease is released.
 */
export function useLiveEval(fen: string | null, { enabled }: { enabled: boolean }): LiveEval | null {
  const build = useStudioStore((s) => s.settings.engineBuild);
  const visible = usePageVisible();
  const active = enabled && visible && fen !== null;
  const [value, setValue] = useState<LiveEval | null>(null);
  const leaseRef = useRef<SharedEngineLease | null>(null);
  const fenRef = useRef(fen);
  useEffect(() => {
    fenRef.current = fen;
  }, [fen]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const lease = acquire("live", build);
    leaseRef.current = lease;
    const publish = throttleLatest((next: LiveEval) => setValue(next), LIVE_EVAL_THROTTLE_MS);
    const unsubscribe = lease.subscribe((info) => {
      const current = fenRef.current;
      if (info.failed || !info.ready || current === null || info.fen !== current) {
        return;
      }
      const next = evalFromInfo(info, current);
      if (next) {
        publish(next);
      }
    });
    return () => {
      publish.cancel();
      unsubscribe();
      leaseRef.current = null;
      lease.release();
      setValue(null);
    };
  }, [active, build]);

  useEffect(() => {
    if (active && fen !== null) {
      leaseRef.current?.analyze(fen, LIVE_EVAL_DEPTH, 1, 1);
    }
  }, [active, build, fen]);

  return value;
}
