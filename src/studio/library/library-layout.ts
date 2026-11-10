// SIG-1274: persisted split between the Library list and preview.
export const LIBRARY_SPLIT_KEY = "chess-studio:library-split";
export const DEFAULT_LIBRARY_SPLIT = 65;
export const MIN_LIBRARY_SPLIT = 30;
export const MAX_LIBRARY_SPLIT = 85;

export function clampLibrarySplit(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIBRARY_SPLIT;
  }
  return Math.min(MAX_LIBRARY_SPLIT, Math.max(MIN_LIBRARY_SPLIT, value));
}

export function readLibrarySplit(storage?: Pick<Storage, "getItem">): number {
  try {
    const raw = (storage ?? window.localStorage).getItem(LIBRARY_SPLIT_KEY);
    return raw === null ? DEFAULT_LIBRARY_SPLIT : clampLibrarySplit(Number(raw));
  } catch {
    return DEFAULT_LIBRARY_SPLIT;
  }
}

export function writeLibrarySplit(value: number, storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? window.localStorage).setItem(LIBRARY_SPLIT_KEY, String(clampLibrarySplit(value)));
  } catch {
    // Storage can be unavailable (private mode); the split just is not remembered.
  }
}
