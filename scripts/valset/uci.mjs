// SIG-1221: a minimal UCI client for a native engine process (Stockfish), plus
// the pure parsing helpers it uses (unit-tested against a fake engine).
import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

export const MATE_CP = 10000;

/** Parse one `info ...` line; null for lines without a score and principal variation. */
export function parseInfoLine(line) {
  if (!line.startsWith("info ")) return null;
  const tokens = line.trim().split(/\s+/);
  const read = (key) => {
    const at = tokens.indexOf(key);
    return at >= 0 ? tokens[at + 1] : undefined;
  };
  const scoreAt = tokens.indexOf("score");
  const pvAt = tokens.indexOf("pv");
  if (scoreAt < 0 || pvAt < 0) return null;
  const kind = tokens[scoreAt + 1];
  const value = Number(tokens[scoreAt + 2]);
  if (!Number.isFinite(value) || (kind !== "cp" && kind !== "mate")) return null;
  const bound = tokens[scoreAt + 3];
  return {
    depth: Number(read("depth") ?? 0),
    multipv: Number(read("multipv") ?? 1),
    score: kind === "cp" ? { cp: value } : { mate: value },
    bound: bound === "lowerbound" || bound === "upperbound" ? bound : null,
    pv: tokens.slice(pvAt + 1),
  };
}

/** Centipawns for comparisons; a mate counts as +-10000 minus the distance. */
export function scoreToCp(score) {
  if (score == null) return null;
  if ("cp" in score) return score.cp;
  return score.mate > 0 ? MATE_CP - score.mate : -MATE_CP - score.mate;
}

export function negateScore(score) {
  if (score == null) return null;
  return "cp" in score ? { cp: -score.cp } : { mate: -score.mate };
}

/** Reduce the stream of info lines of one search to the final line per MultiPV rank. */
export function collectLines(infoLines) {
  const best = new Map();
  for (const info of infoLines) {
    if (info.bound) continue;
    const current = best.get(info.multipv);
    if (!current || info.depth >= current.depth) best.set(info.multipv, info);
  }
  return [...best.values()]
    .sort((a, b) => a.multipv - b.multipv)
    .map((info) => ({ rank: info.multipv, depth: info.depth, score: info.score, pv: info.pv }));
}

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** `--stockfish`, then STOCKFISH_PATH, then `stockfish` on PATH, then usual install dirs. */
export function findStockfish(explicit, env = process.env) {
  if (explicit) return isExecutable(explicit) ? explicit : null;
  if (env.STOCKFISH_PATH) return isExecutable(env.STOCKFISH_PATH) ? env.STOCKFISH_PATH : null;
  const dirs = [...(env.PATH ?? "").split(delimiter), "/usr/games", "/usr/local/bin", "/opt/homebrew/bin"];
  for (const dir of dirs) {
    if (dir && isExecutable(join(dir, "stockfish"))) return join(dir, "stockfish");
  }
  return null;
}

export const NO_ENGINE_MESSAGE =
  "No Stockfish binary found. Install one (apt-get install stockfish, brew install stockfish) " +
  "or point STOCKFISH_PATH / --stockfish at it. Only positions missing from the engine cache need it.";

export class UciEngine {
  constructor(child) {
    this.child = child;
    this.name = "unknown";
    this.waiters = [];
    this.buffer = "";
    this.lines = [];
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.#onData(chunk));
    child.on("exit", () => this.#flush(new Error("engine process exited")));
    child.on("error", (error) => this.#flush(error));
  }

  static async start(path, { threads = 1, hashMb = 128, timeoutMs = 30000 } = {}) {
    const child = spawn(path, [], { stdio: ["pipe", "pipe", "ignore"] });
    const engine = new UciEngine(child);
    const header = await engine.#command("uci", (line) => line === "uciok", timeoutMs);
    engine.name = header.find((line) => line.startsWith("id name "))?.slice(8).trim() ?? "unknown";
    engine.send(`setoption name Threads value ${threads}`);
    engine.send(`setoption name Hash value ${hashMb}`);
    await engine.#command("isready", (line) => line === "readyok", timeoutMs);
    return engine;
  }

  send(line) {
    this.child.stdin.write(`${line}\n`);
  }

  #onData(chunk) {
    this.buffer += chunk;
    let at;
    while ((at = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, at).replace(/\r$/, "");
      this.buffer = this.buffer.slice(at + 1);
      this.lines.push(line);
      const waiter = this.waiters[0];
      if (waiter?.done(line)) {
        this.waiters.shift();
        clearTimeout(waiter.timer);
        const collected = this.lines;
        this.lines = [];
        waiter.resolve(collected);
      }
    }
  }

  #flush(error) {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  #command(line, done, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`engine timed out waiting for the reply to "${line}"`)), timeoutMs);
      this.waiters.push({ done, resolve, reject, timer });
      this.send(line);
    });
  }

  /**
   * Search `fen` to a fixed depth. Scores are from the side to move.
   * @returns {Promise<{ bestmove: string | null, lines: Array<{rank:number, depth:number, score:object, pv:string[]}> }>}
   */
  async analyze(fen, { depth, multipv = 1, searchmoves = [], timeoutMs = 300000 }) {
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send(`position fen ${fen}`);
    const go = `go depth ${depth}${searchmoves.length ? ` searchmoves ${searchmoves.join(" ")}` : ""}`;
    const output = await this.#command(go, (line) => line.startsWith("bestmove"), timeoutMs);
    const infos = output.map(parseInfoLine).filter(Boolean);
    const bestToken = output.find((line) => line.startsWith("bestmove"))?.split(/\s+/)[1];
    return {
      bestmove: bestToken && bestToken !== "(none)" && bestToken !== "0000" ? bestToken : null,
      lines: collectLines(infos),
    };
  }

  async quit() {
    try {
      this.send("quit");
    } catch {
      // already gone
    }
    this.child.kill();
  }
}
