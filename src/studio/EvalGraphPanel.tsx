"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useStudioStore } from "@/src/store/studio-store";

export const GRAPH_WALK_DEPTH = 12;

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
  const evalByFen = useStudioStore((state) => state.evalByFen);
  const goPath = useStudioStore((state) => state.goPath);
  const engineDepth = useStudioStore((state) => state.settings.engineDepth);
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
    const engine = new StockfishEngine();
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
            record(point.fen, info);
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
      engine.dispose();
    };
  }, [lineKey, points, setupMode, walkDepth]);

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
      <div className="flex items-center justify-between border-b border-studio-border-subtle px-3 py-1.5 text-[11px] text-studio-faint">
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
          <div className="absolute inset-0 grid place-items-center text-[12px] text-studio-faint">
            Make a move to plot the line.
          </div>
        ) : (
          <svg
            className="h-full w-full cursor-pointer"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Evaluation graph"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(event) => setHover(indexFromClientX(event.clientX))}
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
          <div className="pointer-events-none absolute right-2 top-2 rounded bg-studio-elevated px-2 py-1 text-[11px] text-studio-fg shadow">
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
