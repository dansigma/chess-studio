// SIG-1233: pure model for the "Monthly progress" heatmap. No React, no clock:
// "today" is always passed in (callers use localDayKey(Date.now())).
import { dayStreak, type DayStreak } from "./activity";
import type { DayActivity } from "./types";

// Lower bound (puzzles per day) of buckets 1..4. Bucket 0 is "no puzzles".
// One place to tune: 1-4, 5-9, 10-19, 20+.
export const HEAT_BUCKET_MIN = [1, 5, 10, 20] as const;
export const HEAT_LEVELS = HEAT_BUCKET_MIN.length + 1;
// Default (unmeasured) week count, and the most weeks ever drawn. Activity is
// kept for 400 days, so 52 weeks (364 days) is always backed by stored data.
export const HEATMAP_WEEKS = 18;
export const HEATMAP_MAX_WEEKS = 52;
// SIG-1246: on narrow screens fewer weeks are drawn so the whole grid fits
// without scrolling and squares keep their full size (never shrunk).
export const HEATMAP_MIN_WEEKS = 12;
// A month label ("Nov", "set.") is allowed this many columns before the next
// label or the right edge; a label that needs more room is hidden, not clipped.
export const MONTH_LABEL_COLUMNS = 3;

/** Weeks that fit `width` px of grid at `step` px per column, clamped to 12-52. width <= 0 = unmeasured. */
export function heatmapWeeksForWidth(width: number, step: number): number {
  if (!(width > 0) || !(step > 0)) {
    return HEATMAP_WEEKS;
  }
  const fit = Math.floor(width / step);
  return Math.max(HEATMAP_MIN_WEEKS, Math.min(HEATMAP_MAX_WEEKS, fit));
}

export type HeatBucket = 0 | 1 | 2 | 3 | 4;

export function heatBucket(puzzles: number): HeatBucket {
  let bucket = 0;
  for (let i = 0; i < HEAT_BUCKET_MIN.length; i += 1) {
    if (puzzles >= HEAT_BUCKET_MIN[i]) {
      bucket = i + 1;
    }
  }
  return bucket as HeatBucket;
}

const DAY_MS = 86_400_000;

function toUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export type HeatCell = {
  key: string;
  solved: number;
  failed: number;
  ms: number;
  bucket: HeatBucket;
  frozen: boolean;
  today: boolean;
};

export type HeatMonthLabel = { column: number; month: number }; // month 0-11

/** Drops month labels that would overlap the next one or run past the last column. */
export function visibleMonthLabels(
  months: HeatMonthLabel[],
  weeks: number,
  span: number = MONTH_LABEL_COLUMNS,
): HeatMonthLabel[] {
  return months.filter((m, i) => {
    const nextColumn = i + 1 < months.length ? months[i + 1].column : Infinity;
    return m.column + span <= weeks && nextColumn - m.column >= span;
  });
}

export type Heatmap = {
  // weeks[col][row]; row 0 = Sunday. null = a day after today (not drawn).
  weeks: (HeatCell | null)[][];
  months: HeatMonthLabel[];
  streak: DayStreak;
  rangeSolved: number;
  rangeFailed: number;
  rangeMinutes: number;
  rangeActiveDays: number;
  weekActiveDays: number; // active days in the current week so far (0-7)
  hasActivity: boolean;
};

export function buildHeatmap(
  days: Record<string, DayActivity> | undefined,
  today: string,
  weeks: number = HEATMAP_WEEKS,
): Heatmap {
  const data = days ?? {};
  const streak = dayStreak(data, today);
  const frozen = new Set(streak.frozenDays);
  const todayMs = toUtc(today);
  const thisSunday = todayMs - new Date(todayMs).getUTCDay() * DAY_MS;
  const firstSunday = thisSunday - (weeks - 1) * 7 * DAY_MS;

  const grid: (HeatCell | null)[][] = [];
  const months: HeatMonthLabel[] = [];
  let solved = 0;
  let failed = 0;
  let ms = 0;
  let active = 0;
  let weekActive = 0;
  let lastMonth = -1;
  for (let col = 0; col < weeks; col += 1) {
    const column: (HeatCell | null)[] = [];
    const sunday = firstSunday + col * 7 * DAY_MS;
    const month = new Date(sunday).getUTCMonth();
    if (month !== lastMonth) {
      months.push({ column: col, month });
      lastMonth = month;
    }
    for (let row = 0; row < 7; row += 1) {
      const t = sunday + row * DAY_MS;
      const key = fromUtc(t);
      if (key > today) {
        column.push(null);
        continue;
      }
      const d = data[key];
      const s = d?.solved ?? 0;
      const f = d?.failed ?? 0;
      const dayMs = d?.ms ?? 0;
      solved += s;
      failed += f;
      ms += dayMs;
      if (s + f > 0) {
        active += 1;
        if (t >= thisSunday) {
          weekActive += 1;
        }
      }
      column.push({
        key,
        solved: s,
        failed: f,
        ms: dayMs,
        bucket: heatBucket(s + f),
        frozen: frozen.has(key),
        today: key === today,
      });
    }
    grid.push(column);
  }
  return {
    weeks: grid,
    months,
    streak,
    rangeSolved: solved,
    rangeFailed: failed,
    rangeMinutes: Math.round(ms / 60_000),
    rangeActiveDays: active,
    weekActiveDays: weekActive,
    hasActivity: active > 0,
  };
}
