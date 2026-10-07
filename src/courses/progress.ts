import type { VariationProgress } from "./types";

export type ProgressMergeResult = {
  merged: Record<string, VariationProgress>;
  toUpload: Record<string, VariationProgress>;
};

export function mergeProgress(
  local: Record<string, VariationProgress>,
  remote: Record<string, VariationProgress>,
): ProgressMergeResult {
  const merged: Record<string, VariationProgress> = {};
  const toUpload: Record<string, VariationProgress> = {};
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const localEntry = local[id];
    const remoteEntry = remote[id];
    const step = Math.max(localEntry?.step ?? 0, remoteEntry?.step ?? 0);
    const learned = Boolean(localEntry?.learned) || Boolean(remoteEntry?.learned);
    const entry: VariationProgress = { step, learned };
    merged[id] = entry;
    if (!remoteEntry || step > remoteEntry.step || (learned && !remoteEntry.learned)) {
      toUpload[id] = entry;
    }
  }
  return { merged, toUpload };
}
