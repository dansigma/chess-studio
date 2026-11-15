/** SIG-1363: structural equality for JSON-like values; `undefined` object entries count as absent. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameValue(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

/** True when the form differs from the last saved (or freshly loaded) snapshot. */
export function isDraftDirty<T extends object>(draft: T, snapshot: T): boolean {
  return !sameValue(draft, snapshot);
}
