// SIG-1223: the Game Review's own engine, outside `shared-engine`.
//
// The review always runs on Stockfish 19 lite at Threads 1 (see
// `REVIEW_WORKER_URL`), whatever build or thread count the analysis panel uses,
// so the same game always gets the same labels and the same wall time. It owns
// a small pool of such workers; `runReview` keeps up to `concurrency` positions
// in flight and every position is a self-contained search (same depth, MultiPV
// 3, fresh hash), so which worker scores which position cannot change a result.
//
// No lease, no priority: the analysis panel and Show threat run on the shared
// worker and neither stops nor delays the review, and vice versa.
//
// Workers are created lazily (a review that never starts costs nothing) and are
// terminated by `dispose()` (cancel, finish, unmount). A worker that dies for
// good (the client's second consecutive error) is retired and its position is
// re-run on a surviving worker; with no survivors `analyze` resolves null, which
// `runReview` turns into a failed (resumable) outcome.

import type { AnalyzeOptions, PositionEval, ReviewEngine } from "@/src/chess/review-engine";
import { createSearchEngine, type SearchClient, type SearchEngine } from "./search-engine";
import { REVIEW_WORKER_URL, StockfishEngine, type EngineInfo } from "./stockfish-client";

/** Upper bound on review workers (lite wasm is ~1.8 MB plus 16 MB hash each). */
export const MAX_REVIEW_WORKERS = 4;

/** Test-only upper bound for the `NEXT_PUBLIC_REVIEW_POOL_SIZE` override. */
const MAX_FORCED_WORKERS = 16;

/**
 * Pool size from the machine: `min(4, max(1, cores - 1))`, leaving one core for
 * the page and the analysis panel. `NEXT_PUBLIC_REVIEW_POOL_SIZE` is a test-only
 * override (benchmarks on small machines); production builds never set it.
 */
export function reviewPoolSize(
  hardwareConcurrency: number = typeof navigator === "undefined" ? 1 : navigator.hardwareConcurrency,
  forced: string | undefined = typeof process === "undefined" ? undefined : process.env.NEXT_PUBLIC_REVIEW_POOL_SIZE,
): number {
  const override = forced ? Math.floor(Number(forced)) : Number.NaN;
  if (Number.isFinite(override) && override >= 1) {
    return Math.min(MAX_FORCED_WORKERS, override);
  }
  const cores = Number.isFinite(hardwareConcurrency) && hardwareConcurrency >= 1 ? Math.floor(hardwareConcurrency) : 1;
  return Math.min(MAX_REVIEW_WORKERS, Math.max(1, cores - 1));
}

export type ReviewPoolClient = SearchClient & { dispose: () => void };

export type ReviewPoolOptions = {
  /** Number of workers (clamped to at least 1). */
  size: number;
  isCancelled?: () => boolean;
  /** Worker factory; defaults to the lite single-thread Stockfish. Tests inject fakes. */
  createClient?: () => ReviewPoolClient;
};

type Slot = {
  client: ReviewPoolClient;
  engine: SearchEngine;
  busy: boolean;
  dead: boolean;
  /** The next search on this worker must clear its hash (it took over another worker's lane). */
  needsFresh: boolean;
  /** Callers pinned to this worker, waiting for it to be free (FIFO). */
  waiters: Array<() => void>;
};

function createReviewClient(): ReviewPoolClient {
  return new StockfishEngine("lite", { workerUrl: REVIEW_WORKER_URL });
}

export class ReviewEnginePool implements ReviewEngine {
  readonly concurrency: number;
  private readonly createClient: () => ReviewPoolClient;
  private readonly isCancelled: () => boolean;
  private readonly slots: Slot[] = [];
  /** Worker bound to each lane (see `AnalyzeOptions.lane`). */
  private readonly laneSlots = new Map<number, Slot>();
  /** Unpinned callers waiting for any free worker, FIFO. */
  private readonly waiters: Array<(slot: Slot | null) => void> = [];
  private disposed = false;

  constructor(options: ReviewPoolOptions) {
    this.concurrency = Math.max(1, Math.floor(options.size));
    this.createClient = options.createClient ?? createReviewClient;
    this.isCancelled = options.isCancelled ?? (() => false);
  }

  /** Live workers (they are spawned on demand, up to `concurrency`). */
  get workerCount(): number {
    return this.slots.filter((slot) => !slot.dead).length;
  }

  /**
   * Unpinned searches take any free worker. Searches with a `lane` always run on
   * that lane's worker, one at a time and in call order, so the worker's hash
   * stays warm across the lane's positions. If a lane's worker dies for good, the
   * lane moves to the least-loaded survivor, whose hash is cleared before its next
   * search, and the interrupted position is re-run there: recovery runs can differ
   * slightly from a healthy run (a different hash history), but never lose a position.
   */
  async analyze(fen: string, options: AnalyzeOptions): Promise<PositionEval | null> {
    while (!this.disposed) {
      const slot = options.lane === undefined ? await this.checkout() : await this.checkoutLane(options.lane);
      if (!slot) {
        return null;
      }
      const fresh = options.fresh || slot.needsFresh;
      slot.needsFresh = false;
      const result = await slot.engine.analyze(fen, { ...options, fresh });
      if (slot.dead) {
        // The worker died mid-search: the null above says nothing about the
        // position, so run it again on a surviving worker (hash cleared).
        this.retire(slot);
        continue;
      }
      this.checkin(slot);
      return result;
    }
    return null;
  }

  /** Terminates every worker and resolves everything in flight with null. Idempotent. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const slot of this.slots) {
      slot.engine.abort();
      slot.client.dispose();
      for (const wake of slot.waiters.splice(0)) {
        wake();
      }
    }
    this.slots.length = 0;
    this.laneSlots.clear();
    for (const waiter of this.waiters.splice(0)) {
      waiter(null);
    }
  }

  private checkout(): Promise<Slot | null> {
    if (this.disposed) {
      return Promise.resolve(null);
    }
    const idle = this.slots.find((slot) => !slot.busy && !slot.dead);
    if (idle) {
      idle.busy = true;
      return Promise.resolve(idle);
    }
    if (this.slots.length < this.concurrency) {
      const slot = this.spawn();
      slot.busy = true;
      return Promise.resolve(slot);
    }
    if (this.slots.every((slot) => slot.dead)) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private async checkoutLane(lane: number): Promise<Slot | null> {
    for (;;) {
      if (this.disposed) {
        return null;
      }
      let slot: Slot | null | undefined = this.laneSlots.get(lane);
      if (!slot || slot.dead) {
        const moved = slot !== undefined;
        slot = this.bindLane(lane);
        if (!slot) {
          return null;
        }
        if (moved) {
          slot.needsFresh = true;
        }
      }
      if (!slot.busy) {
        slot.busy = true;
        return slot;
      }
      // Pinned to a busy worker (two lanes share it after a failure): wait our turn.
      await new Promise<void>((resolve) => slot.waiters.push(resolve));
    }
  }

  private bindLane(lane: number): Slot | null {
    let slot: Slot | undefined;
    if (this.slots.length < this.concurrency) {
      slot = this.spawn();
    } else {
      const load = (candidate: Slot) => [...this.laneSlots.values()].filter((bound) => bound === candidate).length;
      slot = this.slots.filter((candidate) => !candidate.dead).sort((x, y) => load(x) - load(y))[0];
    }
    if (!slot) {
      return null;
    }
    this.laneSlots.set(lane, slot);
    return slot;
  }

  private checkin(slot: Slot): void {
    const pinned = slot.waiters.shift();
    if (pinned) {
      // Stays busy: the pinned waiter takes the worker over.
      slot.busy = false;
      pinned();
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(slot);
      return;
    }
    slot.busy = false;
  }

  private retire(slot: Slot): void {
    slot.busy = false;
    slot.client.dispose();
    for (const wake of slot.waiters.splice(0)) {
      wake();
    }
    if (this.slots.every((other) => other.dead) && this.slots.length >= this.concurrency) {
      // Nobody is left to serve the queue.
      for (const waiter of this.waiters.splice(0)) {
        waiter(null);
      }
    }
  }

  private spawn(): Slot {
    const client = this.createClient();
    const slot: Slot = {
      client,
      engine: createSearchEngine(client, 1, () => this.disposed || this.isCancelled()),
      busy: false,
      dead: false,
      needsFresh: false,
      waiters: [],
    };
    // A permanent failure (the client's second consecutive worker error) is
    // sticky; the search adapter already resolves null on it.
    client.subscribe((info: EngineInfo) => {
      if (info.failed) {
        slot.dead = true;
      }
    });
    this.slots.push(slot);
    return slot;
  }
}

export function createReviewPool(options: ReviewPoolOptions): ReviewEnginePool {
  return new ReviewEnginePool(options);
}
