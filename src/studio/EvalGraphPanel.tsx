"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/shallow";
import {
  fenKey,
  pathsEqual,
  variationPoints,
} from "@/src/chess/tree";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import {
  formatScore,
  scoreNumber,
  type EngineInfo,
} from "@/src/engine/stockfish-client";
import { acquire } from "@/src/engine/shared-engine";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore, type CachedEval } from "@/src/store/studio-store";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";

export const GRAPH_WALK_DEPTH = 12;
export const GRAPH_EVAL_THROTTLE_MS = 250;

const PAD_X_FULL = 28;
const PAD_Y_FULL = 16;
const PAWN_CAP = 5;

function clampGraphPawns(pawns: number): number {
  return Math.max(-PAWN_CAP, Math.min(PAWN_CAP, pawns));
}

function yAtPadded(pawns: number, height: number, padY: number): number {
  const inner = height - padY * 2;
  return padY + ((PAWN_CAP - clampGraphPawns(pawns)) / (PAWN_CAP * 2)) * inner;
}

// SIG-1196: one engine walk at a time. The full panel and the engine-row
// sparkline both want the line evaluated; whichever mounted first walks, and
// the other only reads `evalByFen`. When the owner unmounts, the next takes over.
const walkOwners: symbol[] = [];
const walkListeners = new Set<() => void>();

function notifyWalkOwners(): void {
  for (const listener of walkListeners) {
    listener();
  }
}

function useWalkOwnership(wants: boolean): boolean {
  const [id] = useState(() => Symbol("graph-walk"));
  useEffect(() => {
    if (!wants) {
      return;
    }
    walkOwners.push(id);
    notifyWalkOwners();
    return () => {
      const index = walkOwners.indexOf(id);
      if (index >= 0) {
        walkOwners.splice(index, 1);
      }
      notifyWalkOwners();
    };
  }, [id, wants]);
  return useSyncExternalStore(
    (listener) => {
      walkListeners.add(listener);
      return () => walkListeners.delete(listener);
    },
    () => wants && walkOwners[0] === id,
    () => false,
  );
}

/** SIG-1196: the active line's points, their cached evals and the cursor. */
function useEvalLine() {
  const board = useActiveBoard();
  const points = useMemo(
    () => variationPoints(board.tree, board.path),
    [board.tree, board.path],
  );
  const lineKey = `${board.id}:${points.map((point) => fenKey(point.fen)).join("|")}`;
  const currentIndex = points.findIndex((point) => pathsEqual(point.path, board.path));
  // SIG-856: subscribe only to this line's FENs — depth ticks of other FENs
  // keep the same entry refs, so the shallow compare skips the re-render.
  const evalByFen = useStudioStore(
    useShallow(
      (state): Record<string, CachedEval | undefined> => {
        const selected: Record<string, CachedEval | undefined> = {};
        for (const point of points) {
          const key = fenKey(point.fen);
          selected[key] = state.evalByFen[key];
        }
        return selected;
      },
    ),
  );
  return { points, lineKey, currentIndex, evalByFen };
}

type EvalLine = ReturnType<typeof useEvalLine>;

/** The engine walk that fills `evalByFen` for every point of the line. */
function useEvalWalk(line: EvalLine, wanted: boolean): void {
  // SIG-1293: no walking while the studio view is hidden. Leaving releases the
  // lease; returning restarts the walk, which skips FENs already in evalByFen.
  const inStudio = useStudioStore((state) => state.workspaceView === "studio");
  const enabled = wanted && inStudio;
  const engineDepth = useStudioStore((state) => state.settings.engineDepth);
  const engineBuild = useStudioStore((state) => state.settings.engineBuild);
  const walkDepth = Math.min(GRAPH_WALK_DEPTH, engineDepth);
  const { points, lineKey } = line;
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const lease = acquire("graph", engineBuild);
    const engine = {
      subscribe: lease.subscribe.bind(lease),
      analyze: lease.analyze.bind(lease),
      dispose: lease.release.bind(lease),
    };
    let cancelled = false;
    let unsubscribe: () => void = () => undefined;
    let settle: (() => void) | null = null;

    function record(fen: string, info: EngineInfo) {
      const best = info.lines[0];
      if (!best || info.fen !== fen) {
        return;
      }
      const side = sideFromFen(fen);
      useStudioStore.getState().putEvalCache(fen, {
        pawns: scoreNumber(best, side),
        label: formatScore(best, side),
        depth: info.depth,
      });
    }

    // SIG-856: the walk emits an `info` per tick — throttle cache writes per
    // FEN with a trailing write so the final depth is never lost.
    const lastSent = new Map<string, number>();
    const trailing = new Map<string, number>();
    const latest = new Map<string, EngineInfo>();

    function flush(fen: string): void {
      const info = latest.get(fen);
      latest.delete(fen);
      if (!info) {
        return;
      }
      lastSent.set(fen, Date.now());
      record(fen, info);
    }

    function recordThrottled(fen: string, info: EngineInfo): void {
      latest.set(fen, info);
      const elapsed = Date.now() - (lastSent.get(fen) ?? 0);
      if (elapsed >= GRAPH_EVAL_THROTTLE_MS) {
        const timer = trailing.get(fen);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          trailing.delete(fen);
        }
        flush(fen);
        return;
      }
      if (trailing.has(fen)) {
        return;
      }
      const timer = window.setTimeout(() => {
        trailing.delete(fen);
        flush(fen);
      }, GRAPH_EVAL_THROTTLE_MS - elapsed);
      trailing.set(fen, timer);
    }

    async function walk() {
      for (const point of points) {
        if (cancelled) {
          return;
        }
        const cached = useStudioStore.getState().evalByFen[fenKey(point.fen)];
        if (cached && cached.depth >= walkDepth) {
          continue;
        }
        await new Promise<void>((resolve) => {
          unsubscribe();
          const finish = () => {
            if (settle !== resolve) {
              return;
            }
            settle = null;
            window.clearTimeout(timer);
            unsubscribe();
            unsubscribe = () => undefined;
            resolve();
          };
          settle = resolve;
          const timer = window.setTimeout(finish, 12_000);
          unsubscribe = engine.subscribe((info) => {
            if (cancelled) {
              finish();
              return;
            }
            recordThrottled(point.fen, info);
            if (
              info.fen === point.fen &&
              info.lines[0] &&
              (!info.running || info.depth >= walkDepth)
            ) {
              finish();
            }
          });
          engine.analyze(point.fen, walkDepth, 1, 1);
        });
      }
    }

    void walk();
    return () => {
      cancelled = true;
      settle?.();
      unsubscribe();
      for (const timer of trailing.values()) {
        window.clearTimeout(timer);
      }
      trailing.clear();
      for (const fen of [...latest.keys()]) {
        flush(fen);
      }
      engine.dispose();
    };
  }, [enabled, engineBuild, lineKey, points, walkDepth]);
}

/**
 * SIG-1196: the chart shared by the full panel and the engine-row sparkline.
 * `compact` drops the padding and the empty-state text; click, hover and
 * keyboard behave the same in both.
 */
function EvalChart({
  line,
  compact = false,
  corner,
}: {
  line: EvalLine;
  compact?: boolean;
  /** Small label pinned to the chart's top-right corner (progress). */
  corner?: string | null;
}) {
  const locale: SiteLocale = useStudioStore((state) => state.settings.locale);
  const goPath = useStudioStore((state) => state.goPath);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const { points, currentIndex, evalByFen } = line;
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: compact ? 40 : 160 });
  const PAD_X = compact ? 4 : PAD_X_FULL;
  const PAD_Y = compact ? 4 : PAD_Y_FULL;
  const yAt = (pawns: number, height: number) => yAtPadded(pawns, height, PAD_Y);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) {
        return;
      }
      setSize({
        width: Math.max(compact ? 80 : 160, box.width),
        height: Math.max(compact ? 24 : 120, box.height),
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [compact]);

  const width = size.width;
  const height = size.height;
  const innerW = Math.max(1, width - PAD_X * 2);
  const xs = points.map((_, index) =>
    points.length === 1 ? PAD_X + innerW / 2 : PAD_X + (index / (points.length - 1)) * innerW,
  );
  const ys = points.map((point) => yAt(evalByFen[fenKey(point.fen)]?.pawns ?? 0, height));
  const zeroY = yAt(0, height);
  const linePath = xs.map((x, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${ys[index].toFixed(1)}`).join(" ");
  const areaPath =
    xs.length === 0
      ? ""
      : `${linePath} L${xs[xs.length - 1].toFixed(1)},${zeroY.toFixed(1)} L${xs[0].toFixed(1)},${zeroY.toFixed(1)} Z`;
  const hoverPoint = hover != null ? points[hover] : null;
  const hoverEval = hoverPoint ? evalByFen[fenKey(hoverPoint.fen)] : undefined;
  const focusIndex = Math.max(0, hover ?? (currentIndex >= 0 ? currentIndex : 0));
  const focusPoint = points.length > 0 ? points[Math.min(focusIndex, points.length - 1)] : null;
  const focusEval = focusPoint ? evalByFen[fenKey(focusPoint.fen)] : undefined;
  const focusText = focusPoint
    ? `${focusPoint.san ? formatSan(focusPoint.san, moveNotation) : tPanels(locale, "graph.start")} ${focusEval?.label ?? tPanels(locale, "graph.evaluating")}`
    : tPanels(locale, "graph.noMoves");

  function indexFromClientX(clientX: number): number {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || points.length === 0) {
      return 0;
    }
    const x = clientX - rect.left;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    xs.forEach((px, index) => {
      const dist = Math.abs(px - x);
      if (dist < bestDist) {
        best = index;
        bestDist = dist;
      }
    });
    return best;
  }

  return (
    <>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        {corner ? (
          <span className="pointer-events-none absolute left-2 top-1 z-[1] text-caption tabular-nums text-studio-faint">{corner}</span>
        ) : null}
        {points.length <= 1 ? (
          <div className="absolute inset-0 grid place-items-center text-dense text-studio-faint">
            {tPanels(locale, "graph.empty")}
          </div>
        ) : (
          <svg
            className="h-full w-full cursor-pointer"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="slider"
            aria-label={tPanels(locale, "graph.label")}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, points.length - 1)}
            aria-valuenow={Math.min(focusIndex, Math.max(0, points.length - 1))}
            aria-valuetext={focusText}
            tabIndex={0}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(event) => setHover(indexFromClientX(event.clientX))}
            onFocus={() => setHover((current) => current ?? (currentIndex >= 0 ? currentIndex : 0))}
            onKeyDown={(event) => {
              if (points.length === 0) {
                return;
              }
              const max = points.length - 1;
              const current = Math.max(0, Math.min(hover ?? (currentIndex >= 0 ? currentIndex : 0), max));
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                setHover(Math.min(max, current + 1));
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                setHover(Math.max(0, current - 1));
              } else if (event.key === "Home") {
                event.preventDefault();
                setHover(0);
              } else if (event.key === "End") {
                event.preventDefault();
                setHover(max);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const point = points[current];
                if (point) {
                  goPath(point.path);
                }
              }
            }}
            onClick={(event) => {
              const point = points[indexFromClientX(event.clientX)];
              if (point) {
                goPath(point.path);
              }
            }}
          >
            <line
              x1={PAD_X}
              x2={width - PAD_X}
              y1={zeroY}
              y2={zeroY}
              stroke="var(--studio-border)"
              strokeWidth="1"
            />
            <path d={areaPath} fill="var(--studio-accent)" opacity="0.22" />
            <path d={linePath} fill="none" stroke="var(--studio-accent)" strokeWidth="2" />
            {currentIndex >= 0 ? (
              <line
                x1={xs[currentIndex]}
                x2={xs[currentIndex]}
                y1={PAD_Y}
                y2={height - PAD_Y}
                stroke="var(--studio-fg)"
                strokeOpacity="0.35"
                strokeWidth="1"
              />
            ) : null}
            {currentIndex >= 0 ? (
              <circle
                cx={xs[currentIndex]}
                cy={ys[currentIndex]}
                r="4"
                fill="var(--studio-fg)"
              />
            ) : null}
            {hover != null && hover !== currentIndex ? (
              <circle cx={xs[hover]} cy={ys[hover]} r="3.5" fill="var(--studio-accent)" />
            ) : null}
          </svg>
        )}
        {hoverPoint && points.length > 1 ? (
          <div className="pointer-events-none absolute right-2 top-2 rounded bg-studio-elevated px-2 py-1 text-caption text-studio-fg shadow">
            {hoverPoint.san
              ? formatSan(hoverPoint.san, moveNotation)
              : tPanels(locale, "graph.start")}{" "}
            <span className="text-studio-muted">{hoverEval?.label ?? "…"}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function EvalGraphPanel() {
  const locale: SiteLocale = useStudioStore((state) => state.settings.locale);
  const setupMode = useStudioStore((state) => state.setupMode);
  const line = useEvalLine();
  const owner = useWalkOwnership(!setupMode);
  useEvalWalk(line, owner);
  const filled = line.points.filter((point) => line.evalByFen[fenKey(point.fen)]).length;
  // SIG-1196: the inner "Eval graph · 12/12" row repeated the tab title; the
  // progress now sits in the chart's corner.
  const corner =
    line.points.length <= 1
      ? null
      : setupMode
        ? tPanels(locale, "graph.paused")
        : filled === 0
          ? tPanels(locale, "graph.analyzing")
          : tPanels(locale, "graph.progress", { filled, total: line.points.length });
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-studio-panel text-studio-fg">
      <EvalChart line={line} corner={corner} />
    </div>
  );
}

/**
 * SIG-1196: 40px eval sparkline for the engine panel. It walks the line only
 * when `walk` is set (the engine was started) and no full graph panel is
 * already walking; otherwise it draws whatever evals are cached.
 */
export function EvalSparkline({ walk }: { walk: boolean }) {
  const setupMode = useStudioStore((state) => state.setupMode);
  const line = useEvalLine();
  const owner = useWalkOwnership(walk && !setupMode);
  useEvalWalk(line, owner);
  if (line.points.length <= 1) {
    return null;
  }
  return (
    <div className="flex h-10 shrink-0 border-b border-studio-border-subtle">
      <EvalChart line={line} compact />
    </div>
  );
}
