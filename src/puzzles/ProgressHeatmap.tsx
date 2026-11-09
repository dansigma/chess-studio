"use client";

// SIG-1233: "Monthly progress" card: day streak + one square per day.
// Plain CSS (no chart library). Colors are studio tokens only; intensity is
// the success token at stepped opacity, and every square also carries its
// numbers in an aria-label / title / detail line, so color is never the only
// signal.
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Flame } from "lucide-react";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
import { Button } from "@/src/studio/ui/Button";
import { Panel } from "@/src/studio/ui/Panel";
import {
  buildHeatmap,
  HEATMAP_WEEKS,
  heatmapWeeksForWidth,
  visibleMonthLabels,
  type HeatBucket,
  type HeatCell,
} from "./heatmap";
import type { DayActivity } from "./types";

const TAG: Record<SiteLocale, string> = { en: "en-US", "pt-br": "pt-BR" };
const CELL = 12; // px
const GAP = 3; // px
const STEP = CELL + GAP;

const BUCKET_CLASS: Record<HeatBucket, string> = {
  0: "bg-studio-track",
  1: "bg-studio-success/25",
  2: "bg-studio-success/50",
  3: "bg-studio-success/75",
  4: "bg-studio-success",
};

function dayLabel(locale: SiteLocale, cell: HeatCell): string {
  const [y, m, d] = cell.key.split("-").map(Number);
  const date = new Intl.DateTimeFormat(TAG[locale], { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
  const total = cell.solved + cell.failed;
  let text =
    total === 0
      ? tPuzzle(locale, "puzzle.heatmap.day.none", { date })
      : tPuzzle(locale, total === 1 ? "puzzle.heatmap.day.one" : "puzzle.heatmap.day.other", {
          date,
          count: formatInteger(locale, total),
          solved: formatInteger(locale, cell.solved),
          failed: formatInteger(locale, cell.failed),
          minutes: formatInteger(locale, Math.round(cell.ms / 60_000)),
        });
  if (cell.frozen) {
    text += `. ${tPuzzle(locale, "puzzle.heatmap.day.frozen")}`;
  }
  return text;
}

function FrozenMark() {
  // Small ring, distinct from the filled intensity squares.
  return <span aria-hidden className="size-1.5 rounded-full border border-studio-fg-secondary" />;
}

export function ProgressHeatmap({
  days,
  today,
  locale,
  onStart,
}: {
  days: Record<string, DayActivity> | undefined;
  today: string;
  locale: SiteLocale;
  onStart: () => void;
}) {
  // SIG-1246: the week count follows the width of the scrolling grid area.
  const [weekCount, setWeekCount] = useState(HEATMAP_WEEKS);
  const map = useMemo(() => buildHeatmap(days, today, weekCount), [days, today, weekCount]);
  const scroller = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const [active, setActive] = useState<string>(today);
  const [detail, setDetail] = useState<HeatCell | null>(null);

  // Fit the number of weeks to the available width, and keep the most recent
  // week in view. Runs after layout (and on every resize) so scrollWidth is
  // the real, post-layout value; the old useEffect on mount ran too early.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) {
      return;
    }
    const sync = () => {
      const next = heatmapWeeksForWidth(el.clientWidth, STEP);
      setWeekCount((prev) => (prev === next ? prev : next));
      el.scrollLeft = el.scrollWidth;
    };
    sync();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [map.hasActivity, weekCount]);

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(TAG[locale], { month: "short", timeZone: "UTC" }), [locale]);
  const weekdayFmt = useMemo(() => new Intl.DateTimeFormat(TAG[locale], { weekday: "short", timeZone: "UTC" }), [locale]);

  const streak = map.streak;
  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="sr-only">{tPuzzle(locale, "puzzle.heatmap.title")}</h2>
        <Flame className="size-4 text-studio-warning-fg" aria-hidden />
        <span className="text-body font-semibold text-studio-fg">
          {streak.current > 0
            ? tPuzzle(locale, streak.current === 1 ? "puzzle.heatmap.streak.one" : "puzzle.heatmap.streak.other", {
                count: formatInteger(locale, streak.current),
              })
            : tPuzzle(locale, "puzzle.heatmap.streak.none")}
        </span>
      </div>
      <span className="text-dense text-studio-muted">
        {tPuzzle(locale, streak.longest === 1 ? "puzzle.heatmap.longest.one" : "puzzle.heatmap.longest.other", {
          count: formatInteger(locale, streak.longest),
        })}
      </span>
    </div>
  );

  if (!map.hasActivity) {
    return (
      <Panel
        as="section"
        aria-label={tPuzzle(locale, "puzzle.heatmap.title")}
        className="p-4"
        data-testid="progress-heatmap"
      >
        <h2 className="text-body font-semibold text-studio-fg">{tPuzzle(locale, "puzzle.heatmap.title")}</h2>
        <div className="mt-3 flex flex-col items-start gap-1">
          <p className="flex items-center gap-2 text-body font-semibold text-studio-fg">
            <Flame className="size-4 text-studio-warning-fg" aria-hidden />
            {tPuzzle(locale, "puzzle.heatmap.emptyTitle")}
          </p>
          <p className="max-w-xl text-body text-studio-muted">{tPuzzle(locale, "puzzle.heatmap.emptyBody")}</p>
          <Button className="mt-3" variant="primary" onClick={onStart}>
            {tPuzzle(locale, "puzzle.heatmap.emptyAction")}
          </Button>
        </div>
      </Panel>
    );
  }

  const order = map.weeks.flat().filter((c): c is HeatCell => c !== null);
  const focusKey = order.some((c) => c.key === active) ? active : today;

  const move = (col: number, row: number, event: KeyboardEvent) => {
    let nextCol = col;
    let nextRow = row;
    switch (event.key) {
      case "ArrowLeft":
        nextCol -= 1;
        break;
      case "ArrowRight":
        nextCol += 1;
        break;
      case "ArrowUp":
        nextRow -= 1;
        break;
      case "ArrowDown":
        nextRow += 1;
        break;
      case "Home":
        nextCol = 0;
        break;
      case "End":
        nextCol = map.weeks.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = map.weeks[nextCol]?.[nextRow];
    if (target) {
      setActive(target.key);
      setDetail(target);
      cellRefs.current.get(target.key)?.focus();
    }
  };

  const shown = detail ?? order[order.length - 1];

  return (
    <Panel
      as="section"
      aria-label={tPuzzle(locale, "puzzle.heatmap.title")}
      className="p-4"
      data-testid="progress-heatmap"
    >
      {heading}

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <HeatStat label={tPuzzle(locale, "puzzle.heatmap.stat.solved")} value={formatInteger(locale, map.rangeSolved)} />
        <HeatStat label={tPuzzle(locale, "puzzle.heatmap.stat.minutes")} value={formatInteger(locale, map.rangeMinutes)} />
        <HeatStat
          label={tPuzzle(locale, "puzzle.heatmap.stat.week")}
          value={`${formatInteger(locale, map.weekActiveDays)}/7`}
        />
      </dl>

      <div className="mt-3 flex gap-2">
          <div
            aria-hidden
            data-testid="heatmap-weekdays"
            className="flex shrink-0 flex-col whitespace-nowrap text-caption text-studio-faint"
            style={{ paddingTop: STEP, gap: GAP }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((row) => (
              <span key={row} className="flex items-center" style={{ height: CELL }}>
                {row % 2 === 1 ? weekdayFmt.format(new Date(Date.UTC(2023, 0, 1 + row))) : ""}
              </span>
            ))}
          </div>
          <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto pb-2" data-testid="heatmap-scroller">
          <div className="w-max">
            <div aria-hidden className="relative whitespace-nowrap text-caption text-studio-faint" style={{ height: STEP, width: map.weeks.length * STEP }}>
              {visibleMonthLabels(map.months, map.weeks.length).map((m) => (
                <span key={`${m.column}-${m.month}`} className="absolute top-0" style={{ left: m.column * STEP }}>
                  {monthFmt.format(new Date(Date.UTC(2023, m.month, 1)))}
                </span>
              ))}
            </div>
            <div
              role="grid"
              aria-label={tPuzzle(locale, "puzzle.heatmap.grid", { weeks: map.weeks.length })}
              className="flex flex-col"
              style={{ gap: GAP }}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                <div key={row} role="row" className="flex" style={{ gap: GAP }}>
                  {map.weeks.map((week, col) => {
                    const cell = week[row];
                    if (!cell) {
                      return <div key={col} role="gridcell" aria-hidden style={{ width: CELL, height: CELL }} />;
                    }
                    const label = dayLabel(locale, cell);
                    return (
                      <div
                        key={cell.key}
                        ref={(el) => {
                          if (el) {
                            cellRefs.current.set(cell.key, el);
                          } else {
                            cellRefs.current.delete(cell.key);
                          }
                        }}
                        role="gridcell"
                        tabIndex={cell.key === focusKey ? 0 : -1}
                        aria-label={label}
                        title={label}
                        data-bucket={cell.bucket}
                        data-frozen={cell.frozen ? "true" : undefined}
                        onFocus={() => {
                          setActive(cell.key);
                          setDetail(cell);
                        }}
                        onMouseEnter={() => setDetail(cell)}
                        onMouseLeave={() => setDetail(null)}
                        onKeyDown={(event) => move(col, row, event)}
                        className={`flex items-center justify-center rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-studio-accent ${BUCKET_CLASS[cell.bucket]} ${cell.today ? "ring-1 ring-studio-border-strong" : ""}`}
                        style={{ width: CELL, height: CELL }}
                      >
                        {cell.frozen ? <FrozenMark /> : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-1 min-h-5 text-caption text-studio-muted" data-testid="heatmap-detail">
        {shown ? dayLabel(locale, shown) : null}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-caption text-studio-muted">
        <span>
          {tPuzzle(locale, "puzzle.heatmap.footer", {
            weeks: map.weeks.length,
            solved: formatInteger(locale, map.rangeSolved),
            failed: formatInteger(locale, map.rangeFailed),
            days: formatInteger(locale, map.rangeActiveDays),
          })}
        </span>
        <span aria-hidden className="flex items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1">
            <span className="flex size-3 items-center justify-center rounded-[3px] bg-studio-track">
              <FrozenMark />
            </span>
            {tPuzzle(locale, "puzzle.heatmap.legend.frozen")}
          </span>
          <span>{tPuzzle(locale, "puzzle.heatmap.legend.less")}</span>
          {([0, 1, 2, 3, 4] as const).map((bucket) => (
            <span key={bucket} className={`size-3 rounded-[3px] ${BUCKET_CLASS[bucket]}`} />
          ))}
          <span>{tPuzzle(locale, "puzzle.heatmap.legend.more")}</span>
        </span>
      </div>
      <p className="mt-2 text-caption text-studio-faint">{tPuzzle(locale, "puzzle.heatmap.freezeNote")}</p>
    </Panel>
  );
}

function HeatStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-studio-bg px-3 py-1.5">
      <dt className="text-caption uppercase tracking-wide text-studio-muted">{label}</dt>
      <dd className="mt-0.5 text-title font-semibold tabular-nums text-studio-fg">{value}</dd>
    </div>
  );
}
