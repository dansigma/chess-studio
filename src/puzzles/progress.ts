import { emptyProgress, normalizeProgress } from "./engine";
import type { PuzzleProgress } from "./types";

const STORAGE_KEY = "xadrez-digital.puzzles";

export function loadProgress(): PuzzleProgress {
  if (typeof window === "undefined") {
    return emptyProgress();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyProgress();
    }
    return normalizeProgress(JSON.parse(raw) as unknown);
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress: PuzzleProgress): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
