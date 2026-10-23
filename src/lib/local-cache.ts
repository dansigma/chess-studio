// SIG-886: the studio's per-account local caches share one purge point.
// Course progress, custom-course drafts and puzzle progress are keyed by
// raw localStorage keys; on every account change with a previous user the
// session reset purges them so the next account never reads the previous
// user's data. Course progress additionally carries an owner marker so a
// hydrate that races ahead of the reset still discards foreign data,
// while unmarked (anonymous trial / legacy) data stays mergeable.
export const COURSE_PROGRESS_KEY = "xd-course-progress";
export const CUSTOM_COURSES_KEY = "xd-custom-courses";
export const PUZZLE_PROGRESS_KEY = "xadrez-digital.puzzles";
export const COURSE_PROGRESS_OWNER_KEY = `${COURSE_PROGRESS_KEY}:owner`;
export const REPERTOIRE_PROGRESS_KEY = "xd-repertoire-progress";
export const REPERTOIRE_PROGRESS_OWNER_KEY = `${REPERTOIRE_PROGRESS_KEY}:owner`;
export const MISTAKE_EXERCISES_KEY = "xd-mistake-exercises";
export const MISTAKE_EXERCISES_OWNER_KEY = `${MISTAKE_EXERCISES_KEY}:owner`;

export const USER_LOCAL_CACHE_KEYS = [
  COURSE_PROGRESS_KEY,
  CUSTOM_COURSES_KEY,
  PUZZLE_PROGRESS_KEY,
  COURSE_PROGRESS_OWNER_KEY,
  REPERTOIRE_PROGRESS_KEY,
  REPERTOIRE_PROGRESS_OWNER_KEY,
  MISTAKE_EXERCISES_KEY,
  MISTAKE_EXERCISES_OWNER_KEY,
];

function userCacheStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRawCache(key: string): string | null {
  const storage = userCacheStorage();
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRawCache(key: string, value: string): void {
  const storage = userCacheStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, value);
  } catch {
    // The account copy is the one that has to succeed.
  }
}

export function removeRawCache(key: string): void {
  const storage = userCacheStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // A stale key is cleaned on the next successful pass.
  }
}

export function readJsonCache<T>(key: string, fallback: T): T {
  const raw = readRawCache(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function purgeUserLocalCaches(): void {
  const storage = userCacheStorage();
  if (!storage) {
    return;
  }
  for (const key of USER_LOCAL_CACHE_KEYS) {
    try {
      if (storage.getItem(key) !== null) {
        storage.removeItem(key);
      }
    } catch {
      // A stale key is cleaned on the next successful pass.
    }
  }
}

export function readCourseProgressOwner(): string | null {
  const owner = readRawCache(COURSE_PROGRESS_OWNER_KEY);
  return owner === null || owner === "" ? null : owner;
}

export function writeCourseProgressOwner(userId: string | null): void {
  if (!userId) {
    if (readRawCache(COURSE_PROGRESS_OWNER_KEY) !== null) {
      removeRawCache(COURSE_PROGRESS_OWNER_KEY);
    }
    return;
  }
  writeRawCache(COURSE_PROGRESS_OWNER_KEY, userId);
}

export function isCourseProgressOwnedBy(userId: string | null): boolean {
  const owner = readCourseProgressOwner();
  if (owner === null) {
    return true;
  }
  return owner === userId;
}
