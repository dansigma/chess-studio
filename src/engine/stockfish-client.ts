import { Chess } from "chess.js";

export const ENGINE_HASH_MB = 16;
export const ENGINE_BUILDS = ["lite", "standard"] as const;
export type EngineBuild = (typeof ENGINE_BUILDS)[number];

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
};

export type EngineInfo = {
  depth: number;
  running: boolean;
  ready: boolean;
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
  return typeof SharedArrayBuffer !== "undefined";
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

function pvToSan(fen: string, pv: string[]): string[] {
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

function parseInfo(line: string, fen: string): EngineLine | null {
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
  const pvUci = pvMatch[1].split(" ").filter(Boolean);
  return {
    multipv: multiMatch ? Number(multiMatch[1]) : 1,
    depth: Number(depthMatch[1]),
    scoreCp: cpMatch ? Number(cpMatch[1]) : null,
    mate: mateMatch ? Number(mateMatch[1]) : null,
    pvUci,
    pvSan: pvToSan(fen, pvUci),
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
  private lines: EngineLine[] = [];
  private depth = 0;
  private nps = 0;
  private nodes = 0;
  private running = false;
  private ready = false;
  private generation = 0;
  private searching = false;
  readonly threaded = supportsEngineThreads();

  constructor(build: EngineBuild = "lite") {
    this.build = build;
  }

  start(): void {
    if (this.worker) {
      return;
    }
    this.worker = new Worker(engineWorkerUrl(this.build));
    this.worker.onmessage = (event: MessageEvent<string>) => {
      this.handleMessage(String(event.data));
    };
    this.send("uci");
  }

  stopSearch(): void {
    this.generation += 1;
    this.searching = false;
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
    this.worker?.terminate();
    this.worker = null;
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
    this.fen = fen;
    this.depthTarget = clampDepth(depth);
    this.multiPv = clampLines(multiPv);
    this.threads = this.threaded ? clampThreads(threads) : 1;
    this.lines = [];
    this.depth = 0;
    this.nps = 0;
    this.nodes = 0;
    this.running = true;
    this.emit();
    this.generation += 1;
    const gen = this.generation;
    this.searching = false;
    this.send("stop");
    window.setTimeout(() => {
      if (gen !== this.generation || !this.worker) {
        return;
      }
      this.send(`setoption name Hash value ${ENGINE_HASH_MB}`);
      this.send(`setoption name Threads value ${this.threads}`);
      this.send(`setoption name MultiPV value ${this.multiPv}`);
      if (fresh) {
        this.send("ucinewgame");
      }
      this.send(`position fen ${fen}`);
      this.send(`go depth ${this.depthTarget}${searchMoves ? ` searchmoves ${searchMoves}` : ""}`);
      this.searching = true;
      this.running = true;
      this.emit();
    }, 40);
  }

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  private handleMessage(message: string): void {
    if (message === "uciok") {
      this.send("isready");
      return;
    }
    if (message === "readyok") {
      this.ready = true;
      this.emit();
      return;
    }
    if (message.startsWith("bestmove")) {
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
    const parsed = parseInfo(message, this.fen);
    if (!parsed) {
      if (npsMatch || nodesMatch) {
        this.emit();
      }
      return;
    }
    const next = this.lines.filter((line) => line.multipv !== parsed.multipv);
    next.push(parsed);
    next.sort((a, b) => a.multipv - b.multipv);
    this.lines = next.slice(0, this.multiPv);
    this.depth = Math.max(this.depth, parsed.depth);
    this.emit();
  }

  private snapshot(): EngineInfo {
    return {
      depth: this.depth,
      running: this.running,
      ready: this.ready,
      lines: this.lines,
      nps: this.nps,
      nodes: this.nodes,
      threaded: this.threaded,
      fen: this.fen,
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
    return line.mate * flip > 0 ? 10 : -10;
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
