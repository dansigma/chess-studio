// SIG-1289: connection manager of Live. Framework-free; `fetch`, timers and the visibility source are
// injected so it runs under test without a browser.
//
// REQUEST RULES (Lichess: one request at a time per client; wait a full minute after HTTP 429)
//
//  1. Every non-stream request goes through ONE serial FIFO queue (`enqueue`): at most one is in
//     flight; the next starts only after the previous settles. This covers the round snapshots (polling
//     and snapshot-before-stream) and whatever Live 4/7 (list refresh) and 6/7 (`fetchRoundPgn`) enqueue.
//  2. There is at most ONE open stream per tab. It does not hold the queue: the queue keeps running
//     while the stream is open.
//  3. An HTTP 429 from the queue or from the stream blocks the queue AND the stream (re)opens for
//     `retryAfterMs` (60 s). The request that got the 429 is rejected with the error (callers decide
//     whether to retry); queued requests wait for the block to end, then continue in order.
//  4. The stream is aborted with its AbortController; it is the only way to close it.
import { LiveHttpError, RATE_LIMIT_BACKOFF_MS } from "./lichess-broadcast";
import type { BroadcastRoundSnapshot, LiveGameUpdate, LiveResult } from "./types";

export const POLL_INTERVAL_MS = 15_000;
/** Reconnect delays after the stream ends or fails; the last one repeats. Reset by a successful update. */
export const STREAM_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000] as const;
/** A stream that is open this long without an error counts as live even if the round is quiet. */
export const STREAM_OPEN_GRACE_MS = 3_000;

export type LiveConnection = "idle" | "connecting" | "live" | "polling" | "paused" | "rate-limited" | "error";

export type ManagerStatus = { connection: LiveConnection; rateLimitedUntil: number | null };

export type VisibilitySource = {
  isHidden(): boolean;
  /** Calls `listener` on every change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
};

export type BroadcastManagerDeps = {
  fetchRound(roundId: string, signal: AbortSignal): Promise<BroadcastRoundSnapshot | null>;
  streamRound(roundId: string, onGame: (update: LiveGameUpdate) => void, signal: AbortSignal): Promise<void>;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
  visibility: VisibilitySource;
};

export type BroadcastManagerHandlers = {
  onSnapshot(snapshot: BroadcastRoundSnapshot): void;
  onUpdate(update: LiveGameUpdate): void;
  onStatus(status: ManagerStatus): void;
};

export type RoundTargets = {
  /** Rounds to keep fresh: the one open in the table + the rounds of open boards. */
  hotRounds: readonly string[];
  /** The single round to stream (added to the hot set if missing); null streams nothing. */
  streamRound: string | null;
};

export type EnqueueOptions = { signal?: AbortSignal };

export type BroadcastManager = {
  /** Declare what to follow. Idempotent; call it after every change of the hot set. */
  sync(targets: RoundTargets): void;
  /** Serial request queue, see the rules at the top of this file. Rejects with an AbortError on abort. */
  enqueue<T>(request: (signal: AbortSignal) => Promise<T>, options?: EnqueueOptions): Promise<T>;
  getStatus(): ManagerStatus;
  /** Leave Live: aborts the stream and every queued or in-flight request, clears the targets. */
  stop(): void;
  /** `stop()` and detach from the visibility source. */
  dispose(): void;
};

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function rateLimitMs(error: unknown): number | null {
  if (error instanceof LiveHttpError && error.status === 429) {
    const ms = (error as { retryAfterMs?: unknown }).retryAfterMs;
    return typeof ms === "number" ? ms : RATE_LIMIT_BACKOFF_MS;
  }
  return null;
}

export function browserVisibility(): VisibilitySource {
  return {
    isHidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
    subscribe: (listener) => {
      if (typeof document === "undefined") {
        return () => undefined;
      }
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}

type Job = {
  run(): Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
};

type StreamState = { roundId: string; controller: AbortController; phase: "connecting" | "live" | "error" };

export function createBroadcastManager(deps: BroadcastManagerDeps, handlers: BroadcastManagerHandlers): BroadcastManager {
  // ---- queue ----
  const queue: Job[] = [];
  let running = false;
  let blockedUntil = 0;
  let blockTimer: unknown = null;
  let lifecycle = new AbortController();

  // ---- targets / rounds ----
  let hot = new Set<string>();
  let streamTarget: string | null = null;
  const finished = new Set<string>();
  const hasSnapshot = new Set<string>();
  const lastFetched = new Map<string, number>();
  const results = new Map<string, Map<string, LiveResult>>();
  const roundFlaggedFinished = new Set<string>();

  // ---- stream / polling ----
  let stream: StreamState | null = null;
  let failures = 0;
  const pollDue = new Map<string, number>();
  let pollTimer: unknown = null;
  let pollInFlight = false;
  let hidden = deps.visibility.isHidden();

  let lastStatus: ManagerStatus | null = null;

  function isBlocked(): boolean {
    return deps.now() < blockedUntil;
  }

  function computeStatus(): ManagerStatus {
    const rateLimitedUntil = isBlocked() ? blockedUntil : null;
    let connection: LiveConnection;
    if (hot.size === 0) {
      connection = "idle";
    } else if (hidden) {
      connection = "paused";
    } else if (rateLimitedUntil !== null) {
      connection = "rate-limited";
    } else if (stream) {
      connection = stream.phase;
    } else if ([...hot].some((r) => !finished.has(r))) {
      connection = "polling";
    } else {
      connection = "idle";
    }
    return { connection, rateLimitedUntil };
  }

  function emitStatus(): void {
    const next = computeStatus();
    if (!lastStatus || lastStatus.connection !== next.connection || lastStatus.rateLimitedUntil !== next.rateLimitedUntil) {
      lastStatus = next;
      handlers.onStatus(next);
    }
  }

  function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const onAbort = () => {
        deps.clearTimeout(handle);
        resolve();
      };
      const handle = deps.setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  async function waitUnblocked(signal: AbortSignal): Promise<void> {
    while (!signal.aborted && isBlocked()) {
      await sleep(blockedUntil - deps.now(), signal);
    }
  }

  // ---- queue ----
  function markRateLimited(ms: number): void {
    blockedUntil = Math.max(blockedUntil, deps.now() + ms);
    if (blockTimer !== null) {
      deps.clearTimeout(blockTimer);
    }
    blockTimer = deps.setTimeout(() => {
      blockTimer = null;
      emitStatus();
      pump();
    }, blockedUntil - deps.now());
    emitStatus();
  }

  function pump(): void {
    if (running || queue.length === 0 || isBlocked()) {
      return; // when blocked, `blockTimer` pumps again at the end of the block
    }
    const job = queue.shift() as Job;
    running = true;
    job
      .run()
      .then(job.resolve, (error: unknown) => {
        const ms = rateLimitMs(error);
        if (ms !== null) {
          markRateLimited(ms);
        }
        job.reject(error);
      })
      .finally(() => {
        running = false;
        pump();
      });
  }

  function enqueue<T>(request: (signal: AbortSignal) => Promise<T>, options: EnqueueOptions = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      const sources = [lifecycle.signal, options.signal].filter((s): s is AbortSignal => s !== undefined);
      const detach: Array<() => void> = [];
      const job: Job = {
        run: () => request(controller.signal).finally(() => detach.forEach((d) => d())),
        resolve: resolve as (value: unknown) => void,
        reject,
      };
      const onAbort = () => {
        controller.abort();
        const index = queue.indexOf(job);
        if (index >= 0) {
          queue.splice(index, 1);
          detach.forEach((d) => d());
          reject(abortError());
        }
      };
      for (const source of sources) {
        if (source.aborted) {
          detach.forEach((d) => d());
          reject(abortError());
          return;
        }
        source.addEventListener("abort", onAbort, { once: true });
        detach.push(() => source.removeEventListener("abort", onAbort));
      }
      queue.push(job);
      pump();
    });
  }

  // ---- rounds ----
  function roundIsDone(roundId: string): boolean {
    if (roundFlaggedFinished.has(roundId)) {
      return true;
    }
    const games = results.get(roundId);
    return games !== undefined && games.size > 0 && [...games.values()].every((r) => r !== "*");
  }

  function checkFinished(roundId: string): void {
    if (hot.has(roundId) && !finished.has(roundId) && roundIsDone(roundId)) {
      finished.add(roundId);
      reconcile();
    }
  }

  function applySnapshot(snapshot: BroadcastRoundSnapshot): void {
    const roundId = snapshot.round.id;
    if (!hot.has(roundId)) {
      return;
    }
    hasSnapshot.add(roundId);
    lastFetched.set(roundId, deps.now());
    const games = results.get(roundId) ?? new Map<string, LiveResult>();
    for (const game of snapshot.games) {
      games.set(game.id, game.result);
    }
    results.set(roundId, games);
    if (snapshot.round.finished) {
      roundFlaggedFinished.add(roundId);
    }
    handlers.onSnapshot(snapshot);
    checkFinished(roundId);
  }

  function applyUpdate(update: LiveGameUpdate): void {
    if (!hot.has(update.roundId)) {
      return;
    }
    failures = 0;
    lastFetched.set(update.roundId, deps.now());
    const games = results.get(update.roundId) ?? new Map<string, LiveResult>();
    games.set(update.id, update.result);
    results.set(update.roundId, games);
    if (stream && stream.roundId === update.roundId) {
      stream.phase = "live";
    }
    handlers.onUpdate(update);
    emitStatus();
    checkFinished(update.roundId);
  }

  // ---- stream ----
  function closeStream(): void {
    if (stream) {
      stream.controller.abort();
      stream = null;
    }
  }

  async function runStream(state: StreamState): Promise<void> {
    const { signal } = state.controller;
    const { roundId } = state;
    while (!signal.aborted) {
      try {
        await waitUnblocked(signal);
        if (signal.aborted) {
          return;
        }
        // Snapshot first: it is the only source of `fed` and `thinkTime`. It goes through the queue, so it
        // never runs in parallel with a poll. A round already snapshotted (polled before, or this is a
        // reconnect after a hidden tab) skips it: the stream's first burst re-sends every game anyway.
        if (!hasSnapshot.has(roundId)) {
          state.phase = "connecting";
          emitStatus();
          const snapshot = await enqueue((s) => deps.fetchRound(roundId, s), { signal });
          if (signal.aborted) {
            return;
          }
          if (snapshot) {
            applySnapshot(snapshot);
          }
          if (signal.aborted) {
            return; // the round turned out to be finished: reconcile closed this stream
          }
        }
        state.phase = "connecting";
        emitStatus();
        const grace = deps.setTimeout(() => {
          if (!signal.aborted && stream === state && state.phase === "connecting") {
            state.phase = "live";
            emitStatus();
          }
        }, STREAM_OPEN_GRACE_MS);
        signal.addEventListener("abort", () => deps.clearTimeout(grace), { once: true });
        try {
          await deps.streamRound(roundId, (update) => (signal.aborted ? undefined : applyUpdate(update)), signal);
        } finally {
          deps.clearTimeout(grace);
        }
        if (signal.aborted) {
          return;
        }
        // The server closed the stream: reconnect with backoff.
        throw new Error("Lichess stream ended");
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          return;
        }
        const ms = rateLimitMs(error);
        if (ms !== null) {
          markRateLimited(ms);
          continue;
        }
        const delay = STREAM_BACKOFF_MS[Math.min(failures, STREAM_BACKOFF_MS.length - 1)];
        failures += 1;
        state.phase = "error";
        emitStatus();
        await sleep(delay, signal);
      }
    }
  }

  function openStream(roundId: string): void {
    const state: StreamState = { roundId, controller: new AbortController(), phase: "connecting" };
    stream = state;
    void runStream(state);
  }

  // ---- polling ----
  function clearPollTimer(): void {
    if (pollTimer !== null) {
      deps.clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function schedulePoll(): void {
    clearPollTimer();
    if (hidden || pollInFlight || pollDue.size === 0) {
      return;
    }
    const next = Math.min(...pollDue.values());
    pollTimer = deps.setTimeout(() => {
      pollTimer = null;
      void runPoll();
    }, Math.max(0, next - deps.now()));
  }

  async function runPoll(): Promise<void> {
    if (hidden || pollInFlight) {
      return;
    }
    const now = deps.now();
    let pick: string | null = null;
    let best = Infinity;
    for (const [roundId, due] of pollDue) {
      if (due <= now && due < best) {
        pick = roundId;
        best = due;
      }
    }
    if (pick === null) {
      schedulePoll();
      return;
    }
    const roundId = pick;
    pollInFlight = true;
    try {
      const snapshot = await enqueue((s) => deps.fetchRound(roundId, s));
      if (snapshot && !hidden) {
        applySnapshot(snapshot);
      }
    } catch {
      // 429 blocks the queue (status updated); any other error: try again next interval.
    } finally {
      pollInFlight = false;
      if (pollDue.has(roundId)) {
        pollDue.set(roundId, Math.max(deps.now() + POLL_INTERVAL_MS, blockedUntil));
      }
      schedulePoll();
      emitStatus();
    }
  }

  // ---- reconcile ----
  function reconcile(): void {
    if (hidden || hot.size === 0) {
      closeStream();
      clearPollTimer();
      emitStatus();
      return;
    }
    const desired = streamTarget !== null && !finished.has(streamTarget) ? streamTarget : null;
    if (stream && stream.roundId !== desired) {
      closeStream();
    }
    if (!stream && desired !== null) {
      openStream(desired);
    }
    const polled = new Set([...hot].filter((r) => r !== desired && !finished.has(r)));
    for (const roundId of [...pollDue.keys()]) {
      if (!polled.has(roundId)) {
        pollDue.delete(roundId);
      }
    }
    for (const roundId of polled) {
      if (!pollDue.has(roundId)) {
        // A round just demoted from the stream is fresh: wait one interval before polling it.
        pollDue.set(roundId, Math.max(deps.now(), (lastFetched.get(roundId) ?? -Infinity) + POLL_INTERVAL_MS));
      }
    }
    schedulePoll();
    emitStatus();
  }

  function sync(targets: RoundTargets): void {
    const next = new Set(targets.hotRounds);
    if (targets.streamRound !== null) {
      next.add(targets.streamRound);
    }
    for (const roundId of hot) {
      if (!next.has(roundId)) {
        finished.delete(roundId);
        hasSnapshot.delete(roundId);
        lastFetched.delete(roundId);
        results.delete(roundId);
        roundFlaggedFinished.delete(roundId);
      }
    }
    hot = next;
    streamTarget = targets.streamRound;
    reconcile();
  }

  const unsubscribe = deps.visibility.subscribe(() => {
    const nowHidden = deps.visibility.isHidden();
    if (nowHidden === hidden) {
      return;
    }
    hidden = nowHidden;
    if (!hidden) {
      // Visible again: polled rounds refresh now (through the queue); the streamed round reopens and its
      // first burst re-sends every game, so no extra snapshot is requested for it.
      failures = 0;
      for (const roundId of pollDue.keys()) {
        pollDue.set(roundId, deps.now());
      }
    }
    reconcile();
  });

  function stop(): void {
    closeStream();
    clearPollTimer();
    hot = new Set();
    streamTarget = null;
    finished.clear();
    hasSnapshot.clear();
    lastFetched.clear();
    results.clear();
    roundFlaggedFinished.clear();
    pollDue.clear();
    failures = 0;
    const old = lifecycle;
    lifecycle = new AbortController();
    old.abort();
    emitStatus();
  }

  return {
    sync,
    enqueue,
    getStatus: computeStatus,
    stop,
    dispose() {
      stop();
      unsubscribe();
      if (blockTimer !== null) {
        deps.clearTimeout(blockTimer);
        blockTimer = null;
      }
    },
  };
}
