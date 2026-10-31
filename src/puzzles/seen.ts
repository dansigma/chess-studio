// SIG-1179: persistent per-user seen history for the regular puzzle pool.
//
// Seen rule: a puzzle counts as seen once it is shown AND attempted — solved,
// failed, or gave up — recorded once at attempt-commit time. Merely displayed
// puzzles (skipped via Next without playing, still "playing" on unmount) do
// NOT count. Daily mode is date-keyed and excluded by callers; the mistakes
// SRS mode (SIG-1097) intentionally re-shows positions and never records here.
//
// Two tiers: logged-in users persist to the server-side `puzzle_seen` ledger
// (own-row RLS, insert-only) which the `puzzles_unseen` RPC excludes without
// ever downloading the full id set. Anonymous users keep a best-effort local
// set in localStorage (capped; oldest evicted), merged into the account at
// login. The local copy is also written for logged-in users as an offline
// fallback, mirroring progress.ts / mistake-exercises-store.ts.
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import {
  PUZZLE_SEEN_KEY,
  PUZZLE_SEEN_OWNER_KEY,
  readJsonCache,
  readRawCache,
  removeRawCache,
  writeRawCache,
} from "../lib/local-cache";

let seenAccountUserId: string | null = null;

// Cap for the anonymous local history. Puzzle ids are short (~10 chars), so
// 2000 ids stay well under localStorage quota while covering months of play.
export const MAX_LOCAL_SEEN_IDS = 2000;

function readSeenOwner(): string | null {
  const owner = readRawCache(PUZZLE_SEEN_OWNER_KEY);
  return owner === null || owner === "" ? null : owner;
}

function writeSeenOwner(userId: string | null): void {
  if (!userId) {
    if (readRawCache(PUZZLE_SEEN_OWNER_KEY) !== null) {
      removeRawCache(PUZZLE_SEEN_OWNER_KEY);
    }
    return;
  }
  writeRawCache(PUZZLE_SEEN_OWNER_KEY, userId);
}

export function isSeenOwnedBy(userId: string | null): boolean {
  const owner = readSeenOwner();
  if (owner === null) {
    return true;
  }
  return owner === userId;
}

/** Normalize a raw localStorage payload into newest-last id list. */
export function normalizeSeenIds(raw: unknown, max: number = MAX_LOCAL_SEEN_IDS): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || item === "" || seen.has(item)) {
      continue;
    }
    seen.add(item);
    ids.push(item);
  }
  return ids.slice(Math.max(0, ids.length - Math.max(1, max)));
}

/** Read the local seen set (empty for foreign-owner data, mirroring progress.ts). */
export function loadSeenIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  if (!isSeenOwnedBy(seenAccountUserId)) {
    return new Set();
  }
  return new Set(normalizeSeenIds(readJsonCache<unknown>(PUZZLE_SEEN_KEY, null)));
}

function writeLocalSeen(ids: readonly string[]): void {
  if (typeof window === "undefined") {
    return;
  }
  writeRawCache(PUZZLE_SEEN_KEY, JSON.stringify(normalizeSeenIds(ids)));
}

/** Append one id to the local set (newest last, capped). Returns the new set. */
export function appendLocalSeenId(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  next.delete(id);
  next.add(id);
  while (next.size > MAX_LOCAL_SEEN_IDS) {
    const oldest = next.values().next().value as string | undefined;
    if (oldest === undefined) {
      break;
    }
    next.delete(oldest);
  }
  writeLocalSeen([...next]);
  return next;
}

/**
 * Record one attempt. Always appends to the local fallback; fire-and-forget
 * upserts to the account ledger when signed in. Callers must add the id to
 * their in-memory exclude set synchronously — the remote write may land after
 * the next pick.
 */
export function recordSeen(puzzleId: string, userId: string | null = seenAccountUserId): Set<string> {
  const next = appendLocalSeenId(loadSeenIds(), puzzleId);
  writeSeenOwner(userId);
  if (!userId) {
    return next;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return next;
  }
  try {
    const pending = supabase
      .from("puzzle_seen")
      // ignoreDuplicates: conflicting upserts resolve as skips, not updates.
      // The ledger is insert-only (no UPDATE policy), so without this flag a
      // re-attempt of an already-recorded id would fail the remote write
      // (same contract as my-games sync).
      .upsert({ user_id: userId, puzzle_id: puzzleId }, { onConflict: "user_id,puzzle_id", ignoreDuplicates: true });
    void (pending as unknown as Promise<unknown>).catch(() => {
      // Local write already succeeded; the id merges on the next login.
    });
  } catch {
    // Local write already succeeded; the id merges on the next login.
  }
  return next;
}

/**
 * Merge the pre-login local buffer into the account ledger. Union semantics:
 * ids exist on either side afterwards; duplicates collapse on the PK. Called
 * once per session init when a user id is present.
 */
export async function mergeLocalSeenToAccount(userId: string | null): Promise<Set<string>> {
  seenAccountUserId = userId;
  const local = loadSeenIds();
  if (!userId) {
    writeSeenOwner(null);
    return local;
  }
  if (!isSeenOwnedBy(userId)) {
    writeLocalSeen([]);
    writeSeenOwner(userId);
    return new Set();
  }
  writeSeenOwner(userId);
  if (local.size === 0) {
    return local;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return local;
  }
  try {
    const rows = [...local].map((puzzle_id) => ({ user_id: userId, puzzle_id }));
    const pending = supabase
      .from("puzzle_seen")
      // Batch in one round-trip; PK dedupes ids already recorded.
      // ignoreDuplicates keeps one already-recorded id from failing the
      // whole batch (insert-only ledger has no UPDATE policy).
      .upsert(rows, { onConflict: "user_id,puzzle_id", ignoreDuplicates: true });
    await (pending as unknown as Promise<unknown>);
  } catch {
    // Local copy stays; the merge retries on the next init.
  }
  return local;
}
