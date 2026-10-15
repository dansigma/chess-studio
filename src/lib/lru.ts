export function createLruCache<K, V>(maxEntries: number): {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  size(): number;
  clear(): void;
} {
  const store = new Map<K, V>();
  return {
    get(key: K): V | undefined {
      if (!store.has(key)) {
        return undefined;
      }
      const value = store.get(key) as V;
      store.delete(key);
      store.set(key, value);
      return value;
    },
    set(key: K, value: V): void {
      if (store.has(key)) {
        store.delete(key);
      } else if (store.size >= maxEntries) {
        const oldest = store.keys().next();
        if (!oldest.done) {
          store.delete(oldest.value);
        }
      }
      store.set(key, value);
    },
    size(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
  };
}
