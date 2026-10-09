// Shared Stockfish engine service (SIG-888).
//
// The three dock panels (EnginePanel, EvalGraphPanel, ReviewPanel) previously
// each owned a `StockfishEngine` worker (~99MB on the standard build). This
// module owns one resident worker for the active build and arbitrates access
// by slot priority: review (3) > engine (2) > graph (1).
//
// The underlying client is a single-search state machine, so sharing means
// one active search at a time. A higher-priority `analyze` preempts via the
// client's own stop+isready barrier (the SIG-850 path, reused verbatim); a
// lower-priority `analyze` is stored and forwarded once the active slot stops
// or releases. A preempted slot's last params are stashed so it resumes where
// it left off after promotion. Lease `subscribe` wrappers only deliver
// snapshots while their slot is active (or while no slot is active), so
// panels never render another slot's search — they also guard on `info.fen`
// (the SIG-851 path).
//
// `StockfishEngine` itself is consumed as-is and left untouched.
//
// Natural completion is detected by a service-owned tap subscription on the
// underlying client (attached in `ensureUnderlying`, cleared by `dispose`).
// When the active search finishes on its own (`running` false) with waiters
// queued, the tap schedules promotion on a microtask. The deferral matters:
// the completion emit is still being delivered to lease wrappers, so
// promoting synchronously would retarget `activeSlot` before the owner sees
// its own completion snapshot (Review/Graph treat `!running` as finish).
// The microtask re-validates live state and aborts if another slot took over
// meanwhile (captured-slot guard).

import {
  StockfishEngine,
  type EngineBuild,
  type EngineInfo,
} from "./stockfish-client";

export type EngineSlot = "engine" | "graph" | "review";

export type EngineSlotListener = (info: EngineInfo) => void;

const SLOT_PRIORITY: Record<EngineSlot, number> = {
  review: 3,
  engine: 2,
  graph: 1,
};

export type SharedEngineLease = {
  readonly slot: EngineSlot;
  readonly build: EngineBuild;
  subscribe: (listener: EngineSlotListener) => () => void;
  analyze: (
    fen: string,
    depth: number,
    multiPv: number,
    threads: number,
    searchMoves?: string,
    fresh?: boolean,
  ) => void;
  stop: () => void;
  release: () => void;
};

type AnalyzeParams = {
  fen: string;
  depth: number;
  multiPv: number;
  threads: number;
  searchMoves?: string;
  fresh: boolean;
};

let underlying: StockfishEngine | null = null;
let currentBuild: EngineBuild | null = null;
let activeSlot: EngineSlot | null = null;
const pendingBySlot = new Map<EngineSlot, AnalyzeParams>();
const lastParamsBySlot = new Map<EngineSlot, AnalyzeParams>();
const liveLeases = new Set<LeaseImpl>();
let tapUnsubscribe: (() => void) | null = null;

/** Schedule promotion when the active search completes on its own. */
function maybeAutoPromoteOnCompletion(): void {
  if (!underlying || activeSlot === null || pendingBySlot.size === 0) {
    return;
  }
  const owner = activeSlot;
  void Promise.resolve().then(() => {
    if (!underlying || activeSlot !== owner || pendingBySlot.size === 0) {
      return;
    }
    activeSlot = null;
    promote();
  });
}

function ensureUnderlying(build: EngineBuild): StockfishEngine {
  if (currentBuild !== build) {
    tapUnsubscribe?.();
    tapUnsubscribe = null;
    underlying?.dispose();
    underlying = null;
    currentBuild = build;
    activeSlot = null;
    pendingBySlot.clear();
    lastParamsBySlot.clear();
  }
  if (!underlying) {
    underlying = new StockfishEngine(build);
    // Service tap: runs before any lease wrapper's listener (attached first),
    // never delivers to panels, only detects natural completion.
    tapUnsubscribe = underlying.subscribe((snapshot) => {
      if (!snapshot.running && snapshot.ready && !snapshot.failed) {
        maybeAutoPromoteOnCompletion();
      }
    });
  }
  return underlying;
}

function forward(slot: EngineSlot, params: AnalyzeParams): void {
  if (!underlying) {
    return;
  }
  pendingBySlot.delete(slot);
  activeSlot = slot;
  underlying.analyze(
    params.fen,
    params.depth,
    params.multiPv,
    params.threads,
    params.searchMoves,
    params.fresh,
  );
}

function promote(): void {
  if (!underlying || activeSlot !== null) {
    return;
  }
  let best: EngineSlot | null = null;
  for (const slot of pendingBySlot.keys()) {
    if (best === null || SLOT_PRIORITY[slot] > SLOT_PRIORITY[best]) {
      best = slot;
    }
  }
  if (best === null) {
    return;
  }
  const params = pendingBySlot.get(best);
  if (!params) {
    return;
  }
  forward(best, params);
}

class LeaseImpl implements SharedEngineLease {
  readonly slot: EngineSlot;
  readonly build: EngineBuild;
  private released = false;
  private unsubscribes = new Set<() => void>();

  constructor(slot: EngineSlot, build: EngineBuild) {
    this.slot = slot;
    this.build = build;
  }

  private get live(): boolean {
    return !this.released && this.build === currentBuild && underlying !== null;
  }

  subscribe = (listener: EngineSlotListener): (() => void) => {
    if (!this.live || !underlying) {
      return () => undefined;
    }
    const unsub = underlying.subscribe((snapshot) => {
      if (this.released) {
        return;
      }
      if (activeSlot !== null && activeSlot !== this.slot) {
        return;
      }
      listener(snapshot);
    });
    this.unsubscribes.add(unsub);
    return () => {
      unsub();
      this.unsubscribes.delete(unsub);
    };
  };

  analyze = (
    fen: string,
    depth: number,
    multiPv: number,
    threads: number,
    searchMoves?: string,
    fresh = true,
  ): void => {
    if (!this.live || !underlying) {
      return;
    }
    const params: AnalyzeParams = { fen, depth, multiPv, threads, searchMoves, fresh };
    lastParamsBySlot.set(this.slot, params);
    if (
      activeSlot === null ||
      activeSlot === this.slot ||
      SLOT_PRIORITY[this.slot] >= SLOT_PRIORITY[activeSlot]
    ) {
      // Preemption: stash the victim's last params so it resumes on promotion.
      if (activeSlot !== null && activeSlot !== this.slot) {
        const victim = lastParamsBySlot.get(activeSlot);
        if (victim) {
          pendingBySlot.set(activeSlot, victim);
        }
      }
      forward(this.slot, params);
      return;
    }
    pendingBySlot.set(this.slot, params);
  };

  stop = (): void => {
    if (!this.live || !underlying) {
      return;
    }
    // A stop means "I don't want the engine" — never stash for resume.
    lastParamsBySlot.delete(this.slot);
    pendingBySlot.delete(this.slot);
    if (activeSlot === this.slot) {
      // Clear first: stopSearch() emits synchronously (running false), and
      // the wrapper may promote a waiter during that emit. Clearing first
      // keeps the promotion instead of clobbering it.
      activeSlot = null;
      underlying.stopSearch();
      promote();
    }
  };

  release = (): void => {
    if (this.released) {
      return;
    }
    this.released = true;
    liveLeases.delete(this);
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes.clear();
    pendingBySlot.delete(this.slot);
    lastParamsBySlot.delete(this.slot);
    if (activeSlot === this.slot) {
      // Same reentrancy note as stop(): release() unsubscribes its own
      // wrapper first, but other slots' wrappers are still attached during
      // the synchronous stopSearch() emit — they may promote a waiter.
      // Stop the orphaned search so the worker doesn't burn CPU on a result
      // nobody owns; a waiter (if any) is promoted right after.
      activeSlot = null;
      underlying?.stopSearch();
      promote();
    }
    if (liveLeases.size === 0) {
      tapUnsubscribe?.();
      tapUnsubscribe = null;
      underlying?.dispose();
      underlying = null;
      currentBuild = null;
      activeSlot = null;
      pendingBySlot.clear();
      lastParamsBySlot.clear();
    }
  };
}

export function acquire(slot: EngineSlot, build: EngineBuild): SharedEngineLease {
  ensureUnderlying(build);
  const lease = new LeaseImpl(slot, build);
  liveLeases.add(lease);
  return lease;
}

/** Test-only: tear down all module state between cases. */
export function resetSharedEngineForTests(): void {
  tapUnsubscribe?.();
  tapUnsubscribe = null;
  underlying?.dispose();
  underlying = null;
  currentBuild = null;
  activeSlot = null;
  pendingBySlot.clear();
  lastParamsBySlot.clear();
  liveLeases.clear();
}
