"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_REVIEW_PRESET,
  runReview,
  type ReviewPreset,
  type ReviewProgress,
  type ReviewRow,
} from "@/src/chess/review-engine";
import { getNodeAt, type GameTree, type Path, type VariationPoint } from "@/src/chess/tree";
import { acquire } from "@/src/engine/shared-engine";
import { defaultEngineThreads, type EngineBuild } from "@/src/engine/stockfish-client";
import { createLeaseEngine } from "./lease-engine";
import { getCachedReview, reviewCacheKey, setCachedReview } from "./review-cache";

export type ReviewMoveRow = ReviewRow & {
  path: Path;
  san: string;
};

type Options = {
  tree: GameTree;
  points: VariationPoint[];
  engineBuild: EngineBuild;
  engineThreads: number;
  setupMode: boolean;
};

const IDLE_PROGRESS: ReviewProgress = { done: 0, total: 0, elapsedMs: 0 };

async function fetchBookReplies(tree: GameTree, points: VariationPoint[], isCancelled: () => boolean) {
  const replies: Array<string[] | null> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    if (isCancelled()) {
      return replies;
    }
    try {
      const response = await fetch(`/api/explorer?fen=${encodeURIComponent(points[index].fen)}&source=masters`);
      if (!response.ok) {
        replies.push(null);
        break;
      }
      const payload = (await response.json()) as { moves?: Array<{ uci?: string }> };
      const ucis = (payload.moves ?? []).flatMap((move) => (move.uci ? [move.uci] : []));
      replies.push(ucis);
      const node = getNodeAt(tree, points[index + 1].path);
      if (!node || !ucis.includes(node.uci)) {
        break;
      }
    } catch {
      replies.push(null);
      break;
    }
  }
  return replies;
}

export function useGameReview({ tree, points, engineBuild, engineThreads, setupMode }: Options) {
  const [preset, setPreset] = useState<ReviewPreset>(DEFAULT_REVIEW_PRESET);
  const [running, setRunning] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState<ReviewProgress>(IDLE_PROGRESS);

  const ucis = useMemo(
    () => points.slice(1).map((point) => getNodeAt(tree, point.path)?.uci ?? ""),
    [tree, points],
  );
  const cacheKey = useMemo(
    () => reviewCacheKey(points.map((point) => point.fen), ucis, preset, engineBuild),
    [points, ucis, preset, engineBuild],
  );

  const [core, setCore] = useState<ReviewRow[] | null>(() => getCachedReview(cacheKey));
  const [lastKey, setLastKey] = useState(cacheKey);
  if (lastKey !== cacheKey) {
    // A different line / preset / engine: drop the running review and show any cached result.
    setLastKey(cacheKey);
    setRunning(false);
    setCancelled(false);
    setFailed(false);
    setProgress(IDLE_PROGRESS);
    setCore(getCachedReview(cacheKey));
  }

  // The run reads the latest line from a ref so a tree edit that leaves the line
  // unchanged (comments, NAGs) does not restart it.
  const lineRef = useRef({ tree, points, ucis, cacheKey });
  useEffect(() => {
    lineRef.current = { tree, points, ucis, cacheKey };
  });

  useEffect(() => {
    if (!running || setupMode || lineRef.current.points.length < 2) {
      return;
    }
    const line = lineRef.current;
    const lease = acquire("review", engineBuild);
    let stopped = false;
    const isCancelled = () => stopped;
    const threads = Math.max(engineThreads, defaultEngineThreads());

    void runReview({
      fens: line.points.map((point) => point.fen),
      moves: line.ucis.map((uci) => ({ uci })),
      preset,
      engine: createLeaseEngine(lease, threads, isCancelled),
      bookReplies: () => fetchBookReplies(line.tree, line.points, isCancelled),
      isCancelled,
      onProgress: (value) => {
        if (!stopped) {
          setProgress(value);
        }
      },
    }).then((outcome) => {
      if (stopped) {
        return;
      }
      if (outcome.status === "failed") {
        setFailed(true);
        setRunning(false);
        return;
      }
      if (outcome.status !== "done") {
        return;
      }
      setCachedReview(line.cacheKey, outcome.rows);
      setCore(outcome.rows);
      setRunning(false);
    });

    return () => {
      stopped = true;
      lease.release();
    };
  }, [running, setupMode, engineBuild, engineThreads, preset, cacheKey]);

  const start = useCallback(() => {
    setCancelled(false);
    setFailed(false);
    setProgress({ done: 0, total: points.length, elapsedMs: 0 });
    setRunning(true);
  }, [points.length]);

  const cancel = useCallback(() => {
    setRunning(false);
    setCancelled(true);
  }, []);

  const rows = useMemo<ReviewMoveRow[] | null>(() => {
    if (!core) {
      return null;
    }
    return core.flatMap((row) => {
      const point = points[row.index + 1];
      const node = point ? getNodeAt(tree, point.path) : null;
      return point && node ? [{ ...row, path: point.path, san: node.san }] : [];
    });
  }, [core, points, tree]);

  return { preset, setPreset, running, cancelled, failed, progress, rows, start, cancel };
}
