import type { AnalyzeOptions, EvalLine, PositionEval, ReviewEngine } from "@/src/chess/review-engine";
import { sideFromFen } from "@/src/chess/move-notation";
import { scoreNumber, type EngineInfo } from "@/src/engine/stockfish-client";
import type { SharedEngineLease } from "@/src/engine/shared-engine";

type Lease = Pick<SharedEngineLease, "analyze" | "subscribe">;

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
 * else means the search was cut short — typically by another slot (Show threat)
 * stopping the shared worker — and its snapshot must not be graded.
 */
function legitimateEarlyEnd(evaluation: PositionEval, options: AnalyzeOptions): boolean {
  const legal = options.legalMoves ?? Number.POSITIVE_INFINITY;
  return legal <= 1 || evaluation.lines.some((line) => Math.abs(line.whitePawns) >= MATE_PAWNS);
}

/**
 * Adapts a shared-engine lease to the pipeline's `ReviewEngine`. One search at
 * a time: callers await each `analyze` (SIG-850 barrier). A search preempted by
 * a higher slot (threat) emits nothing until it resumes; the timeout is the
 * escape hatch, and it resolves with whatever snapshot arrived last.
 */
export function createLeaseEngine(lease: Lease, threads: number, isCancelled: () => boolean): ReviewEngine {
  return {
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
          clearTimeout(timer);
          unsubscribe();
          resolve(result);
        };
        const timer = setTimeout(() => finish(latest), options.timeoutMs);
        // analyze() must run before subscribe(): subscribe() replays the last
        // snapshot synchronously, and analyze() clears lines / sets running.
        const search = (fresh: boolean) =>
          lease.analyze(fen, options.depth, options.lines, threads, undefined, fresh);
        search(options.fresh);
        unsubscribe = lease.subscribe((info) => {
          if (isCancelled()) {
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
