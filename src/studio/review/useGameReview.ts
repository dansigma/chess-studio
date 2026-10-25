"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_REVIEW_PRESET,
  gradePreviewRows,
  runReview,
  type ReviewPartial,
  type ReviewPreset,
  type ReviewProgress,
  type ReviewRow,
} from "@/src/chess/review-engine";
import { getNodeAt, type GameTree, type Path, type VariationPoint } from "@/src/chess/tree";
import { acquire } from "@/src/engine/shared-engine";
import { clampThreads, type EngineBuild } from "@/src/engine/stockfish-client";
import { createE2eFakeReviewEngine, isE2eFakeReviewEnabled } from "./e2e-fake-review-engine";
import { createLeaseEngine } from "./lease-engine";
import { extractMistakeExercises } from "@/src/chess/mistake-exercises";
import type { ReviewSide } from "@/src/chess/review-report";
import {
  mergeNewExercises,
  readLocalExercises,
  type MistakeExercisesMap,
} from "@/src/lib/mistake-exercises-store";
import { useStudioStore } from "@/src/store/studio-store";
import {
  getCachedReview,
  hydrateReviewCache,
  persistentReviewKey,
  persistReview,
  reviewCacheKey,
  setCachedReview,
} from "./review-cache";
import { getReviewStore } from "./review-store";

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
  userSide: ReviewSide;
};

const IDLE_PROGRESS: ReviewProgress = { done: 0, total: 0, elapsedMs: 0 };

// SIG-1096: persist freshly extracted mistake exercises after a finished
// review. Local-read + merge, then route the write through the zustand slice
// (`setMistakeExercises`, which sets the live store and persists) so
// `state.mistakeExercises` reflects reviews completed this session; returns
// the merged map so callers can react without re-reading. Failures log with
// an `[exercises]` prefix and never break the review.
export function captureMistakes(input: {
  fens: string[];
  rows: ReviewRow[];
  userSide: ReviewSide;
}): MistakeExercisesMap | null {
  try {
    const incoming = extractMistakeExercises({
      fens: input.fens,
      rows: input.rows,
      userSide: input.userSide,
    });
    if (incoming.length === 0) {
      return null;
    }
    const merged = mergeNewExercises(readLocalExercises(), incoming);
    useStudioStore.getState().setMistakeExercises(merged);
    return merged;
  } catch (error) {
    console.warn("[exercises] capture failed", error);
    return null;
  }
}

// SIG-1036: the review uses the user's thread setting, clamped by clampThreads
// to what the machine and the page can support.
export function reviewThreads(engineThreads: number): number {
  return clampThreads(engineThreads);
}

// SIG-965: one-shot session hydration shared across hook instances. Kicked off
// lazily on first mount (client only); every lookup awaits it so a reload shows
// the persisted report instantly. Never rejects.
let hydratePromise: Promise<void> | null = null;
function ensureHydrated(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (!hydratePromise) {
    hydratePromise = hydrateReviewCache().catch(() => undefined);
  }
  return hydratePromise;
}

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

export function useGameReview({ tree, points, engineBuild, engineThreads, setupMode, userSide }: Options) {
  const [preset, setPreset] = useState<ReviewPreset>(DEFAULT_REVIEW_PRESET);
  const [running, setRunning] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState<ReviewProgress>(IDLE_PROGRESS);
  // SIG-966: scored positions from the last cancelled/failed run, memory-only
  // (never cached or persisted). Keyed by cacheKey: a line/preset/engine
  // change discards it via the key-change branch below.
  const [partial, setPartial] = useState<ReviewPartial | null>(null);
  // Payload for the next run only; consumed by the run effect so a fresh
  // start() never reuses scores.
  const resumeRef = useRef<ReviewPartial | null>(null);

  const ucis = useMemo(
    () => points.slice(1).map((point) => getNodeAt(tree, point.path)?.uci ?? ""),
    [tree, points],
  );
  const cacheKey = useMemo(
    () => reviewCacheKey(points.map((point) => point.fen), ucis, preset, engineBuild),
    [points, ucis, preset, engineBuild],
  );

  const [core, setCore] = useState<ReviewRow[] | null>(() => getCachedReview(cacheKey));
  const [freshRun, setFreshRun] = useState(false);
  const [lastKey, setLastKey] = useState(cacheKey);
  if (lastKey !== cacheKey) {
    // A different line / preset / engine: drop the running review and show any cached result.
    setLastKey(cacheKey);
    setRunning(false);
    setCancelled(false);
    setFailed(false);
    setFreshRun(false);
    setProgress(IDLE_PROGRESS);
    setCore(getCachedReview(cacheKey));
    // A line/preset/engine change discards the partial (SIG-966: edit game discards partial).
    setPartial(null);
  }

  // SIG-965: async persistent lookup per line-key. The hot layer is checked
  // synchronously above; when it misses, hydration + IndexedDB get one chance
  // to fill `core` — guarded so a late resolve never clobbers a newer key or a
  // just-finished fresh run.
  useEffect(() => {
    void ensureHydrated();
    if (getCachedReview(cacheKey)) {
      return;
    }
    let stale = false;
    void (async () => {
      try {
        await ensureHydrated();
        if (stale) {
          return;
        }
        const hot = getCachedReview(cacheKey);
        if (hot) {
          setCore((prev) => prev ?? hot);
          return;
        }
        const key = await persistentReviewKey(
          points.map((point) => point.fen),
          ucis,
          preset,
          engineBuild,
        );
        if (stale) {
          return;
        }
        const rows = await getReviewStore().loadReview(key);
        if (stale || !rows) {
          return;
        }
        setCachedReview(cacheKey, rows);
        setCore((prev) => prev ?? rows);
      } catch {
        // Silent: persistence is best-effort.
      }
    })();
    return () => {
      stale = true;
    };
  }, [cacheKey, points, ucis, preset, engineBuild]);

  // The run reads the latest line from a ref so a tree edit that leaves the line
  // unchanged (comments, NAGs) does not restart it.
  const lineRef = useRef({ tree, points, ucis, cacheKey, userSide });
  useEffect(() => {
    lineRef.current = { tree, points, ucis, cacheKey, userSide };
  });

  useEffect(() => {
    if (!running || setupMode || lineRef.current.points.length < 2) {
      return;
    }
    const line = lineRef.current;
    // SIG-970: deterministic e2e seam — no shared-engine lease, no worker.
    // Trivially satisfies the SIG-950 engine-idle rule. Fails closed: production
    // builds never set the flag, so this branch is unreachable there.
    const useFake = isE2eFakeReviewEnabled();
    const lease = useFake ? null : acquire("review", engineBuild);
    let stopped = false;
    const isCancelled = () => stopped;
    const threads = reviewThreads(engineThreads);
    // Payload for this run only: resume() stashes the partial here, start()
    // leaves it null for a fresh run.
    const resume = resumeRef.current;
    resumeRef.current = null;

    void runReview({
      fens: line.points.map((point) => point.fen),
      moves: line.ucis.map((uci) => ({ uci })),
      preset,
      engine: lease
        ? createLeaseEngine(lease, threads, isCancelled)
        : createE2eFakeReviewEngine({ delayMs: 40, isCancelled }),
      bookReplies: useFake ? async () => [] : () => fetchBookReplies(line.tree, line.points, isCancelled),
      isCancelled,
      resume: resume ?? undefined,
      onProgress: (value) => {
        if (!stopped) {
          setProgress(value);
        }
      },
    }).then((outcome) => {
      if (outcome.status === "cancelled" || outcome.status === "failed") {
        // A user cancel stops the effect (stopped=true) before the promise
        // settles, so the partial must be kept even when stopped — but only
        // when the line is still current. A key change already cleared the
        // partial; the stale promise must not restore it.
        if (line.cacheKey !== lineRef.current.cacheKey) {
          return;
        }
        // Never cache or persist partials (SIG-966: memory-only).
        setPartial(outcome.partial);
        setRunning(false);
        if (outcome.status === "failed") {
          setFailed(true);
        } else if (!stopped) {
          // Engine-observed cancel without a user cancel() call.
          setCancelled(true);
        }
        return;
      }
      if (stopped) {
        return;
      }
      if (outcome.status !== "done") {
        return;
      }
      setCachedReview(line.cacheKey, outcome.rows);
      persistReview(
        line.points.map((point) => point.fen),
        line.ucis,
        preset,
        engineBuild,
        line.cacheKey,
        outcome.rows,
      );
      setCore(outcome.rows);
      setFreshRun(true);
      // SIG-1096: fresh runs only — cached/IndexedDB restores never reach here.
      captureMistakes({
        fens: line.points.map((point) => point.fen),
        rows: outcome.rows,
        userSide: line.userSide,
      });
      // A finished run supersedes any partial it resumed from.
      setPartial(null);
      setRunning(false);
    });

    return () => {
      stopped = true;
      lease?.release();
    };
  }, [running, setupMode, engineBuild, engineThreads, preset, cacheKey]);

  const start = useCallback(() => {
    // Destructive fresh start: drop the partial (SIG-966, no confirm).
    resumeRef.current = null;
    setPartial(null);
    setCancelled(false);
    setFailed(false);
    setProgress({ done: 0, total: points.length, elapsedMs: 0 });
    setRunning(true);
  }, [points.length]);

  const cancel = useCallback(() => {
    setRunning(false);
    setCancelled(true);
  }, []);

  // Positions with a score; progress.total is the move count (points.length)
  // while partial.length is position-indexed (fens.length), so derive totals
  // defensively from the stored array.
  const scored = useMemo(() => partial?.filter((entry) => entry != null).length ?? 0, [partial]);
  const partialTotal = partial?.length ?? 0;
  // Resumable when the partial has at least one scored entry and there is no
  // finished report to show.
  const resumable = !running && scored > 0 && partialTotal > 0 && core == null;

  const resume = useCallback(() => {
    if (!partial) {
      return;
    }
    resumeRef.current = partial;
    setCancelled(false);
    setFailed(false);
    setProgress({ done: 0, total: points.length, elapsedMs: 0 });
    setRunning(true);
  }, [partial, points.length]);

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

  // Read-only preview of the scored prefix (SIG-966, req. 5 minimal): pure
  // grading, no engine calls, no book/recheck. Shown only while there is no
  // finished report.
  const previewRows = useMemo<ReviewMoveRow[] | null>(() => {
    if (core || !partial || scored === 0) {
      return null;
    }
    const fens = points.map((point) => point.fen);
    const graded = gradePreviewRows(
      fens,
      ucis.map((uci) => ({ uci })),
      partial,
    );
    if (graded.length === 0) {
      return null;
    }
    return graded.flatMap((row) => {
      const point = points[row.index + 1];
      const node = point ? getNodeAt(tree, point.path) : null;
      return point && node ? [{ ...row, path: point.path, san: node.san }] : [];
    });
  }, [core, partial, scored, points, ucis, tree]);

  const cached = rows != null && !freshRun && !running;
  return {
    preset,
    setPreset,
    running,
    cancelled,
    failed,
    progress,
    rows,
    cached,
    start,
    cancel,
    resumable,
    partialDone: scored,
    partialTotal,
    resume,
    previewRows,
  };
}
