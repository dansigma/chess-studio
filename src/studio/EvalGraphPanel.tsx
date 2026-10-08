"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  StockfishEngine,
  type EngineInfo,
} from "@/src/engine/stockfish-client";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore, type CachedEval } from "@/src/store/studio-store";

export const GRAPH_WALK_DEPTH = 12;
export const GRAPH_EVAL_THROTTLE_MS = 250;

const PAD_X = 28;
const PAD_Y = 16;
const PAWN_CAP = 5;

function clampGraphPawns(pawns: number): number {
  return Math.max(-PAWN_CAP, Math.min(PAWN_CAP, pawns));
}

function yAt(pawns: number, height: number): number {
  const inner = height - PAD_Y * 2;
  return PAD_Y + ((PAWN_CAP - clampGraphPawns(pawns)) / (PAWN_CAP * 2)) * inner;
}

export function EvalGraphPanel() {
  const board = useActiveBoard();
  const setupMode = useStudioStore((state) => state.setupMode);
  const goPath = useStudioStore((state) => state.goPath);
  const engineDepth = useStudioStore((state) => state.settings.engineDepth);
  const engineBuild = useStudioStore((state) => state.settings.engineBuild);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 160 });

  const points = useMemo(
    () => variationPoints(board.tree, board.path),
    [board.tree, board.path],
  );
  const walkDepth = Math.min(GRAPH_WALK_DEPTH, engineDepth);
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
        width: Math.max(160, box.width),
        height: Math.max(120, box.height),
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (setupMode) {
      return;
    }
    const engine = new StockfishEngine(engineBuild);
    engine.start();
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
  }, [engineBuild, lineKey, points, setupMode, walkDepth]);

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
  const filled = points.filter((point) => evalByFen[fenKey(point.fen)]).length;
  const hoverPoint = hover != null ? points[hover] : null;
  const hoverEval = hoverPoint ? evalByFen[fenKey(hoverPoint.fen)] : undefined;
  const focusIndex = hover ?? (currentIndex >= 0 ? currentIndex : 0);
  const focusPoint = points.length > 0 ? points[Math.min(focusIndex, points.length - 1)] : null;
  const focusEval = focusPoint ? evalByFen[fenKey(focusPoint.fen)] : undefined;
  const focusText = focusPoint
    ? `${focusPoint.san ? formatSan(focusPoint.san, moveNotation) : "Start"} ${focusEval?.label ?? "evaluating"}`
    : "No moves";

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
    <div className="relative flex h-full min-h-0 flex-col bg-studio-panel text-studio-fg">
      <div className="flex items-center justify-between border-b border-studio-border-subtle px-3 py-1.5 text-caption text-studio-faint">
        <span>Eval Graph</span>
        <span>
          {setupMode
            ? "Paused in setup"
            : filled === 0
              ? "Analyzing…"
              : `${filled}/${points.length}`}
        </span>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        {points.length <= 1 ? (
          <div className="absolute inset-0 grid place-items-center text-dense text-studio-faint">
            Make a move to plot the line.
          </div>
        ) : (
          <svg
            className="h-full w-full cursor-pointer"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="slider"
            aria-label="Evaluation graph"
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
              const current = Math.min(hover ?? (currentIndex >= 0 ? currentIndex : 0), max);
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
              : "Start"}{" "}
            <span className="text-studio-muted">{hoverEval?.label ?? "…"}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
