// SIG-1232: per-day puzzle activity and a day streak derived from it.
// Pure helpers only: "today" and the time zone are always injectable so the
// local-date boundary and the streak are testable without a clock.
import type { DayActivity, PuzzleProgress } from "./types";

export const MAX_ACTIVITY_DAYS = 400;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function emptyDay(): DayActivity {
  return { solved: 0, failed: 0, ms: 0, xp: 0 };
}

// The user's LOCAL calendar date (YYYY-MM-DD) in `timeZone` (default: the
// runtime's zone). en-CA formats as YYYY-MM-DD. Never toISOString (UTC).
export function localDayKey(date: Date | number, timeZone?: string): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

// Missing/garbage input becomes {}; invalid keys and entries are dropped; only
// the newest MAX_ACTIVITY_DAYS keys survive. Idempotent.
export function normalizeDays(value: unknown): Record<string, DayActivity> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const keys = Object.keys(value as Record<string, unknown>)
    .filter((key) => DAY_KEY.test(key))
    .sort()
    .slice(-MAX_ACTIVITY_DAYS);
  const out: Record<string, DayActivity> = {};
  for (const key of keys) {
    const raw = (value as Record<string, unknown>)[key];
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const r = raw as Record<string, unknown>;
    out[key] = { solved: count(r.solved), failed: count(r.failed), ms: count(r.ms), xp: count(r.xp) };
  }
  return out;
}

// Per day, max of each field. Max (not sum) keeps the merge idempotent and
// stops two devices that synced the same day from double counting.
export function mergeDays(
  a: Record<string, DayActivity> | undefined,
  b: Record<string, DayActivity> | undefined,
): Record<string, DayActivity> {
  const left = a ?? {};
  const right = b ?? {};
  const merged: Record<string, DayActivity> = {};
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const l = left[key] ?? emptyDay();
    const r = right[key] ?? emptyDay();
    merged[key] = {
      solved: Math.max(l.solved, r.solved),
      failed: Math.max(l.failed, r.failed),
      ms: Math.max(l.ms, r.ms),
      xp: Math.max(l.xp, r.xp),
    };
  }
  return normalizeDays(merged);
}

export type ActivityInput = {
  now: number;
  success: boolean;
  ms: number | null;
  xp: number;
  timeZone?: string;
};

// Fold one attempt into today's counter (local date). Returns a new progress.
export function recordActivity(progress: PuzzleProgress, input: ActivityInput): PuzzleProgress {
  const key = localDayKey(input.now, input.timeZone);
  const day = progress.days?.[key] ?? emptyDay();
  const days = normalizeDays({
    ...progress.days,
    [key]: {
      solved: day.solved + (input.success ? 1 : 0),
      failed: day.failed + (input.success ? 0 : 1),
      ms: day.ms + count(input.ms),
      xp: day.xp + count(input.xp),
    },
  });
  return { ...progress, days };
}

export type DayStreak = {
  current: number;
  longest: number;
  // Missed days a freeze covered (one per calendar week, week starts Sunday).
  frozenDays: string[];
};

function toUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10); // pure calendar math, not a local date
}

// Calendar week id = the Sunday on or before the day.
function weekId(ms: number): string {
  return fromUtc(ms - new Date(ms).getUTCDay() * DAY_MS);
}

function isActive(day: DayActivity | undefined): boolean {
  return !!day && day.solved + day.failed > 0;
}

// Derived from the daily counters only. A day is active with >=1 attempt.
// Walking forward from the first active day: a missed day is frozen (streak
// survives, day not counted) if it is the first miss of its calendar week,
// otherwise the streak resets. Today, if not yet played, is never a miss, so
// the streak counts through yesterday until today is played.
export function dayStreak(days: Record<string, DayActivity> | undefined, today: string): DayStreak {
  const active = Object.keys(days ?? {})
    .filter((key) => DAY_KEY.test(key) && key <= today && isActive(days?.[key]))
    .sort();
  if (active.length === 0) {
    return { current: 0, longest: 0, frozenDays: [] };
  }
  const end = toUtc(today);
  const activeSet = new Set(active);
  const missesByWeek = new Map<string, number>();
  const frozenDays: string[] = [];
  let current = 0;
  let longest = 0;
  for (let t = toUtc(active[0]); t <= end; t += DAY_MS) {
    const key = fromUtc(t);
    if (activeSet.has(key)) {
      current += 1;
      longest = Math.max(longest, current);
      continue;
    }
    if (key === today) {
      continue;
    }
    const week = weekId(t);
    const misses = (missesByWeek.get(week) ?? 0) + 1;
    missesByWeek.set(week, misses);
    if (current > 0 && misses === 1) {
      frozenDays.push(key);
    } else {
      current = 0;
    }
  }
  return { current, longest, frozenDays };
}
