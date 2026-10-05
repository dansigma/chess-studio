import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { PUZZLE_PROGRESS_KEY, readJsonCache, writeRawCache } from "../lib/local-cache";
import { emptyProgress, normalizeProgress } from "./engine";
import type { PuzzleHistoryEntry, PuzzleProgress } from "./types";

let puzzleAccountUserId: string | null = null;
let puzzleOnAccount = false;

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
  const remoteTime = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) : Number.NaN;
  const localTime = localUpdatedAt ? Date.parse(localUpdatedAt) : Number.NaN;
  let streak: number;
  let daily: string;
  if (Number.isFinite(remoteTime) && Number.isFinite(localTime)) {
    if (remoteTime >= localTime) {
      streak = remote.streak;
      daily = remote.daily;
    } else {
      streak = local.streak;
      daily = local.daily;
    }
  } else {
    // No reliable local write time is stored, so a missing timestamp falls
    // back to preferring the shared remote day marker while keeping the
    // device-local streak for continuity.
    streak = local.streak;
    daily = remote.daily;
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
  const local = loadProgress();
  puzzleAccountUserId = userId;
  puzzleOnAccount = false;
  if (!userId) {
    return local;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
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
    return merged;
  } catch {
    return local;
  }
}

export async function saveProgress(progress: PuzzleProgress): Promise<void> {
  writeLocalProgress(progress);
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
