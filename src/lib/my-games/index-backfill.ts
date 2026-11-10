// SIG-1275: client side of the My Games position backfill. Calls
// POST /api/my-games/index until no unindexed games are left, so position
// search in the Library also finds games synced before the index existed.

export type BackfillBatch =
  | { ok: true; indexed: number; remaining: number | null }
  | { ok: false; status: number; message: string };

export type BackfillOutcome =
  | { status: "done"; indexed: number }
  | { status: "stalled"; indexed: number; remaining: number | null }
  | { status: "error"; indexed: number; message: string }
  | { status: "aborted"; indexed: number };

/** Upper bound on calls in one run: 3,000 games / 25 per batch, plus slack. */
export const MAX_BACKFILL_CALLS = 160;

export async function postIndexBatch(signal: AbortSignal): Promise<BackfillBatch> {
  const response = await fetch("/api/my-games/index", { method: "POST", signal });
  const body = (await response.json().catch(() => ({}))) as {
    indexed?: unknown;
    remaining?: unknown;
    error?: unknown;
  };
  if (!response.ok) {
    return { ok: false, status: response.status, message: typeof body.error === "string" ? body.error : "Indexing failed" };
  }
  return {
    ok: true,
    indexed: typeof body.indexed === "number" ? body.indexed : 0,
    remaining: typeof body.remaining === "number" ? body.remaining : null,
  };
}

/**
 * Runs batches until `remaining` is 0. Stops early when a batch indexes
 * nothing (only failing games are left), on an error, or when aborted.
 * A signed-out user (401) has nothing to index, so that counts as done.
 */
export async function runMyGamesBackfill(options: {
  post?: (signal: AbortSignal) => Promise<BackfillBatch>;
  onProgress?: (remaining: number | null) => void;
  signal: AbortSignal;
  maxCalls?: number;
}): Promise<BackfillOutcome> {
  const post = options.post ?? postIndexBatch;
  const maxCalls = options.maxCalls ?? MAX_BACKFILL_CALLS;
  let indexed = 0;
  let remaining: number | null = null;
  for (let call = 0; call < maxCalls; call += 1) {
    if (options.signal.aborted) {
      return { status: "aborted", indexed };
    }
    let batch: BackfillBatch;
    try {
      batch = await post(options.signal);
    } catch (error) {
      if (options.signal.aborted) {
        return { status: "aborted", indexed };
      }
      return { status: "error", indexed, message: error instanceof Error ? error.message : "Indexing failed" };
    }
    if (!batch.ok) {
      return batch.status === 401 ? { status: "done", indexed } : { status: "error", indexed, message: batch.message };
    }
    indexed += batch.indexed;
    remaining = batch.remaining;
    options.onProgress?.(remaining);
    if (remaining === 0) {
      return { status: "done", indexed };
    }
    if (batch.indexed === 0) {
      return { status: "stalled", indexed, remaining };
    }
  }
  return { status: "stalled", indexed, remaining };
}
