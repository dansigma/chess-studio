// Tiny insertion-ordered LRU used to memoize pure fact functions per FEN.
export function memoize<A extends string[], R>(fn: (...args: A) => R, size = 64): (...args: A) => R {
  const cache = new Map<string, R>();
  return (...args: A): R => {
    const key = args.join("\u0000");
    if (cache.has(key)) {
      const hit = cache.get(key) as R;
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const value = fn(...args);
    cache.set(key, value);
    if (cache.size > size) {
      const oldest = cache.keys().next();
      if (!oldest.done) {
        cache.delete(oldest.value);
      }
    }
    return value;
  };
}
