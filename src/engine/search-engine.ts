import type { AnalyzeOptions, EvalLine, PositionEval, ReviewEngine } from "@/src/chess/review-engine";
import { sideFromFen } from "@/src/chess/move-notation";
import { scoreNumber, type EngineInfo } from "@/src/engine/stockfish-client";

/** The slice of `StockfishEngine` the adapter drives (one client = one search at a time). */
export type SearchClient = {
  analyze: (
    fen: string,
    depth: number,
    multiPv: number,
    threads: number,
    searchMoves?: string,
    fresh?: boolean,
  ) => void;
  subscribe: (listener: (info: EngineInfo) => void) => () => void;
};

export type SearchEngine = ReviewEngine & {
  /** Resolves every in-flight `analyze` with null now and clears its timer (cancel / dispose). */
  abort: () => void;
};

/** Scores at or beyond this many pawns are mate scores (see `scoreNumber`). */
const MATE_PAWNS = 900;
/** A search that ends shallow without a legitimate reason is re-issued this many times. */
const MAX_RESTARTS = 2;

function toEval(fen: string, info: EngineInfo): PositionEval | null {
  if (info.fen !== fen || info.lines.length === 0) {
    return null;
  }
  const side = sideFromFen(fen);
  const lines: EvalLine[] = info.lines.map((line) => ({
    whitePawns: scoreNumber(line, side),
    uci: line.pvUci[0] ?? null,
    pv: line.pvUci,
  }));
  return { depth: info.depth, lines };
}

/**
 * A finished search below the target depth is only legitimate when the engine
 * had nothing to search (a single legal move) or found a forced mate. Anything
 * else means the search was cut short and its snapshot must not be graded.
 */
function legitimateEarlyEnd(evaluation: PositionEval, options: AnalyzeOptions): boolean {
  const legal = options.legalMoves ?? Number.POSITIVE_INFINITY;
  return legal <= 1 || evaluation.lines.some((line) => Math.abs(line.whitePawns) >= MATE_PAWNS);
}

/**
 * Adapts one dedicated `StockfishEngine` to the pipeline's `ReviewEngine`
 * (SIG-1223: no shared-engine lease, so nothing can preempt a search). One
 * search at a time per client: callers await each `analyze`. The timeout is the
 * escape hatch, and it resolves with whatever snapshot arrived last.
 */
export function createSearchEngine(client: SearchClient, threads: number, isCancelled: () => boolean): SearchEngine {
  const inflight = new Set<() => void>();
  return {
    abort() {
      for (const cancel of [...inflight]) {
        cancel();
      }
    },
    analyze(fen: string, options: AnalyzeOptions): Promise<PositionEval | null> {
      return new Promise((resolve) => {
        let unsubscribe: () => void = () => undefined;
        let latest: PositionEval | null = null;
        let settled = false;
        let restarts = 0;
        const expectedLines = Math.max(1, Math.min(options.lines, options.legalMoves ?? options.lines));
        const finish = (result: PositionEval | null) => {
          if (settled) {
            return;
          }
          settled = true;
          inflight.delete(abortThis);
          clearTimeout(timer);
          unsubscribe();
          resolve(result);
        };
        const timer = setTimeout(() => finish(latest), options.timeoutMs);
        const abortThis = () => finish(null);
        inflight.add(abortThis);
        // analyze() must run before subscribe(): subscribe() replays the last
        // snapshot synchronously, and analyze() clears lines / sets running.
        const search = (fresh: boolean) =>
          client.analyze(fen, options.depth, options.lines, threads, undefined, fresh);
        search(options.fresh);
        unsubscribe = client.subscribe((info) => {
          if (isCancelled() || info.failed) {
            // A failed worker never answers again: do not sit out the timeout.
            finish(null);
            return;
          }
          const evaluation = toEval(fen, info);
          if (!evaluation) {
            return;
          }
          latest = evaluation;
          const complete = evaluation.lines.length >= expectedLines;
          if (info.running) {
            if (info.depth >= options.depth && complete) {
              finish(evaluation);
            }
            return;
          }
          // !running is terminal for the ACTIVE search; the client discards messages from stopped searches.
          if (complete && (info.depth >= options.depth || legitimateEarlyEnd(evaluation, options))) {
            finish(evaluation);
          } else if (restarts < MAX_RESTARTS) {
            restarts += 1;
            latest = null;
            search(true);
          } else {
            finish(evaluation);
          }
        });
        if (settled) {
          unsubscribe();
        }
      });
    },
  };
}
