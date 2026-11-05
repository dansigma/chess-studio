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
import { tReview } from "@/src/chess/review-strings";
import type { Path } from "@/src/chess/tree";
import { chartEvalText, chartPlyLabel, formatChartEval, groupMoments, xAt, yAt } from "./review-chart";

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

/** SIG-1220: time spent on one move, for the Time view. */
export type ReviewChartTimeBar = {
  /** Null when the time is unknown (the bar is left out). */
  ms: number | null;
  side: "w" | "b";
  label: ReviewLabel | null;
  /** Hover text, e.g. "12. Nf3 · 1.3s". */
  text: string;
};

type Props = {
  /** SIG-1220: "time" draws time spent per move as bars (White above the axis, Black below). Default "eval". */
  mode?: "eval" | "time";
  /** One entry per reviewed move (index = move index; its ply is index + 1). */
  timeBars?: ReviewChartTimeBar[];
  timeAriaLabel?: string;
  /** White-perspective eval per ply (evalSeries output); index = ply. */
  series: number[];
  /** SIG-1225: leading plies that are opening book: shaded band, no curve, no eval. */
  bookPlies?: number;
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
  if (moment.lossCp <= 0) {
    return `${san} · ${tier}`;
  }
  const loss = formatDecimal1(locale, moment.lossCp / 100);
  return `${san} · ${tier} · -${loss}`;
}

/** One title per member, game order: a grouped marker lists every moment it stands for. */
function groupTitle(locale: SiteLocale, moveNotation: MoveNotation, members: ReviewChartMoment[]): string {
  return members.map((moment) => momentTitle(locale, moveNotation, moment)).join("\n");
}

export function ReviewEvalChart({
  mode = "eval",
  timeBars,
  timeAriaLabel,
  series,
  bookPlies = 0,
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
        height: Math.max(160, box.height),
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
  // The curve starts at the first scored position (the one after the last book move).
  const bookEnd = Math.max(0, Math.min(bookPlies, count - 1));
  const curveXs = xs.slice(bookEnd);
  const linePath = curveXs
    .map((x, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${ys[bookEnd + index].toFixed(1)}`)
    .join(" ");
  const areaPath =
    curveXs.length === 0
      ? ""
      : `${linePath} L${curveXs[curveXs.length - 1].toFixed(1)},${zeroY.toFixed(1)} L${curveXs[0].toFixed(1)},${zeroY.toFixed(1)} Z`;

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

  const groups = groupMoments(moments);
  const hoveredGroup =
    hover != null ? groups.find((group) => group.members.some((moment) => moment.moveIndex + 1 === hover)) : undefined;
  const hoveredText = hoveredGroup ? groupTitle(locale, moveNotation, hoveredGroup.members) : undefined;
  const hoverEval = hover != null && hover < count && hover >= bookEnd ? series[hover] : undefined;
  const hoverInBook = hover != null && hover < bookEnd;
  const timeMode = mode === "time" && timeBars != null;
  const hoveredTime = timeMode && hover != null && hover > 0 ? timeBars?.[hover - 1] : undefined;
  const maxTimeMs = timeMode ? Math.max(1, ...timeBars.map((bar) => bar.ms ?? 0)) : 1;
  const halfHeight = Math.max(1, height / 2 - 16);
  const slot = count > 1 ? (width - 56) / (count - 1) : 8;
  const barWidth = Math.max(1.5, Math.min(14, slot * 0.7));

  return (
    <div className="relative flex h-40 min-h-[160px] flex-col bg-studio-panel text-studio-fg">
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        {count <= 1 ? (
          <div className="absolute inset-0 grid place-items-center text-dense text-studio-faint">{emptyText}</div>
        ) : (
          <svg
            className="h-full w-full cursor-pointer"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={timeMode ? (timeAriaLabel ?? ariaLabel) : ariaLabel}
            data-chart-mode={timeMode ? "time" : "eval"}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(event) => setHover(indexFromClientX(event.clientX))}
            onClick={(event) => {
              selectPly(indexFromClientX(event.clientX));
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
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
            {timeMode ? (
              <>
                <text x={2} y={14} fontSize="9" fill="var(--studio-faint)">
                  {tReview(locale, "filter.sideWhite")}
                </text>
                <text x={2} y={height - 6} fontSize="9" fill="var(--studio-faint)">
                  {tReview(locale, "filter.sideBlack")}
                </text>
              </>
            ) : (
              <>
                <text x={2} y={zeroY - 3} fontSize="9" fill="var(--studio-faint)" data-zero-label>
                  {formatChartEval(locale, 0)}
                </text>
                {bookEnd > 0 ? (
                  <g data-book-band>
                    <rect
                      x={xs[0]}
                      y={16}
                      width={Math.max(0, xs[bookEnd] - xs[0])}
                      height={height - 32}
                      fill="var(--studio-muted)"
                      opacity="0.14"
                    />
                    <text x={xs[0] + 4} y={28} fontSize="9" fill="var(--studio-muted)">
                      {tReview(locale, "chart.book")}
                    </text>
                  </g>
                ) : null}
                <path d={areaPath} fill="var(--studio-accent)" opacity="0.22" />
                <path d={linePath} fill="none" stroke="var(--studio-accent)" strokeWidth="2" />
              </>
            )}
            {timeMode
              ? timeBars.map((bar, moveIndex) => {
                  const x = xs[moveIndex + 1];
                  if (bar.ms == null || x == null) {
                    return null;
                  }
                  const h = bar.ms <= 0 ? 0 : Math.max(1, (bar.ms / maxTimeMs) * halfHeight);
                  // Book, forced and unlabeled moves stay neutral; tiers use their badge colour.
                  const known = bar.label != null && bar.label !== "book" && bar.label !== "forced";
                  const fill = known && bar.label ? `var(${REVIEW_TIERS[bar.label].badgeVar})` : "var(--studio-muted)";
                  return (
                    <rect
                      key={moveIndex}
                      data-time-bar={bar.label ?? "none"}
                      x={x - barWidth / 2}
                      y={bar.side === "w" ? zeroY - h : zeroY}
                      width={barWidth}
                      height={h}
                      fill={fill}
                      opacity={known ? 1 : 0.55}
                    />
                  );
                })
              : null}
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
            {!timeMode && currentIndex != null && currentIndex >= bookEnd && xs[currentIndex] != null && ys[currentIndex] != null ? (
              <circle cx={xs[currentIndex]} cy={ys[currentIndex]} r="4" fill="var(--studio-fg)" />
            ) : null}
            {(timeMode ? [] : groups).map((group) => {
              const moment = group.lead;
              const ply = moment.moveIndex + 1;
              const x = xs[ply];
              const y = ys[ply];
              if (x == null || y == null) {
                return null;
              }
              const tier = REVIEW_TIERS[moment.label];
              return (
                <g key={moment.path.join(".")} data-moment-group={group.members.length}>
                  <title>{groupTitle(locale, moveNotation, group.members)}</title>
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
            {!timeMode && hover != null && hover >= bookEnd && hover !== currentIndex && xs[hover] != null && ys[hover] != null ? (
              <circle cx={xs[hover]} cy={ys[hover]} r="3.5" fill="var(--studio-accent)" />
            ) : null}
          </svg>
        )}
        {hover != null && count > 1 ? (
          <div className="pointer-events-none absolute right-2 top-2 rounded bg-studio-elevated px-2 py-1 text-caption text-studio-fg shadow">
            {timeMode ? (
              <span>{hoveredTime?.text ?? chartPlyLabel(locale, hover)}</span>
            ) : hoveredText ? (
              <span className="whitespace-pre-line">{hoveredText}</span>
            ) : (
              <>
                {chartPlyLabel(locale, hover)}{" "}
                <span className="text-studio-muted">
                  {hoverInBook ? tReview(locale, "chart.book") : hoverEval != null ? chartEvalText(locale, hoverEval) : "…"}
                </span>
              </>
            )}
          </div>
        ) : null}
        {count > 1 && hover != null ? (
          <span className="sr-only" aria-live="polite">
            {timeMode ? (hoveredTime?.text ?? chartPlyLabel(locale, hover)) : hoveredText ? hoveredText.replace(/\n/g, ", ") : chartPlyLabel(locale, hover)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
