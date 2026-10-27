import { Chess } from "chess.js";

export const ENGINE_HASH_MB = 16;
export const ENGINE_BUILDS = ["lite", "standard"] as const;
export type EngineBuild = (typeof ENGINE_BUILDS)[number];

/** SIG-1081: delay before the single automatic retry after a worker error. */
export const ENGINE_RETRY_MS = 1000;

export const ENGINE_BUILD_INFO: Record<EngineBuild, { label: string; detail: string; size: string }> = {
  lite: { label: "Stockfish 19 lite", detail: "Small network", size: "1.6 MB" },
  standard: { label: "Stockfish 19", detail: "Full network", size: "99 MB" },
};

export function isEngineBuild(value: unknown): value is EngineBuild {
  return value === "lite" || value === "standard";
}

export function engineWorkerUrl(build: EngineBuild): string {
  const threaded = supportsEngineThreads();
  if (build === "standard") {
    return threaded ? "/engine/full/stockfish-19.js" : "/engine/stockfish-19-single.js";
  }
  return threaded ? "/engine/stockfish-lite.js" : "/engine/stockfish.js";
}

export const MIN_DEPTH = 8;
export const MAX_DEPTH = 40;
export const MIN_LINES = 1;
export const MAX_LINES = 5;

export type EngineLine = {
  multipv: number;
  depth: number;
  scoreCp: number | null;
  mate: number | null;
  pvUci: string[];
  pvSan: string[];
  bound: "upper" | "lower" | null;
};

export type EngineInfo = {
  depth: number;
  running: boolean;
  ready: boolean;
  failed: boolean;
  lines: EngineLine[];
  nps: number;
  nodes: number;
  threaded: boolean;
  fen: string;
};

type Listener = (info: EngineInfo) => void;

export function maxHardwareThreads(): number {
  if (typeof navigator === "undefined") {
    return 1;
  }
  return Math.max(1, navigator.hardwareConcurrency || 1);
}

export function supportsEngineThreads(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
  );
}

export function defaultEngineThreads(): number {
  if (!supportsEngineThreads()) {
    return 1;
  }
  return Math.min(4, maxHardwareThreads());
}

export function clampDepth(value: number): number {
  return Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, Math.round(value)));
}

export function clampLines(value: number): number {
  return Math.min(MAX_LINES, Math.max(MIN_LINES, Math.round(value)));
}

export function clampThreads(value: number): number {
  const max = supportsEngineThreads() ? maxHardwareThreads() : 1;
  return Math.min(max, Math.max(1, Math.round(value)));
}


function applyUci(chess: Chess, uci: string) {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  return chess.move({ from, to, promotion });
}

/** Test hook (SIG-1080): counts SAN resolutions via the emit-time cache. */
export let pvSanComputations = 0;

export function resetPvSanComputationsForTests(): void {
  pvSanComputations = 0;
}

function pvToSan(fen: string, pv: string[]): string[] {
  pvSanComputations += 1;
  const chess = new Chess(fen);
  const sans: string[] = [];
  for (const uci of pv) {
    try {
      sans.push(applyUci(chess, uci).san);
    } catch {
      break;
    }
  }
  return sans;
}

export function positionAfterPv(
  fen: string,
  pv: string[],
): { fen: string; lastMove: string } | null {
  if (pv.length === 0) {
    return null;
  }
  const chess = new Chess(fen);
  let lastMove = "";
  for (const uci of pv) {
    try {
      const move = applyUci(chess, uci);
      lastMove = `${move.from}${move.to}`;
    } catch {
      return null;
    }
  }
  return { fen: chess.fen(), lastMove };
}

function parseInfo(line: string): Omit<EngineLine, "pvSan"> | null {
  if (!line.startsWith("info ") || !line.includes(" pv ")) {
    return null;
  }
  const depthMatch = / depth (\d+)/.exec(line);
  const multiMatch = / multipv (\d+)/.exec(line);
  const mateMatch = / score mate (-?\d+)/.exec(line);
  const cpMatch = / score cp (-?\d+)/.exec(line);
  const pvMatch = / pv ([a-h1-8qrnbk]+(?: [a-h1-8qrnbk]+)*)/i.exec(line);
  if (!depthMatch || !pvMatch) {
    return null;
  }
  const boundMatch = / (upper|lower)bound/.exec(line);
  const pvUci = pvMatch[1].split(" ").filter(Boolean);
  return {
    multipv: multiMatch ? Number(multiMatch[1]) : 1,
    depth: Number(depthMatch[1]),
    scoreCp: cpMatch ? Number(cpMatch[1]) : null,
    mate: mateMatch ? Number(mateMatch[1]) : null,
    pvUci,
    bound: boundMatch ? (boundMatch[1] as "upper" | "lower") : null,
  };
}

export class StockfishEngine {
  private worker: Worker | null = null;
  readonly build: EngineBuild;
  private listeners = new Set<Listener>();
  private fen = "";
  private depthTarget = 22;
  private multiPv = 2;
  private threads = 1;
  private lines: Omit<EngineLine, "pvSan">[] = [];
  // SIG-1080: pvSan is resolved at emit time only for emitted lines, cached
  // per distinct (fen, pv) so an unchanged line is not recomputed.
  private depth = 0;
  private nps = 0;
  private nodes = 0;
  private running = false;
  private ready = false;
  private failed = false;
  private generation = 0;
  private searching = false;
  private pending: {
    gen: number;
    fen: string;
    depthTarget: number;
    multiPv: number;
    threads: number;
    searchMoves?: string;
    fresh: boolean;
  } | null = null;
  // SIG-1081: last requested search params. Once tryStart() consumes
  // `pending`, an in-flight search is only described by the scalar fields;
  // this record lets handleWorkerError() rebuild `pending` so the automatic
  // retry re-issues a search that was already running.
  private lastRequest: { searchMoves?: string; fresh: boolean } = { fresh: true };
  private pendingSent = false;
  private barrierTerminator = false;
  /**
   * `go` commands whose `bestmove` has not arrived yet. A stopped search still owes
   * its bestmove, so the next search must not start (ucinewgame/position/go) before
   * it: some engine builds answer `isready` while the old search is still winding
   * down, and a `ucinewgame` mid-search aborts the worker.
   */
  private outstandingSearches = 0;
  private readyokForCycle = false;
  private pvSanCache = new Map<string, string[]>();
  readonly threaded = supportsEngineThreads();
  // SIG-1081: one automatic retry after the first worker error. The retry
  // counter is reset by explicit user intent (start/analyze with a live
  // worker) and by restart(); a second consecutive error sets failed=true.
  // The pending search is preserved across the retry so it is re-issued.
  private errorCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(build: EngineBuild = "lite") {
    this.build = build;
  }

  private createWorker(): void {
    this.worker = new Worker(engineWorkerUrl(this.build));
    this.worker.onmessage = (event: MessageEvent<string>) => {
      this.handleMessage(String(event.data));
    };
    this.worker.onerror = () => {
      this.handleWorkerError();
    };
    this.send("uci");
  }

  private detachWorker(): void {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private handleWorkerError(): void {
    // Ignore errors for a worker that is already gone (e.g. a late error
    // after dispose/restart detached it).
    if (!this.worker) {
      return;
    }
    this.detachWorker();
    this.ready = false;
    this.readyokForCycle = false;
    this.pendingSent = false;
    this.barrierTerminator = false;
    this.outstandingSearches = 0;
    this.searching = false;
    // A search that runs to bestmove proves the worker is healthy again:
    // a lone historic error no longer counts toward "consecutive".
    // Rebuild `pending` when the error hit an already-running search so the
    // retry re-issues it: tryStart() consumed `pending`, but the scalar
    // fields plus lastRequest still describe the in-flight search.
    if (!this.pending && this.running && this.fen) {
      this.pending = {
        gen: this.generation,
        fen: this.fen,
        depthTarget: this.depthTarget,
        multiPv: this.multiPv,
        threads: this.threads,
        searchMoves: this.lastRequest.searchMoves,
        fresh: this.lastRequest.fresh,
      };
    }
    if (this.errorCount === 0) {
      // First error: retry once. Keep pending/generation so the queued
      // search is re-issued after the new worker's handshake.
      this.errorCount = 1;
      this.failed = false;
      this.emit();
      this.cancelRetry();
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.errorCount !== 1) {
          return;
        }
        this.createWorker();
      }, ENGINE_RETRY_MS);
      return;
    }
    // Second consecutive error: permanently failed until restart().
    this.failed = true;
    this.running = false;
    this.pending = null;
    this.pendingSent = false;
    this.cancelRetry();
    this.emit();
  }

  /** SIG-1081: manual recovery after failure. Clears the failed state and
   * the retry counter, discards any stale search display, and starts a fresh
   * worker with the same build. The instance identity is preserved so
   * shared-engine tap subscriptions and leases stay valid. */
  restart(): void {
    this.cancelRetry();
    this.errorCount = 0;
    this.failed = false;
    this.generation += 1;
    this.searching = false;
    this.pending = null;
    this.lastRequest = { fresh: true };
    this.pendingSent = false;
    this.barrierTerminator = false;
    this.readyokForCycle = false;
    this.outstandingSearches = 0;
    this.lines = [];
    this.pvSanCache.clear();
    this.depth = 0;
    this.nps = 0;
    this.nodes = 0;
    this.running = false;
    this.ready = false;
    this.detachWorker();
    this.createWorker();
    this.emit();
  }

  start(): void {
    if (this.worker) {
      return;
    }
    this.cancelRetry();
    this.errorCount = 0;
    // A fresh worker means a fresh state: a previous failure no longer applies.
    this.failed = false;
    this.createWorker();
  }

  stopSearch(): void {
    this.generation += 1;
    this.searching = false;
    this.pending = null;
    this.lastRequest = { fresh: true };
    this.pendingSent = false;
    this.barrierTerminator = false;
    this.readyokForCycle = false;
    this.cancelRetry();
    if (!this.worker) {
      return;
    }
    this.send("stop");
    this.running = false;
    this.emit();
  }

  dispose(): void {
    this.generation += 1;
    this.searching = false;
    this.pending = null;
    this.lastRequest = { fresh: true };
    this.pendingSent = false;
    this.barrierTerminator = false;
    this.readyokForCycle = false;
    this.outstandingSearches = 0;
    this.errorCount = 0;
    this.cancelRetry();
    this.listeners.clear();
    this.detachWorker();
    this.ready = false;
    this.running = false;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  analyze(fen: string, depth: number, multiPv: number, threads: number, searchMoves?: string, fresh = true): void {
    this.start();
    this.generation += 1;
    this.searching = false;
    this.fen = fen;
    this.depthTarget = clampDepth(depth);
    this.multiPv = clampLines(multiPv);
    this.threads = this.threaded ? clampThreads(threads) : 1;
    this.lines = [];
    this.pvSanCache.clear();
    this.depth = 0;
    this.nps = 0;
    this.nodes = 0;
    this.running = true;
    this.lastRequest = { searchMoves, fresh };
    this.pending = {
      gen: this.generation,
      fen,
      depthTarget: this.depthTarget,
      multiPv: this.multiPv,
      threads: this.threads,
      searchMoves,
      fresh,
    };
    this.emit();
    this.flushPending();
  }

  private flushPending(): void {
    if (!this.worker || !this.pending || !this.ready || this.pendingSent) {
      return;
    }
    this.pendingSent = true;
    this.barrierTerminator = this.outstandingSearches > 0;
    this.send("stop");
    this.send("isready");
  }

  private tryStart(): void {
    if (!this.pending || !this.pendingSent || !this.readyokForCycle || this.barrierTerminator) {
      return;
    }
    const p = this.pending;
    this.pending = null;
    this.pendingSent = false;
    this.readyokForCycle = false;
    if (p.gen === this.generation && this.worker) {
      this.send(`setoption name Hash value ${ENGINE_HASH_MB}`);
      this.send(`setoption name Threads value ${p.threads}`);
      this.send(`setoption name MultiPV value ${p.multiPv}`);
      if (p.fresh) {
        this.send("ucinewgame");
      }
      this.send(`position fen ${p.fen}`);
      this.send(`go depth ${p.depthTarget}${p.searchMoves ? ` searchmoves ${p.searchMoves}` : ""}`);
      this.outstandingSearches += 1;
      this.searching = true;
      this.running = true;
    }
    this.emit();
  }

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  private handleMessage(message: string): void {
    if (this.failed) {
      return;
    }
    if (message === "uciok") {
      this.send("isready");
      return;
    }
    if (message === "readyok") {
      const first = !this.ready;
      this.ready = true;
      if (first) {
        this.emit();
        this.flushPending();
        return;
      }
      this.readyokForCycle = true;
      this.tryStart();
      return;
    }
    if (message.startsWith("bestmove")) {
      this.outstandingSearches = Math.max(0, this.outstandingSearches - 1);
      this.errorCount = 0;
      if (this.pendingSent && this.barrierTerminator) {
        if (this.outstandingSearches === 0) {
          this.barrierTerminator = false;
          this.tryStart();
        }
        return;
      }
      if (!this.searching) {
        return;
      }
      this.running = false;
      this.emit();
      return;
    }
    if (!this.searching) {
      return;
    }
    const npsMatch = / nps (\d+)/.exec(message);
    const nodesMatch = / nodes (\d+)/.exec(message);
    if (npsMatch) {
      this.nps = Number(npsMatch[1]);
    }
    if (nodesMatch) {
      this.nodes = Number(nodesMatch[1]);
    }
    const parsed = parseInfo(message);
    if (!parsed) {
      if (npsMatch || nodesMatch) {
        this.emit();
      }
      return;
    }
    const existing = this.lines.find((line) => line.multipv === parsed.multipv);
    if (existing && existing.bound === null && parsed.bound !== null) {
      this.depth = Math.max(this.depth, parsed.depth);
      this.emit();
      return;
    }
    const next = this.lines.filter((line) => line.multipv !== parsed.multipv);
    next.push(parsed);
    next.sort((a, b) => a.multipv - b.multipv);
    this.lines = next.slice(0, this.multiPv);
    this.depth = Math.max(this.depth, parsed.depth);
    this.emit();
  }

  private resolvePvSan(pvUci: string[]): string[] {
    const key = `${this.fen}\n${pvUci.join(" ")}`;
    const cached = this.pvSanCache.get(key);
    if (cached) {
      return cached;
    }
    const san = pvToSan(this.fen, pvUci);
    if (this.pvSanCache.size >= 500) {
      this.pvSanCache.clear();
    }
    this.pvSanCache.set(key, san);
    return san;
  }

  private snapshot(): EngineInfo {
    const fen = this.fen;
    return {
      depth: this.depth,
      running: this.running,
      ready: this.ready,
      failed: this.failed,
      lines: this.lines.map((line) => ({ ...line, pvSan: this.resolvePvSan(line.pvUci) })),
      nps: this.nps,
      nodes: this.nodes,
      threaded: this.threaded,
      fen,
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

export function formatScore(line: EngineLine | undefined, sideToMove: "w" | "b"): string {
  if (!line) {
    return "0.00";
  }
  const flip = sideToMove === "b" ? -1 : 1;
  if (line.mate != null) {
    const mate = line.mate * flip;
    return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`;
  }
  if (line.scoreCp == null) {
    return "0.00";
  }
  const pawns = (line.scoreCp * flip) / 100;
  const abs = Math.abs(pawns).toFixed(2);
  return pawns >= 0 ? `+${abs}` : `-${abs}`;
}

export function scoreNumber(line: EngineLine | undefined, sideToMove: "w" | "b"): number {
  if (!line) {
    return 0;
  }
  const flip = sideToMove === "b" ? -1 : 1;
  if (line.mate != null) {
    const mate = line.mate * flip;
    const magnitude = 10000 - Math.abs(mate) * 10;
    return mate > 0 ? magnitude : -magnitude;
  }
  return ((line.scoreCp ?? 0) * flip) / 100;
}

export function evalBarPercent(pawns: number): number {
  const clamped = Math.max(-5, Math.min(5, pawns));
  return ((clamped + 5) / 10) * 100;
}

export function formatNps(nps: number): string {
  if (nps <= 0) {
    return "";
  }
  if (nps >= 1_000_000) {
    return `${(nps / 1_000_000).toFixed(1)} MN/s`;
  }
  if (nps >= 1000) {
    return `${Math.round(nps / 1000)} kN/s`;
  }
  return `${nps} N/s`;
}
