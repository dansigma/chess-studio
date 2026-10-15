import { createBrowserSupabase } from "@/src/lib/supabase/client";
import {
  readJsonCache,
  readRawCache,
  removeRawCache,
  REPERTOIRE_PROGRESS_KEY,
  REPERTOIRE_PROGRESS_OWNER_KEY,
  writeRawCache,
} from "./local-cache";
import type { SpacedRepetitionItem } from "../chess/repertoire";

export type RepertoireProgress = Record<string, SpacedRepetitionItem>;

let repertoireAccountUserId: string | null = null;
let repertoireOnAccount = false;

export function repertoireProgressSource(): "account" | "browser" {
  return repertoireOnAccount ? "account" : "browser";
}

function readRepertoireProgressOwner(): string | null {
  const owner = readRawCache(REPERTOIRE_PROGRESS_OWNER_KEY);
  return owner === null || owner === "" ? null : owner;
}

export function writeRepertoireProgressOwner(userId: string | null): void {
  if (!userId) {
    if (readRawCache(REPERTOIRE_PROGRESS_OWNER_KEY) !== null) {
      removeRawCache(REPERTOIRE_PROGRESS_OWNER_KEY);
    }
    return;
  }
  writeRawCache(REPERTOIRE_PROGRESS_OWNER_KEY, userId);
}

export function isRepertoireProgressOwnedBy(userId: string | null): boolean {
  const owner = readRepertoireProgressOwner();
  if (owner === null) {
    return true;
  }
  return owner === userId;
}

export function normalizeRepertoireProgress(raw: unknown): RepertoireProgress {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const result: RepertoireProgress = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const item = value as Record<string, unknown>;
    const lastReviewedAt = typeof item.lastReviewedAt === "string" ? item.lastReviewedAt : new Date().toISOString();
    const intervalDays = typeof item.intervalDays === "number" && Number.isFinite(item.intervalDays) ? Math.max(1, item.intervalDays) : 1;
    const easeFactor = typeof item.easeFactor === "number" && Number.isFinite(item.easeFactor) ? Math.max(1.3, item.easeFactor) : 2.5;
    const dueDate = typeof item.dueDate === "string" ? item.dueDate : new Date().toISOString();
    const mistakeCount = typeof item.mistakeCount === "number" && Number.isFinite(item.mistakeCount) ? Math.max(0, item.mistakeCount) : 0;
    result[key] = {
      lastReviewedAt,
      intervalDays,
      easeFactor,
      dueDate,
      mistakeCount,
    };
  }
  return result;
}

export function readLocalRepertoireProgress(): RepertoireProgress {
  if (typeof window === "undefined") {
    return {};
  }
  if (!isRepertoireProgressOwnedBy(repertoireAccountUserId)) {
    return {};
  }
  return normalizeRepertoireProgress(readJsonCache<unknown>(REPERTOIRE_PROGRESS_KEY, null));
}

export function writeLocalRepertoireProgress(progress: RepertoireProgress): void {
  if (typeof window === "undefined") {
    return;
  }
  writeRawCache(REPERTOIRE_PROGRESS_KEY, JSON.stringify(progress));
}

export function mergeRepertoireProgress(
  local: RepertoireProgress,
  remote: RepertoireProgress | null | undefined,
): RepertoireProgress {
  if (!remote) {
    return { ...local };
  }
  const merged: RepertoireProgress = { ...local };
  for (const [key, remoteItem] of Object.entries(remote)) {
    const localItem = merged[key];
    if (!localItem) {
      merged[key] = { ...remoteItem };
      continue;
    }
    const localTime = Date.parse(localItem.lastReviewedAt);
    const remoteTime = Date.parse(remoteItem.lastReviewedAt);
    if (Number.isNaN(localTime) || remoteTime > localTime) {
      merged[key] = { ...remoteItem };
    } else if (Number.isNaN(remoteTime) || localTime > remoteTime) {
      merged[key] = { ...localItem };
    } else {
      // Same timestamp or equal: pick higher interval / greater mastery
      merged[key] = localItem.intervalDays >= remoteItem.intervalDays ? { ...localItem } : { ...remoteItem };
    }
  }
  return merged;
}

export async function hydrateRepertoireProgress(userId: string | null): Promise<RepertoireProgress> {
  repertoireAccountUserId = userId;
  repertoireOnAccount = false;
  const local = readLocalRepertoireProgress();
  if (!userId) {
    writeRepertoireProgressOwner(null);
    return local;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    writeRepertoireProgressOwner(userId);
    return local;
  }
  try {
    const { data, error } = await supabase
      .from("repertoire_progress")
      .select("data, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      writeRepertoireProgressOwner(userId);
      return local;
    }
    if (!data) {
      writeLocalRepertoireProgress(local);
      const { error: uploadError } = await supabase.from("repertoire_progress").upsert({
        user_id: userId,
        data: JSON.parse(JSON.stringify(local)),
        updated_at: new Date().toISOString(),
      });
      repertoireOnAccount = !uploadError;
      writeRepertoireProgressOwner(userId);
      return local;
    }
    const remote = normalizeRepertoireProgress(data.data);
    const merged = mergeRepertoireProgress(local, remote);
    writeLocalRepertoireProgress(merged);
    if (JSON.stringify(merged) !== JSON.stringify(remote)) {
      const { error: uploadError } = await supabase.from("repertoire_progress").upsert({
        user_id: userId,
        data: JSON.parse(JSON.stringify(merged)),
        updated_at: new Date().toISOString(),
      });
      repertoireOnAccount = !uploadError;
    } else {
      repertoireOnAccount = true;
    }
    writeRepertoireProgressOwner(userId);
    return merged;
  } catch {
    return local;
  }
}

export async function saveRepertoireProgress(
  progress: RepertoireProgress,
  userId: string | null = repertoireAccountUserId,
): Promise<void> {
  writeLocalRepertoireProgress(progress);
  writeRepertoireProgressOwner(userId);
  if (!userId) {
    return;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return;
  }
  try {
    const { error } = await supabase.from("repertoire_progress").upsert({
      user_id: userId,
      data: JSON.parse(JSON.stringify(progress)),
      updated_at: new Date().toISOString(),
    });
    if (!error) {
      repertoireOnAccount = true;
    }
  } catch {
    // Local write already succeeded; remote will retry next time.
  }
}
