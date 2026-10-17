import type {
  AnalyzeOptions,
  PositionEval,
  ReviewEngine,
} from "@/src/chess/review-engine";
import { REVIEW_LINES } from "@/src/chess/review-engine";

/**
 * SIG-970: deterministic engine seam for Playwright e2e.
 *
 * Guarded by `NEXT_PUBLIC_E2E_REVIEW_FAKE === "1"` (fails closed): production
 * builds never set the flag, so the fake can never activate outside e2e.
 * The value is inlined at build time; `playwright.config.ts` sets it in
 * `webServer.env` so only the e2e server build sees it.
 */
export function isE2eFakeReviewEnabled(): boolean {
  return (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_E2E_REVIEW_FAKE === "1"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scripted scores (White's point of view, pawns): flat +0.2 everywhere except
 * two swings that grade deterministically into key moments — a sharp white
 * drop at ply 7 (white blunders away equality) and a sharp white jump at ply
 * 12 (black blunders into a white advantage). Recoveries grade as further key
 * moments, so the report always has key moments to navigate.
 *
 * The value is derived from the FEN itself (side to move + fullmove number),
 * so it is stable across call order, resume runs (which skip rescored
 * positions), sacrifice rechecks and fresh restarts.
 */
function plyOf(fen: string): number | null {
  const fields = fen.split(" ");
  const side = fields[1];
  const fullmove = Number.parseInt(fields[5] ?? "", 10);
  if ((side !== "w" && side !== "b") || !Number.isInteger(fullmove) || fullmove < 1) {
    return null;
  }
  return (fullmove - 1) * 2 + (side === "b" ? 1 : 0);
}

function scriptedValue(ply: number): number {
  if (ply === 7) {
    return -2.8;
  }
  if (ply === 12) {
    return 3.2;
  }
  return 0.2;
}

export function createE2eFakeReviewEngine(options?: {
  delayMs?: number;
  isCancelled?: () => boolean;
}): ReviewEngine {
  const delayMs = options?.delayMs ?? 40;
  const isCancelled = options?.isCancelled;

  const valueFor = (fen: string): number => {
    const ply = plyOf(fen);
    return ply == null ? 0.2 : scriptedValue(ply);
  };

  return {
    async analyze(fen: string, analyzeOptions: AnalyzeOptions): Promise<PositionEval | null> {
      await sleep(delayMs);
      if (isCancelled?.()) {
        return null;
      }
      const whitePawns = valueFor(fen);
      const lineCount = Math.max(1, Math.min(analyzeOptions.lines, REVIEW_LINES));
      return {
        depth: analyzeOptions.depth,
        lines: Array.from({ length: lineCount }, (_, lineIndex) => ({
          whitePawns: whitePawns - lineIndex * 0.05,
          uci: null,
        })),
      };
    },
  };
}
