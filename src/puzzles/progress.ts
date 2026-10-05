import { PUZZLE_PROGRESS_KEY, readJsonCache, writeRawCache } from "../lib/local-cache";
import { emptyProgress, normalizeProgress } from "./engine";
import type { PuzzleProgress } from "./types";

export function loadProgress(): PuzzleProgress {
  if (typeof window === "undefined") {
    return emptyProgress();
  }
  return normalizeProgress(readJsonCache<unknown>(PUZZLE_PROGRESS_KEY, null));
}

export function saveProgress(progress: PuzzleProgress): void {
  if (typeof window === "undefined") {
    return;
  }
  writeRawCache(PUZZLE_PROGRESS_KEY, JSON.stringify(progress));
}
