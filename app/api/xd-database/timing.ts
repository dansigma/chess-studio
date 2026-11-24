import { AsyncLocalStorage } from "node:async_hooks";
import { getRequestExecutionContext } from "vinext/shims/request-context";

/**
 * Per-request timing of one Base XD API call (SIG-1471). The reader and its
 * source closure are shared by every request of an isolate, so the collector
 * travels in AsyncLocalStorage instead of living in the closure.
 */
export type XdTiming = { r2Reads: number; r2Ms: number; cacheHits: number; cacheMisses: number };

const store = new AsyncLocalStorage<XdTiming>();

export function newTiming(): XdTiming {
  return { r2Reads: 0, r2Ms: 0, cacheHits: 0, cacheMisses: 0 };
}

export function withTiming<T>(timing: XdTiming, fn: () => Promise<T>): Promise<T> {
  return store.run(timing, fn);
}

export function recordCache(hit: boolean) {
  const timing = store.getStore();
  if (!timing) return;
  if (hit) timing.cacheHits++;
  else timing.cacheMisses++;
}

export async function timedR2<T>(read: () => Promise<T>): Promise<T> {
  const timing = store.getStore();
  const started = performance.now();
  try {
    return await read();
  } finally {
    if (timing) {
      timing.r2Reads++;
      // Parallel reads add up, so this is read time, not wall time.
      timing.r2Ms += performance.now() - started;
    }
  }
}

export function serverTiming(timing: XdTiming | undefined, totalMs: number, edge: "hit" | "miss" | "off"): string {
  const parts = [`total;dur=${Math.round(totalMs)}`];
  if (timing) {
    parts.push(`r2;dur=${Math.round(timing.r2Ms)};desc="${timing.r2Reads} reads"`);
    parts.push(`cache;desc="${timing.cacheHits} hit ${timing.cacheMisses} miss"`);
  }
  parts.push(`edge;desc=${edge}`);
  return parts.join(", ");
}

/**
 * Runs an edge-cache write without delaying the response when the request has
 * an execution context; awaits it otherwise (unit tests, Node). Never throws.
 */
export async function deferCacheWrite(write: () => Promise<unknown>): Promise<void> {
  const task = Promise.resolve().then(write).then(() => undefined, (cause) => {
    console.warn("[xd-database] cache write failed", cause);
  });
  const ctx = getRequestExecutionContext();
  if (ctx) {
    try {
      ctx.waitUntil(task);
      return;
    } catch {
      // No usable context: wait for the write instead.
    }
  }
  await task;
}
