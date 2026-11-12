import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  POLL_INTERVAL_MS,
  STREAM_BACKOFF_MS,
  createBroadcastManager,
  type BroadcastManagerDeps,
  type ManagerStatus,
} from "./broadcast-manager.ts";
import { LiveHttpError, LiveRateLimitedError } from "./lichess-broadcast.ts";
import type { BroadcastRoundSnapshot, LiveGame, LiveGameUpdate, LiveResult } from "./types.ts";

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setImmediate(r));
  }
};

function game(id: string, roundId: string, result: LiveResult = "*"): LiveGame {
  const p = { name: "P", title: null, rating: null, fed: null, fideId: null, clockMs: null };
  return { id, roundId, white: p, black: p, fen: "x w - - 0 1", lastMoveUci: null, result, thinkTimeSec: null, pgn: null, updatedAt: 0 };
}

function snap(roundId: string, games: LiveGame[], finished = false): BroadcastRoundSnapshot {
  return {
    tour: { id: "t", slug: "t", name: "t", format: null, timeControl: null, location: null, imageUrl: null, tier: null, dates: null, url: "" },
    round: { id: roundId, slug: "r", name: "r", ongoing: !finished, finished, startsAt: null, url: "" },
    games,
    group: null,
    defaultRoundId: null,
  };
}

function update(id: string, roundId: string, result: LiveResult = "*"): LiveGameUpdate {
  const p = { name: "P", title: null, rating: null, fideId: null };
  return { id, roundId, pgn: `pgn-${id}-${result}`, fen: "x w - - 0 1", lastMoveUci: null, result, white: p, black: p, whiteClockMs: null, blackClockMs: null };
}

type Pending<T> = { resolve(v: T): void; reject(e: unknown): void };

function harness() {
  let now = 1_000_000;
  let nextId = 1;
  const timers = new Map<number, { at: number; cb: () => void }>();
  let hidden = false;
  const visListeners = new Set<() => void>();
  let inFlight = 0;
  let maxInFlight = 0;
  const fetches: Array<{ roundId: string } & Pending<BroadcastRoundSnapshot | null>> = [];
  const fetchLog: string[] = [];
  const streams: Array<{
    roundId: string;
    signal: AbortSignal;
    onGame: (u: LiveGameUpdate) => void;
    end(): void;
    fail(e: unknown): void;
  }> = [];
  const snapshots: BroadcastRoundSnapshot[] = [];
  const updates: LiveGameUpdate[] = [];
  const statuses: ManagerStatus[] = [];
  let autoFetch = true;

  const deps: BroadcastManagerDeps = {
    fetchRound: (roundId, signal) => {
      fetchLog.push(roundId);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve, reject) => {
        const done = <T,>(f: (v: T) => void) => (v: T) => {
          inFlight--;
          f(v);
        };
        const entry = { roundId, resolve: done(resolve), reject: done(reject) };
        signal.addEventListener("abort", () => entry.resolve(null), { once: true });
        if (autoFetch) {
          entry.resolve(snap(roundId, [game("g1", roundId)]));
        } else {
          fetches.push(entry);
        }
      });
    },
    streamRound: (roundId, onGame, signal) =>
      new Promise<void>((resolve, reject) => {
        const entry = { roundId, signal, onGame, end: () => resolve(), fail: (e: unknown) => reject(e) };
        signal.addEventListener("abort", () => resolve(), { once: true });
        streams.push(entry);
      }),
    setTimeout: (cb, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, cb });
      return id;
    },
    clearTimeout: (h) => void timers.delete(h as number),
    now: () => now,
    visibility: {
      isHidden: () => hidden,
      subscribe: (l) => {
        visListeners.add(l);
        return () => visListeners.delete(l);
      },
    },
  };
  const manager = createBroadcastManager(deps, {
    onSnapshot: (s) => snapshots.push(s),
    onUpdate: (u) => updates.push(u),
    onStatus: (s) => statuses.push(s),
  });

  async function advance(ms: number) {
    const end = now + ms;
    await flush();
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) {
        break;
      }
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].cb();
      await flush();
    }
    now = end;
    await flush();
  }

  return {
    manager,
    deps,
    snapshots,
    updates,
    statuses,
    streams,
    fetches,
    fetchLog,
    advance,
    flush,
    setAutoFetch: (v: boolean) => (autoFetch = v),
    get maxInFlight() {
      return maxInFlight;
    },
    get now() {
      return now;
    },
    get status() {
      return manager.getStatus();
    },
    setHidden(v: boolean) {
      hidden = v;
      visListeners.forEach((l) => l());
    },
    openStreams: () => streams.filter((s) => !s.signal.aborted),
  };
}

describe("broadcast manager", () => {
  it("opens a single stream when several boards share a round, after the snapshot", async () => {
    const h = harness();
    h.manager.sync({ hotRounds: ["r1", "r1"], streamRound: "r1" });
    await h.flush();
    assert.deepEqual(h.fetchLog, ["r1"]);
    assert.equal(h.snapshots.length, 1);
    assert.equal(h.streams.length, 1);
    h.manager.sync({ hotRounds: ["r1"], streamRound: "r1" }); // idempotent
    await h.advance(1);
    assert.equal(h.streams.length, 1);
    h.streams[0].onGame(update("g1", "r1"));
    assert.equal(h.status.connection, "live");
    assert.equal(h.updates.length, 1);
  });

  it("focus switch aborts the stream, moves the old round to polling and opens the new stream", async () => {
    const h = harness();
    h.manager.sync({ hotRounds: ["r1", "r2"], streamRound: "r1" });
    await h.flush();
    h.manager.sync({ hotRounds: ["r1", "r2"], streamRound: "r2" });
    await h.flush();
    assert.equal(h.streams[0].signal.aborted, true);
    assert.deepEqual(h.openStreams().map((s) => s.roundId), ["r2"]);
    // r1 was fresh when demoted: polled after one interval, r2 snapshotted before its stream.
    assert.deepEqual(h.fetchLog, ["r1", "r2"]);
    await h.advance(POLL_INTERVAL_MS);
    assert.deepEqual(h.fetchLog, ["r1", "r2", "r1"]);
    assert.equal(h.openStreams().length, 1);
  });

  it("serializes polling and public requests: one in flight at a time, FIFO", async () => {
    const h = harness();
    h.setAutoFetch(false);
    h.manager.sync({ hotRounds: ["a", "b", "c"], streamRound: null });
    await h.flush();
    const order: string[] = [];
    const extra = h.manager.enqueue(async () => {
      order.push("extra");
      return 1;
    });
    await h.advance(0);
    assert.equal(h.fetches.length, 1, "only the first poll is in flight");
    assert.equal(h.maxInFlight, 1);
    h.fetches[0].resolve(snap("a", []));
    await h.flush();
    assert.deepEqual(order, ["extra"]);
    await extra;
    await h.advance(0);
    assert.equal(h.fetches.length, 2);
    assert.equal(h.maxInFlight, 1);
  });

  it("the open stream does not block the queue", async () => {
    const h = harness();
    h.manager.sync({ hotRounds: ["r1"], streamRound: "r1" });
    await h.flush();
    assert.equal(h.openStreams().length, 1);
    assert.equal(await h.manager.enqueue(async () => "ok"), "ok");
  });

  it("hidden tab aborts the stream and pauses polling; visible resumes without a stream snapshot", async () => {
    const h = harness();
    h.manager.sync({ hotRounds: ["r1", "r2"], streamRound: "r1" });
    await h.flush();
    const before = h.fetchLog.length;
    h.setHidden(true);
    await h.flush();
    assert.equal(h.status.connection, "paused");
    assert.equal(h.streams[0].signal.aborted, true);
    await h.advance(POLL_INTERVAL_MS * 4);
    assert.equal(h.fetchLog.length, before, "no polling while hidden");
    h.setHidden(false);
    await h.advance(0);
    assert.equal(h.streams.length, 2);
    assert.deepEqual(h.fetchLog.slice(before), ["r2"], "polled round refreshed, streamed round not re-snapshotted");
  });

  it("429 blocks every request for 60 s, then resumes", async () => {
    const h = harness();
    h.setAutoFetch(false);
    h.manager.sync({ hotRounds: ["a"], streamRound: null });
    await h.advance(0);
    h.fetches[0].reject(new LiveRateLimitedError("u"));
    await h.flush();
    assert.equal(h.status.connection, "rate-limited");
    assert.equal(h.status.rateLimitedUntil, h.now + 60_000);
    let ran = false;
    const queued = h.manager.enqueue(async () => {
      ran = true;
    });
    await h.advance(59_000);
    assert.equal(ran, false);
    assert.equal(h.fetches.length, 1);
    await h.advance(1_000);
    await queued;
    assert.equal(ran, true);
    assert.notEqual(h.status.connection, "rate-limited");
  });

  it("a 429 on the stream blocks stream reconnects and the queue", async () => {
    const h = harness();
    h.manager.sync({ hotRounds: ["r1"], streamRound: "r1" });
    await h.flush();
    h.streams[0].fail(new LiveRateLimitedError("u"));
    await h.flush();
    assert.equal(h.status.connection, "rate-limited");
    await h.advance(59_000);
    assert.equal(h.streams.length, 1);
    await h.advance(1_000);
    assert.equal(h.streams.length, 2);
  });

  it("reconnects with backoff 2s, 5s, 15s, 30s, 30s and resets after an update", async () => {
    const h = harness();
    h.manager.sync({ hotRounds: ["r1"], streamRound: "r1" });
    await h.flush();
    const expected = [...STREAM_BACKOFF_MS, 30_000];
    for (let i = 0; i < expected.length; i++) {
      const count = h.streams.length;
      h.streams[count - 1].fail(new LiveHttpError(503, "u"));
      await h.flush();
      assert.equal(h.status.connection, "error");
      await h.advance(expected[i] - 1);
      assert.equal(h.streams.length, count, `not before ${expected[i]}`);
      await h.advance(1);
      assert.equal(h.streams.length, count + 1, `reconnect after ${expected[i]}`);
    }
    h.streams[h.streams.length - 1].onGame(update("g1", "r1"));
    const count = h.streams.length;
    h.streams[count - 1].end();
    await h.flush();
    await h.advance(2_000);
    assert.equal(h.streams.length, count + 1, "reset to 2 s after a successful update");
  });

  it("a finished round closes the stream and stops polling", async () => {
    const h = harness();
    h.manager.sync({ hotRounds: ["r1", "r2"], streamRound: "r1" });
    await h.flush();
    h.streams[0].onGame(update("g1", "r1", "1-0")); // snapshot had only g1
    await h.flush();
    assert.equal(h.streams[0].signal.aborted, true);
    const fetches = h.fetchLog.filter((r) => r === "r1").length;
    await h.advance(POLL_INTERVAL_MS * 3);
    assert.equal(h.fetchLog.filter((r) => r === "r1").length, fetches);
    assert.equal(h.openStreams().length, 0);
  });

  it("a round whose snapshot says finished never opens a stream", async () => {
    const h = harness();
    h.setAutoFetch(false);
    h.manager.sync({ hotRounds: ["old"], streamRound: "old" });
    await h.flush();
    h.fetches[0].resolve(snap("old", [game("g1", "old", "1-0")], true));
    await h.flush();
    assert.equal(h.streams.length, 0);
    assert.equal(h.status.connection, "idle");
  });

  it("a round that is no longer hot is unfollowed", async () => {
    const h = harness();
    h.manager.sync({ hotRounds: ["a", "b"], streamRound: null });
    await h.flush();
    h.manager.sync({ hotRounds: ["a"], streamRound: null });
    h.fetchLog.length = 0;
    await h.advance(POLL_INTERVAL_MS * 2);
    assert.ok(h.fetchLog.length > 0 && h.fetchLog.every((r) => r === "a"));
  });

  it("stop aborts everything and rejects queued requests", async () => {
    const h = harness();
    h.setAutoFetch(false);
    h.manager.sync({ hotRounds: ["r1"], streamRound: "r1" });
    await h.flush();
    const queued = h.manager.enqueue(async () => 1);
    const rejected = assert.rejects(queued, { name: "AbortError" });
    h.manager.stop();
    await rejected;
    assert.equal(h.status.connection, "idle");
    assert.equal(h.openStreams().length, 0);
    await h.advance(POLL_INTERVAL_MS * 2);
    assert.equal(h.fetches.length, 1);
  });

  it("an aborted caller signal drops a queued request", async () => {
    const h = harness();
    let release!: () => void;
    const first = h.manager.enqueue(() => new Promise<void>((r) => (release = r)));
    const ctrl = new AbortController();
    const second = h.manager.enqueue(async () => "never", { signal: ctrl.signal });
    ctrl.abort();
    await assert.rejects(second, { name: "AbortError" });
    release();
    await first;
  });
});
