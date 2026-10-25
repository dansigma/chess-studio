import type { ReviewPreset, ReviewRow } from "@/src/chess/review-engine";

// In-memory result cache for finished reviews. Deliberately module-level (not
// in the persisted store): it survives panel remounts and tab switches but is
// gone on reload, and results are keyed by the reviewed line itself, so any
// tree edit that changes the line's positions or moves simply misses.
//
// SIG-965: the hot layer stays sync and memory-only. Finished reviews are also
// persisted to IndexedDB (see ./review-store.ts) via fire-and-forget
// persistReview() and reloaded once per session via hydrateReviewCache().

/**
 * Cache schema version. Bump whenever the ReviewRow scoring/grading shape
 * changes: it is part of every cache key (sync + persistent), so old persisted
 * reviews miss instead of showing stale ratings.
 */
export const REVIEW_SCHEMA_VERSION = 1;

const MAX_ENTRIES = 12;

const entries = new Map<string, ReviewRow[]>();

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Canonical fingerprint input for one reviewed line (stable across sync/async keys). */
export function reviewFingerprintInput(
  fens: string[],
  ucis: string[],
  preset: ReviewPreset,
  engineBuild: string,
): string {
  const line = `${fens.join("|")}#${ucis.join(" ")}`;
  return `${engineBuild}:${preset}:${fens.length}:${line}:${line.length}`;
}

/** Key for one reviewed line: its FEN sequence and moves, the depth preset and the engine build. */
export function reviewCacheKey(fens: string[], ucis: string[], preset: ReviewPreset, engineBuild: string): string {
  return `v${REVIEW_SCHEMA_VERSION}:${fnv1a(reviewFingerprintInput(fens, ucis, preset, engineBuild))}`;
}

/**
 * SHA-256 hex of text via WebCrypto when available, FNV-1a hex fallback
 * otherwise (Node tests, non-secure contexts, SSR). Never throws.
 */
export async function sha256Hex(text: string): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // Fall through to the sync fallback below.
  }
  return fnv1a(text);
}

/** Persistent (IndexedDB) key for one reviewed line: versioned SHA-256 of the fingerprint. */
export async function persistentReviewKey(
  fens: string[],
  ucis: string[],
  preset: ReviewPreset,
  engineBuild: string,
): Promise<string> {
  return `v${REVIEW_SCHEMA_VERSION}:${await sha256Hex(reviewFingerprintInput(fens, ucis, preset, engineBuild))}`;
}

export function getCachedReview(key: string): ReviewRow[] | null {
  const hit = entries.get(key);
  if (!hit) {
    return null;
  }
  // Refresh recency.
  entries.delete(key);
  entries.set(key, hit);
  return hit;
}

export function setCachedReview(key: string, rows: ReviewRow[]): void {
  entries.delete(key);
  entries.set(key, rows);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    entries.delete(oldest);
  }
}

export function clearReviewCache(): void {
  entries.clear();
  // Fire-and-forget: persistence is best-effort, and the import below is lazy
  // enough that this stays safe under node:test (no IndexedDB touched at
  // module load — the backend opens the DB only on first use, guarded).
  void import("./review-store")
    .then(({ getReviewStore }) => getReviewStore().clearReviews())
    .catch(() => undefined);
}

function insertHot(key: string, rows: ReviewRow[]): void {
  entries.delete(key);
  entries.set(key, rows);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    entries.delete(oldest);
  }
}

/**
 * Best-effort persistent save of a finished review. Sync hot-layer insert is
 * done by setCachedReview; this derives the persistent key and writes to
 * IndexedDB without ever rejecting or blocking the caller.
 */
export function persistReview(
  fens: string[],
  ucis: string[],
  preset: ReviewPreset,
  engineBuild: string,
  cacheKey: string,
  rows: ReviewRow[],
): void {
  try {
    void (async () => {
      try {
        const { getReviewStore } = await import("./review-store");
        const key = await persistentReviewKey(fens, ucis, preset, engineBuild);
        await getReviewStore().saveReview(
          key,
          { preset, engineBuild, moves: ucis.length, cacheKey },
          rows,
        );
      } catch {
        // Silent: persistence is best-effort.
      }
    })();
  } catch {
    // Silent (see above).
  }
}

/**
 * One-shot session hydration: loads persisted reviews oldest-first through the
 * capped hot-layer insert so the most recent survivors stay cached. Never
 * rejects; safe to call once per session on the client.
 */
export async function hydrateReviewCache(): Promise<void> {
  try {
    const { getReviewStore } = await import("./review-store");
    const all = await getReviewStore().loadAllByRecency();
    for (const entry of all) {
      if (typeof entry.cacheKey === "string" && Array.isArray(entry.rows)) {
        insertHot(entry.cacheKey, entry.rows as ReviewRow[]);
      }
    }
  } catch {
    // Silent: a failed hydration just leaves the hot layer empty.
  }
}
