import { createBrowserSupabase } from "@/src/lib/supabase/client";
import {
  PUZZLE_PROGRESS_KEY,
  readJsonCache,
  readRawCache,
  removeRawCache,
  writeRawCache,
} from "../lib/local-cache";
import { emptyProgress, normalizeProgress } from "./engine";
import type { PuzzleHistoryEntry, PuzzleProgress } from "./types";

let puzzleAccountUserId: string | null = null;
let puzzleOnAccount = false;

// SIG-887: owner marker mirroring the SIG-886 course-progress guard
// (src/lib/local-cache.ts). It lives here — not in local-cache.ts — so
// the rework stays inside the briefed files. Unmarked (anonymous trial /
// legacy) data stays mergeable; marked foreign data is dropped on sight
// so a hydrate racing ahead of the account-change purge can never adopt
// the previous account's progress into the next account's row.
export const PUZZLE_PROGRESS_OWNER_KEY = `${PUZZLE_PROGRESS_KEY}:owner`;

function readPuzzleProgressOwner(): string | null {
  const owner = readRawCache(PUZZLE_PROGRESS_OWNER_KEY);
  return owner === null || owner === "" ? null : owner;
}

function writePuzzleProgressOwner(userId: string | null): void {
  if (!userId) {
    if (readRawCache(PUZZLE_PROGRESS_OWNER_KEY) !== null) {
      removeRawCache(PUZZLE_PROGRESS_OWNER_KEY);
    }
    return;
  }
  writeRawCache(PUZZLE_PROGRESS_OWNER_KEY, userId);
}

function isPuzzleProgressOwnedBy(userId: string | null): boolean {
  const owner = readPuzzleProgressOwner();
  if (owner === null) {
    return true;
  }
  return owner === userId;
}

export function progressSource(): "account" | "browser" {
  return puzzleOnAccount ? "account" : "browser";
}

export function loadProgress(): PuzzleProgress {
  if (typeof window === "undefined") {
    return emptyProgress();
  }
  return normalizeProgress(readJsonCache<unknown>(PUZZLE_PROGRESS_KEY, null));
}

function writeLocalProgress(progress: PuzzleProgress): void {
  if (typeof window === "undefined") {
    return;
  }
  writeRawCache(PUZZLE_PROGRESS_KEY, JSON.stringify(progress));
}

export function mergePuzzleProgress(
  local: PuzzleProgress,
  remote: PuzzleProgress | null | undefined,
  remoteUpdatedAt?: string | null,
  localUpdatedAt?: string | null,
): PuzzleProgress {
  if (!remote) {
    return normalizeProgress(local);
  }
  // Idempotence holds for normalized inputs (history sorted by `at` desc
  // with unique ids): merge outputs always satisfy this, so merging a
  // merge result with itself is a fixed point. Raw inputs with unsorted
  // or duplicated history land on the same fixed point on re-merge.
  const remoteTime = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) : Number.NaN;
  const localTime = localUpdatedAt ? Date.parse(localUpdatedAt) : Number.NaN;
  let streak: number;
  let daily: string;
  if (Number.isFinite(remoteTime) && Number.isFinite(localTime)) {
    // Ties resolve to the account side.
    if (remoteTime >= localTime) {
      streak = remote.streak;
      daily = remote.daily;
    } else {
      streak = local.streak;
      daily = local.daily;
    }
  } else if (Number.isFinite(remoteTime)) {
    // Only the account carries a write time (the app never persists the
    // local write time), so its streak is the fresher signal. The day
    // marker resolves by value instead: YYYY-MM-DD sorts chronologically,
    // which keeps a newer local daily from being rolled back by an older
    // account row.
    streak = remote.streak;
    daily = local.daily > remote.daily ? local.daily : remote.daily;
  } else {
    // No write time on either side: keep the device-local streak for
    // continuity and resolve the day marker by value.
    streak = local.streak;
    daily = local.daily > remote.daily ? local.daily : remote.daily;
  }
  const byId = new Map<string, PuzzleHistoryEntry>();
  for (const entry of [...local.history, ...remote.history]) {
    const prev = byId.get(entry.id);
    if (!prev || entry.at > prev.at) {
      byId.set(entry.id, entry);
    }
  }
  const history = [...byId.values()].sort((a, b) => b.at - a.at);
  return normalizeProgress({
    rating: Math.max(local.rating, remote.rating),
    solved: Math.max(local.solved, remote.solved),
    failed: Math.max(local.failed, remote.failed),
    streak,
    bestStreak: Math.max(local.bestStreak, remote.bestStreak),
    rushBest: Math.max(local.rushBest, remote.rushBest),
    daily,
    xp: Math.max(local.xp, remote.xp),
    history,
  });
}

export async function hydratePuzzleProgress(userId: string | null): Promise<PuzzleProgress> {
  const stored = loadProgress();
  // A hydrate racing ahead of the account-change purge must not merge
  // another user's local rows into this account. Unmarked data is the
  // anonymous trial (or legacy) and stays mergeable; marked foreign data
  // is dropped on sight so no later hydrate can adopt it.
  const owned = isPuzzleProgressOwnedBy(userId);
  const local = owned ? stored : emptyProgress();
  puzzleAccountUserId = userId;
  puzzleOnAccount = false;
  if (!owned) {
    removeRawCache(PUZZLE_PROGRESS_KEY);
    writePuzzleProgressOwner(null);
  }
  if (!userId) {
    return local;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    if (owned) {
      writePuzzleProgressOwner(userId);
    }
    return local;
  }
  try {
    const { data, error } = await supabase
      .from("puzzle_progress")
      .select("data, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      return local;
    }
    if (!data) {
      const merged = normalizeProgress(local);
      writeLocalProgress(merged);
      const { error: uploadError } = await supabase.from("puzzle_progress").upsert({
        user_id: userId,
        data: JSON.parse(JSON.stringify(merged)),
        updated_at: new Date().toISOString(),
      });
      puzzleOnAccount = !uploadError;
      writePuzzleProgressOwner(userId);
      return merged;
    }
    const remote = normalizeProgress(data.data);
    const merged = mergePuzzleProgress(local, remote, data.updated_at, null);
    writeLocalProgress(merged);
    if (JSON.stringify(merged) !== JSON.stringify(remote)) {
      const { error: uploadError } = await supabase.from("puzzle_progress").upsert({
        user_id: userId,
        data: JSON.parse(JSON.stringify(merged)),
        updated_at: new Date().toISOString(),
      });
      puzzleOnAccount = !uploadError;
    } else {
      puzzleOnAccount = true;
    }
    writePuzzleProgressOwner(userId);
    return merged;
  } catch {
    return local;
  }
}

export async function saveProgress(progress: PuzzleProgress): Promise<void> {
  writeLocalProgress(progress);
  writePuzzleProgressOwner(puzzleAccountUserId);
  const userId = puzzleAccountUserId;
  if (!userId) {
    return;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return;
  }
  try {
    const { error } = await supabase.from("puzzle_progress").upsert({
      user_id: userId,
      data: JSON.parse(JSON.stringify(progress)),
      updated_at: new Date().toISOString(),
    });
    if (!error) {
      puzzleOnAccount = true;
    }
  } catch {
    // Local write already succeeded; the account copy retries next time.
  }
}
