import type { ReviewPreset, ReviewRow } from "@/src/chess/review-engine";

// In-memory result cache for finished reviews. Deliberately module-level (not
// in the persisted store): it survives panel remounts and tab switches but is
// gone on reload, and results are keyed by the reviewed line itself, so any
// tree edit that changes the line's positions or moves simply misses.

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

/** Key for one reviewed line: its FEN sequence and moves, the depth preset and the engine build. */
export function reviewCacheKey(fens: string[], ucis: string[], preset: ReviewPreset, engineBuild: string): string {
  const line = `${fens.join("|")}#${ucis.join(" ")}`;
  return `${engineBuild}:${preset}:${fens.length}:${fnv1a(line)}:${line.length}`;
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
}
