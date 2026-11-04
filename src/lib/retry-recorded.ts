// SIG-1209: at most one Game Review retry record per exercise per calendar
// day. The map is browser-local (like the other review caches): it only
// rate-limits writes into the spaced-repetition schedule, it is not user data
// worth syncing. Only today's entries are ever kept.
import { RETRY_RECORDED_KEY, readJsonCache, writeRawCache } from "./local-cache";

/** Local calendar date as YYYY-MM-DD (never the UTC date). */
export function localDateKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function readMap(): Record<string, string> {
  const raw = readJsonCache<unknown>(RETRY_RECORDED_KEY, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      map[key] = value;
    }
  }
  return map;
}

/** True when a retry of `exerciseKey` already counted on `now`'s local day. */
export function retryRecordedToday(exerciseKey: string, now: Date = new Date()): boolean {
  return readMap()[exerciseKey] === localDateKey(now);
}

/** Marks `exerciseKey` as counted today, dropping every other day's entries. */
export function markRetryRecorded(exerciseKey: string, now: Date = new Date()): void {
  const today = localDateKey(now);
  const next: Record<string, string> = {};
  for (const [key, day] of Object.entries(readMap())) {
    if (day === today) {
      next[key] = day;
    }
  }
  next[exerciseKey] = today;
  writeRawCache(RETRY_RECORDED_KEY, JSON.stringify(next));
}
