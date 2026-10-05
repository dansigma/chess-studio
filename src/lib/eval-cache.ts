// SIG-856: the zustand `evalByFen` map is append-only without a bound, so a
// long analysis session grows it forever. Entries are keyed by FEN in
// insertion order, which doubles as recency order (the store re-inserts the
// key on every write, mirroring `createLruCache.set`). 256 entries cover a
// full game plus sidelines without letting the map — or its subscribers —
// grow without bound.
export const MAX_EVAL_CACHE_ENTRIES = 256;

export function capEvalCache<V>(
  cache: Record<string, V>,
  max: number = MAX_EVAL_CACHE_ENTRIES,
): Record<string, V> {
  const keys = Object.keys(cache);
  if (keys.length <= max) {
    return cache;
  }
  const next: Record<string, V> = {};
  for (const key of keys.slice(keys.length - max)) {
    next[key] = cache[key] as V;
  }
  return next;
}

export type EvalSnapshot = {
  pawns: number;
  label: string;
  depth?: number;
};

export type ResolvedEvalDisplay = {
  pawns: number;
  label: string;
  depth: number;
};

// SIG-856 choice (b): on a FEN change the panel holds the last displayed
// value instead of zeroing the bar while the engine catches up, and shows
// the cached value immediately when the FEN was analyzed before. The depth
// travels with the value so the readout never pairs one FEN's eval with
// another FEN's depth.
export function resolveEvalDisplay(
  live: EvalSnapshot | null,
  cached: EvalSnapshot | undefined,
  held: EvalSnapshot | null,
  fallbackDepth: number,
): ResolvedEvalDisplay {
  const source = live ?? cached ?? held;
  if (!source) {
    return { pawns: 0, label: "", depth: fallbackDepth };
  }
  return {
    pawns: source.pawns,
    label: source.label,
    depth: source.depth ?? fallbackDepth,
  };
}
