"use client";

// SIG-967: static review eval chart. Mirrors EvalGraphPanel geometry
// (PAD_X = 28, PAD_Y = 16, cap = 5) with small intentional duplication —
// extracting shared SVG primitives would touch the live graph's SIG-856
// throttle/shallow-subscription logic. Data is static (review rows), so no
// engine walk: series/moments/separators are computed by the panel from
// evalSeries()/filterKeyMoments()/phaseSeparators() in review-chart.ts.
import { useEffect, useRef, useState } from "react";
import { formatSan, type MoveNotation } from "@/src/chess/move-notation";
import { tierName } from "@/src/chess/review-strings";
import { REVIEW_TIERS } from "@/src/chess/review-tiers";
import type { ReviewLabel } from "@/src/chess/review";
import type { SiteLocale } from "@/src/i18n/locale";
import { formatDecimal1 } from "@/src/i18n/format";
import type { Path } from "@/src/chess/tree";
import { xAt, yAt } from "./review-chart";

export type ReviewChartMoment = {
  path: Path;
  san: string;
  side: "w" | "b";
  label: ReviewLabel;
  /** 0-based move index in the reviewed line; marker x = xs[moveIndex + 1]. */
  moveIndex: number;
  /** White-perspective eval after the move (raw pawns, clamped for display). */
  value: number;
  lossCp: number;
};

type Props = {
  /** White-perspective eval per ply (evalSeries output); index = ply. */
  series: number[];
  /** Board path per ply, parallel to series (index 0 = start position). */
  plyPaths: Path[];
  moments: ReviewChartMoment[];
  /** Ply indexes where the phase changes (phaseSeparators output). */
  separators: number[];
  /** Ply index of the board, or null when the board is off the reviewed line. */
  currentIndex: number | null;
  moveNotation: MoveNotation;
  locale: SiteLocale;
  ariaLabel: string;
  emptyText: string;
  onSelect: (path: Path) => void;
};

function momentTitle(
  locale: SiteLocale,
  moveNotation: MoveNotation,
  moment: ReviewChartMoment,
): string {
  const san = formatSan(moment.san, moveNotation, moment.side);
  const tier = tierName(locale, moment.label);
  const loss = formatDecimal1(locale, moment.lossCp / 100);
  return `${san} · ${tier} · -${loss}`;
}

export function ReviewEvalChart({
  series,
  plyPaths,
  moments,
  separators,
  currentIndex,
  moveNotation,
  locale,
  ariaLabel,
  emptyText,
  onSelect,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 160 });
  const [hover, setHover] = useState<number | null>(null);

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

  const width = size.width;
  const height = size.height;
  const count = series.length;
  const xs = series.map((_, index) => xAt(index, count, width));
  const ys = series.map((value) => yAt(value, height));
  const zeroY = yAt(0, height);
  const linePath = xs.map((x, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${ys[index].toFixed(1)}`).join(" ");
  const areaPath =
    xs.length === 0
      ? ""
      : `${linePath} L${xs[xs.length - 1].toFixed(1)},${zeroY.toFixed(1)} L${xs[0].toFixed(1)},${zeroY.toFixed(1)} Z`;

  function indexFromClientX(clientX: number): number {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || count === 0) {
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

  function selectPly(ply: number): void {
    const path = plyPaths[ply];
    if (path) {
      onSelect(path);
    }
  }

  const hoveredMoment =
    hover != null ? moments.find((moment) => moment.moveIndex + 1 === hover) : undefined;
  const hoverEval = hover != null && hover < count ? series[hover] : undefined;

  return (
    <div className="relative flex h-40 min-h-0 flex-col bg-studio-panel text-studio-fg">
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        {count <= 1 ? (
          <div className="absolute inset-0 grid place-items-center text-dense text-studio-faint">{emptyText}</div>
        ) : (
          <svg
            className="h-full w-full cursor-pointer"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel}
            tabIndex={0}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(event) => setHover(indexFromClientX(event.clientX))}
            onFocus={() => setHover((current) => current ?? currentIndex ?? 0)}
            onKeyDown={(event) => {
              if (count === 0) {
                return;
              }
              const max = count - 1;
              const current = Math.max(0, Math.min(hover ?? currentIndex ?? 0, max));
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                setHover(Math.min(max, current + 1));
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                setHover(Math.max(0, current - 1));
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectPly(current);
              }
            }}
            onClick={(event) => {
              selectPly(indexFromClientX(event.clientX));
            }}
            onPointerDown={(event) => {
              (event.target as Element).setPointerCapture?.(event.pointerId);
              selectPly(indexFromClientX(event.clientX));
            }}
            onPointerMove={(event) => {
              if (event.buttons > 0) {
                selectPly(indexFromClientX(event.clientX));
              }
            }}
          >
            <line
              x1={28}
              x2={width - 28}
              y1={zeroY}
              y2={zeroY}
              stroke="var(--studio-border)"
              strokeWidth="1"
            />
            <path d={areaPath} fill="var(--studio-accent)" opacity="0.22" />
            <path d={linePath} fill="none" stroke="var(--studio-accent)" strokeWidth="2" />
            {separators.map((ply) =>
              xs[ply] == null ? null : (
                <line
                  key={ply}
                  x1={xs[ply]}
                  x2={xs[ply]}
                  y1={16}
                  y2={height - 16}
                  stroke="var(--studio-border)"
                  strokeWidth="1"
                />
              ),
            )}
            {currentIndex != null && xs[currentIndex] != null ? (
              <line
                x1={xs[currentIndex]}
                x2={xs[currentIndex]}
                y1={16}
                y2={height - 16}
                stroke="var(--studio-fg)"
                strokeOpacity="0.35"
                strokeWidth="1"
              />
            ) : null}
            {currentIndex != null && xs[currentIndex] != null && ys[currentIndex] != null ? (
              <circle cx={xs[currentIndex]} cy={ys[currentIndex]} r="4" fill="var(--studio-fg)" />
            ) : null}
            {moments.map((moment) => {
              const ply = moment.moveIndex + 1;
              const x = xs[ply];
              const y = ys[ply];
              if (x == null || y == null) {
                return null;
              }
              const tier = REVIEW_TIERS[moment.label];
              return (
                <g key={moment.path.join(".")}>
                  <title>{momentTitle(locale, moveNotation, moment)}</title>
                  <text
                    x={x}
                    y={y - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    className={tier.className}
                    fill="currentColor"
                  >
                    {tier.mark}
                  </text>
                  <circle cx={x} cy={y} r="2.5" fill="currentColor" className={tier.className} />
                </g>
              );
            })}
            {hover != null && hover !== currentIndex && xs[hover] != null && ys[hover] != null ? (
              <circle cx={xs[hover]} cy={ys[hover]} r="3.5" fill="var(--studio-accent)" />
            ) : null}
          </svg>
        )}
        {hover != null && count > 1 ? (
          <div className="pointer-events-none absolute right-2 top-2 rounded bg-studio-elevated px-2 py-1 text-caption text-studio-fg shadow">
            {hoveredMoment ? (
              momentTitle(locale, moveNotation, hoveredMoment)
            ) : (
              <>
                {hover === 0 ? "Start" : `Ply ${hover}`}{" "}
                <span className="text-studio-muted">
                  {hoverEval != null ? formatDecimal1(locale, hoverEval) : "…"}
                </span>
              </>
            )}
          </div>
        ) : null}
        {count > 1 && hover != null ? (
          <span className="sr-only" aria-live="polite">
            {hoveredMoment ? momentTitle(locale, moveNotation, hoveredMoment) : `Ply ${hover}`}
          </span>
        ) : null}
      </div>
    </div>
  );
}
