// SIG-1306: accuracy-trend chart for My Stats → Overview. Pixel-sized SVG
// (width measured with a ResizeObserver, so text is never stretched); axis
// labels, mean label and tooltip are HTML. Each reviewed game is a focusable
// dot (roving tabindex: one tab stop, arrows move between dots), the
// moving-average line is drawn on top, and a dashed line marks the mean.
"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { formatDecimal1 } from "@/src/i18n/format";
import { tMyGames } from "@/src/i18n/my-games-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { accuracySeries } from "@/src/lib/my-games/stats";
import type { PlayerGame } from "@/src/lib/player-types";

const HEIGHT = 150;
const PAD = { top: 10, right: 10, bottom: 8, left: 30 };
const FALLBACK_WIDTH = 320;
const GRID = [90, 70, 50] as const;
const TAG = { en: "en-US", "pt-br": "pt-BR" } as const;

function formatDate(locale: SiteLocale, ms: number | null): string {
  // Undated games sort as 0; never render that as "1 Jan 1970".
  if (ms == null || ms <= 0) {
    return "—";
  }
  return new Intl.DateTimeFormat(TAG[locale], { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));
}

export function MyStatsTrend({
  games,
  locale,
  onOpenGame,
}: {
  games: PlayerGame[];
  locale: SiteLocale;
  onOpenGame: (game: PlayerGame) => void;
}) {
  const { points, mean } = useMemo(() => accuracySeries(games), [games]);
  const hasPoints = points.length > 0;
  const wrapRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [rovingIndex, setRovingIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) {
        setWidth(next);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasPoints]);

  if (points.length === 0 || mean == null) {
    return null;
  }

  const count = points.length;
  const active = Math.min(rovingIndex ?? count - 1, count - 1);
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const xAt = (i: number) => PAD.left + (count === 1 ? plotW / 2 : (i / (count - 1)) * plotW);
  const yAt = (v: number) => PAD.top + ((100 - Math.max(0, Math.min(100, v))) / 100) * plotH;
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(p.movingAvg).toFixed(1)}`)
    .join(" ");
  const latest = points[count - 1]!;
  const aria = tMyGames(locale, "myGames.trendAria", {
    count: String(count),
    mean: formatDecimal1(locale, mean),
    latest: formatDecimal1(locale, latest.accuracy),
  });

  const dateIdx = count === 1 ? [0] : count === 2 ? [0, 1] : [0, Math.floor((count - 1) / 2), count - 1];
  const tipIndex = hover ?? focused;
  const tip = tipIndex != null ? points[tipIndex] : undefined;

  function moveTo(next: number) {
    const clamped = Math.max(0, Math.min(count - 1, next));
    setRovingIndex(clamped);
    dotRefs.current[clamped]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const map: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: count - 1,
    };
    const next = map[event.key];
    if (next !== undefined) {
      event.preventDefault();
      moveTo(next);
    }
  }

  function tooltip(index: number) {
    const p = points[index]!;
    const g = p.game;
    const opponent = g.color === "white" ? g.blackName : g.whiteName;
    const rating = g.color === "white" ? g.blackRating : g.whiteRating;
    const result =
      g.playerResult === "win" ? "myGames.trendWin" : g.playerResult === "loss" ? "myGames.trendLoss" : g.playerResult === "draw" ? "myGames.trendDraw" : null;
    const meta = [result ? tMyGames(locale, result) : null, g.playedAt != null ? formatDate(locale, g.playedAt) : null, g.timeClass ?? null]
      .filter(Boolean)
      .join(" · ");
    const half = 80;
    const left = Math.max(half, Math.min(width - half, xAt(index)));
    // Keep the tooltip off the hovered dot: below it for high values, at the
    // top otherwise.
    const top = yAt(p.accuracy) < HEIGHT / 2 ? HEIGHT - 56 : 0;
    return (
      <div
        role="tooltip"
        data-testid="trend-tooltip"
        className="pointer-events-none absolute z-10 w-40 -translate-x-1/2 rounded border border-studio-border-strong bg-studio-elevated px-2 py-1 text-caption text-studio-fg shadow-lg"
        style={{ left, top }}
      >
        <div className="truncate font-semibold">
          {tMyGames(locale, "myGames.trendVs", { name: rating != null ? `${opponent} (${rating})` : opponent })}
        </div>
        <div className="text-studio-muted">{meta}</div>
        <div>{tMyGames(locale, "myGames.trendAccuracy", { value: formatDecimal1(locale, p.accuracy) })}</div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label={aria}
      data-testid="mystats-trend"
      className="relative w-full select-none text-caption text-studio-muted"
      style={{ height: HEIGHT + 18 }}
      onKeyDown={onKeyDown}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={width} height={HEIGHT} className="absolute left-0 top-0" aria-hidden="true">
        {GRID.map((v) => (
          <line key={v} x1={PAD.left} x2={width - PAD.right} y1={yAt(v)} y2={yAt(v)} stroke="var(--studio-border)" strokeWidth="1" />
        ))}
        <line
          data-testid="trend-mean-line"
          x1={PAD.left}
          x2={width - PAD.right}
          y1={yAt(mean)}
          y2={yAt(mean)}
          stroke="var(--studio-muted)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
        <path d={line} fill="none" stroke="var(--studio-accent)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {GRID.map((v) => (
        <span key={v} className="absolute w-6 -translate-y-1/2 text-right text-studio-faint" style={{ left: 0, top: yAt(v) }}>
          {v}
        </span>
      ))}
      <span
        data-testid="trend-mean-label"
        className="absolute -translate-y-full whitespace-nowrap rounded bg-studio-panel px-1 text-studio-fg-secondary"
        style={{ right: PAD.right, top: yAt(mean) }}
      >
        {tMyGames(locale, "myGames.trendMean", { value: formatDecimal1(locale, mean) })}
      </span>
      {points.map((p, i) => (
        <button
          key={p.game.id}
          type="button"
          ref={(el) => {
            dotRefs.current[i] = el;
          }}
          data-testid="trend-dot"
          tabIndex={i === active ? 0 : -1}
          aria-label={`${formatDate(locale, p.game.playedAt)} — ${formatDecimal1(locale, p.accuracy)}`}
          className="absolute flex h-3 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-studio-accent"
          style={{ left: xAt(i), top: yAt(p.accuracy) }}
          onMouseEnter={() => setHover(i)}
          onFocus={() => {
            setFocused(i);
            setRovingIndex(i);
          }}
          onBlur={() => setFocused((cur) => (cur === i ? null : cur))}
          onClick={() => onOpenGame(p.game)}
        >
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "var(--studio-accent-text)", opacity: tipIndex === i ? 1 : 0.5 }}
          />
        </button>
      ))}
      {dateIdx.map((i, k) => (
        <span
          key={i}
          className="absolute whitespace-nowrap"
          style={{
            top: HEIGHT,
            left: xAt(i),
            transform: k === 0 && dateIdx.length > 1 ? "none" : k === dateIdx.length - 1 && dateIdx.length > 1 ? "translateX(-100%)" : "translateX(-50%)",
          }}
        >
          {formatDate(locale, points[i]!.game.playedAt)}
        </span>
      ))}
      {tip ? tooltip(tipIndex!) : null}
    </div>
  );
}
