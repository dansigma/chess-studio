// SIG-1096: per-user mistake exercises with spaced-repetition state.
// One row per user (`mistake_exercises`), browser-local copy for guests.
// Modeled on `src/lib/repertoire-progress.ts`: same module-level account id,
// owner marker, local-first hydrate/save, silent remote failure. Guests keep
// browser-only exercises; nothing is ever merged into an account.
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import type { MistakeExercise } from "../chess/mistake-exercises";
import { isDue, scheduleReview, type SpacedRepetitionItem } from "../chess/repertoire";
import {
  MISTAKE_EXERCISES_KEY,
  MISTAKE_EXERCISES_OWNER_KEY,
  readJsonCache,
  readRawCache,
  removeRawCache,
  writeRawCache,
} from "./local-cache";

export type StoredExercise = {
  exercise: MistakeExercise;
  srs: SpacedRepetitionItem | null;
};

export type MistakeExercisesMap = Record<string, StoredExercise>;

export const MAX_MISTAKE_EXERCISES = 300;

// Interval at or above which a solved exercise counts as "mastered" and is
// evicted first when the map exceeds the cap.
export const MASTERED_INTERVAL_DAYS = 21;

let exercisesAccountUserId: string | null = null;
let exercisesOnAccount = false;

export function mistakeExercisesSource(): "account" | "browser" {
  return exercisesOnAccount ? "account" : "browser";
}

function readExercisesOwner(): string | null {
  const owner = readRawCache(MISTAKE_EXERCISES_OWNER_KEY);
  return owner === null || owner === "" ? null : owner;
}

export function writeMistakeExercisesOwner(userId: string | null): void {
  if (!userId) {
    if (readRawCache(MISTAKE_EXERCISES_OWNER_KEY) !== null) {
      removeRawCache(MISTAKE_EXERCISES_OWNER_KEY);
    }
    return;
  }
  writeRawCache(MISTAKE_EXERCISES_OWNER_KEY, userId);
}

export function isMistakeExercisesOwnedBy(userId: string | null): boolean {
  const owner = readExercisesOwner();
  if (owner === null) {
    return true;
  }
  return owner === userId;
}

function normalizeSrs(raw: unknown): SpacedRepetitionItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const lastReviewedAt =
    typeof item.lastReviewedAt === "string" ? item.lastReviewedAt : new Date().toISOString();
  const intervalDays =
    typeof item.intervalDays === "number" && Number.isFinite(item.intervalDays)
      ? Math.max(1, item.intervalDays)
      : 1;
  const easeFactor =
    typeof item.easeFactor === "number" && Number.isFinite(item.easeFactor)
      ? Math.max(1.3, item.easeFactor)
      : 2.5;
  const dueDate = typeof item.dueDate === "string" ? item.dueDate : new Date().toISOString();
  const mistakeCount =
    typeof item.mistakeCount === "number" && Number.isFinite(item.mistakeCount)
      ? Math.max(0, item.mistakeCount)
      : 0;
  return { lastReviewedAt, intervalDays, easeFactor, dueDate, mistakeCount };
}

function normalizeExercise(raw: unknown): MistakeExercise | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const item = raw as Record<string, unknown>;
  if (typeof item.key !== "string" || item.key === "" || typeof item.fen !== "string") {
    return null;
  }
  return raw as MistakeExercise;
}

export function normalizeExercises(raw: unknown): MistakeExercisesMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const result: MistakeExercisesMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const entry = value as Record<string, unknown>;
    const exercise = normalizeExercise(entry.exercise);
    if (!exercise) {
      continue;
    }
    result[key] = { exercise, srs: normalizeSrs(entry.srs) };
  }
  return result;
}

export function readLocalExercises(): MistakeExercisesMap {
  if (typeof window === "undefined") {
    return {};
  }
  if (!isMistakeExercisesOwnedBy(exercisesAccountUserId)) {
    return {};
  }
  return normalizeExercises(readJsonCache<unknown>(MISTAKE_EXERCISES_KEY, null));
}

export function writeLocalExercises(map: MistakeExercisesMap): void {
  if (typeof window === "undefined") {
    return;
  }
  writeRawCache(MISTAKE_EXERCISES_KEY, JSON.stringify(map));
}

function entryAge(entry: StoredExercise): string {
  return entry.exercise.createdAt || entry.srs?.lastReviewedAt || "";
}

/**
 * Merge freshly extracted exercises into the stored map. New keys are added
 * with `srs: null` (unscheduled until the first practice attempt); existing
 * keys keep their schedule even if the new payload differs. When the merged
 * map exceeds `max`, evict oldest-first: mastered entries (`srs` with
 * interval >= 21 days, by `lastReviewedAt`) first, then oldest overall (by
 * `exercise.createdAt`, falling back to `srs.lastReviewedAt`).
 */
export function mergeNewExercises(
  existing: MistakeExercisesMap,
  incoming: MistakeExercise[],
  max: number = MAX_MISTAKE_EXERCISES,
): MistakeExercisesMap {
  const merged: MistakeExercisesMap = { ...existing };
  for (const exercise of incoming) {
    if (!exercise || typeof exercise.key !== "string" || merged[exercise.key]) {
      continue;
    }
    merged[exercise.key] = { exercise, srs: null };
  }
  while (Object.keys(merged).length > max) {
    const mastered = Object.entries(merged)
      .filter(([, entry]) => entry.srs !== null && entry.srs.intervalDays >= MASTERED_INTERVAL_DAYS)
      .sort(([, a], [, b]) =>
        (a.srs?.lastReviewedAt || "").localeCompare(b.srs?.lastReviewedAt || ""),
      );
    if (mastered.length > 0) {
      delete merged[mastered[0][0]];
      continue;
    }
    const oldest = Object.entries(merged).sort(([, a], [, b]) =>
      entryAge(a).localeCompare(entryAge(b)),
    );
    delete merged[oldest[0][0]];
  }
  return merged;
}

/** Apply a practice attempt to one entry; unknown keys leave the map unchanged. */
export function recordAttempt(
  map: MistakeExercisesMap,
  key: string,
  correct: boolean,
  now: Date = new Date(),
): MistakeExercisesMap {
  const entry = map[key];
  if (!entry) {
    return map;
  }
  return {
    ...map,
    [key]: { ...entry, srs: scheduleReview(entry.srs ?? undefined, correct, now) },
  };
}

/** Entries never attempted or past due, never-attempted first, then by due date. */
export function dueExercises(map: MistakeExercisesMap, now: Date = new Date()): StoredExercise[] {
  const fresh = Object.values(map)
    .filter((entry) => entry.srs === null)
    .sort((a, b) => entryAge(a).localeCompare(entryAge(b)));
  const due = Object.values(map)
    .filter((entry) => entry.srs !== null && isDue(entry.srs, now))
    .sort((a, b) => (a.srs?.dueDate || "").localeCompare(b.srs?.dueDate || ""));
  return [...fresh, ...due];
}

export async function hydrateExercises(userId: string | null): Promise<MistakeExercisesMap> {
  exercisesAccountUserId = userId;
  exercisesOnAccount = false;
  const local = readLocalExercises();
  if (!userId) {
    writeMistakeExercisesOwner(null);
    return local;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    writeMistakeExercisesOwner(userId);
    return local;
  }
  try {
    const { data, error } = await supabase
      .from("mistake_exercises")
      .select("data, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      writeMistakeExercisesOwner(userId);
      return local;
    }
    if (!data) {
      writeLocalExercises(local);
      const { error: uploadError } = await supabase.from("mistake_exercises").upsert({
        user_id: userId,
        data: JSON.parse(JSON.stringify(local)),
        updated_at: new Date().toISOString(),
      });
      exercisesOnAccount = !uploadError;
      writeMistakeExercisesOwner(userId);
      return local;
    }
    const remote = normalizeExercises(data.data);
    // Union by key: local-first for exercises (a guest trial merged at login
    // would otherwise drop unsynced entries); the stored schedule wins per
    // key below. Keys only on the remote side are adopted as-is.
    const merged: MistakeExercisesMap = { ...remote };
    for (const [key, localEntry] of Object.entries(local)) {
      const remoteEntry = merged[key];
      if (!remoteEntry) {
        merged[key] = localEntry;
        continue;
      }
      // Same position on both sides: keep the more practiced schedule (higher
      // interval wins; ties prefer the fresher review).
      const localInterval = localEntry.srs?.intervalDays ?? 0;
      const remoteInterval = remoteEntry.srs?.intervalDays ?? 0;
      if (localInterval !== remoteInterval) {
        merged[key] = localInterval > remoteInterval ? localEntry : remoteEntry;
      } else {
        const localTime = localEntry.srs ? Date.parse(localEntry.srs.lastReviewedAt) : Number.NaN;
        const remoteTime = remoteEntry.srs ? Date.parse(remoteEntry.srs.lastReviewedAt) : Number.NaN;
        if (Number.isNaN(remoteTime) || (!Number.isNaN(localTime) && localTime > remoteTime)) {
          merged[key] = localEntry;
        }
      }
    }
    writeLocalExercises(merged);
    if (JSON.stringify(merged) !== JSON.stringify(remote)) {
      const { error: uploadError } = await supabase.from("mistake_exercises").upsert({
        user_id: userId,
        data: JSON.parse(JSON.stringify(merged)),
        updated_at: new Date().toISOString(),
      });
      exercisesOnAccount = !uploadError;
    } else {
      exercisesOnAccount = true;
    }
    writeMistakeExercisesOwner(userId);
    return merged;
  } catch {
    return local;
  }
}

export async function saveExercises(
  map: MistakeExercisesMap,
  userId: string | null = exercisesAccountUserId,
): Promise<void> {
  writeLocalExercises(map);
  writeMistakeExercisesOwner(userId);
  if (!userId) {
    return;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return;
  }
  try {
    const { error } = await supabase.from("mistake_exercises").upsert({
      user_id: userId,
      data: JSON.parse(JSON.stringify(map)),
      updated_at: new Date().toISOString(),
    });
    if (!error) {
      exercisesOnAccount = true;
    }
  } catch {
    // Local write already succeeded; remote will retry next time.
  }
}
