// SIG-1090: sequential background batch-review queue (My Games 4/5).
// Processes games one at a time with `runReview`, building the same
// `ReviewInput` the interactive hook builds (fens/ucis from the game PGN via
// `importPgn`, cache key via `reviewCacheKey`), so a reviewed row opened in
// the sidebar hits the cached result with no second analysis. Transport-free:
// the queue never touches Supabase — the caller persists each finished
// summary through `onGameDone`. Cancelled/failed games are skipped (reported
// as a `null` summary) and never throw out of `start()`.
import {
  runReview,
  type ReviewPreset,
  type ReviewRow,
} from "@/src/chess/review-engine";
import type { ReportRow } from "@/src/chess/review-report";
import { buildReviewReport, type ReportHeaders } from "@/src/chess/review-report";
import { isNullMoveToken } from "@/src/chess/null-move";
import { importPgn, type GameHeaders } from "@/src/chess/pgn";
import type { GamePhase } from "@/src/chess/phases";
import type { ReviewEngine } from "@/src/chess/review-engine";
import { persistReview, reviewCacheKey, setCachedReview } from "@/src/studio/review/review-cache";

export type ReviewQueueGame = {
  /** `my_games` row id — the caller writes the summary back with it. */
  id: string;
  externalId: string;
  pgn: string;
  color: "white" | "black";
  whiteName: string | null;
  blackName: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  eco: string | null;
  opening: string | null;
};

export type MistakeTier = "inaccuracy" | "mistake" | "miss" | "blunder";

export type MistakeCounts = Record<GamePhase, Record<MistakeTier, number>>;

export type ReviewQueueSummary = {
  id: string;
  userAccuracy: number | null;
  opponentAccuracy: number | null;
  reviewedAt: string;
  mistakeCounts: MistakeCounts;
};

export type ReviewQueueCallbacks = {
  games: ReviewQueueGame[];
  preset: ReviewPreset;
  engineBuild: string;
  threads: number;
  /** Real lease engine or a fake in tests; one position at a time. */
  engine: ReviewEngine;
  /** Outer cancel (unmount / Cancel button); combined with per-game flow. */
  isCancelled?: () => boolean;
  onGameDone: (summary: ReviewQueueSummary | null, game: ReviewQueueGame) => void | Promise<void>;
  onProgress?: (done: number, total: number, gameId: string) => void;
  now?: () => number;
};

function emptyMistakeCounts(): MistakeCounts {
  const phase = (): Record<MistakeTier, number> => ({ inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 });
  return { opening: phase(), middlegame: phase(), endgame: phase() };
}

/** The user's mistake counts per phase (user's rows only; the four negative tiers). */
export function userMistakeCounts(rows: ReviewRow[], userSide: "w" | "b"): MistakeCounts {
  const counts = emptyMistakeCounts();
  for (const row of rows) {
    if (row.side !== userSide || row.forced) {
      continue;
    }
    const label = row.label;
    if (label === "inaccuracy" || label === "mistake" || label === "miss" || label === "blunder") {
      counts[row.phase][label] += 1;
    }
  }
  return counts;
}

/**
 * Headers for `buildReviewReport` from the game's PGN headers merged with the
 * row's names/ratings — the same mapping `importPlayerGame` applies
 * (`src/store/slices/board-edit.ts`), so accuracies match the sidebar view.
 */
export function queueReportHeaders(pgnHeaders: GameHeaders, game: ReviewQueueGame): ReportHeaders {
  const headers: ReportHeaders = { ...pgnHeaders };
  if (!headers.White && game.whiteName) {
    headers.White = game.whiteName;
  }
  if (!headers.Black && game.blackName) {
    headers.Black = game.blackName;
  }
  if (!headers.WhiteElo && game.whiteRating != null) {
    headers.WhiteElo = String(game.whiteRating);
  }
  if (!headers.BlackElo && game.blackRating != null) {
    headers.BlackElo = String(game.blackRating);
  }
  return headers;
}

export type QueueGameInput = {
  fens: string[];
  ucis: string[];
  cacheKey: string;
  headers: ReportHeaders;
  playable: boolean;
};

/** PGN → fens/ucis/cache-key/headers for one queue game (main line). */
export function queueGameInput(pgn: string, game: ReviewQueueGame, preset: ReviewPreset, engineBuild: string): QueueGameInput {
  const imported = importPgn(pgn);
  const fens: string[] = [imported.tree.startFen];
  const ucis: string[] = [];
  let nodes = imported.tree.children;
  while (nodes[0]) {
    const node = nodes[0];
    fens.push(node.fen);
    ucis.push(node.uci);
    nodes = node.children;
  }
  const cacheKey = reviewCacheKey(fens, ucis, preset, engineBuild);
  return {
    fens,
    ucis,
    cacheKey,
    headers: queueReportHeaders(imported.headers, game),
    // Needs at least one played move (fens = moves + 1).
    playable: fens.length >= 2,
  };
}

export function summaryFromRows(
  game: ReviewQueueGame,
  rows: ReviewRow[],
  headers: ReportHeaders,
  now: () => number,
): ReviewQueueSummary {
  const report = buildReviewReport(rows as ReportRow[], headers);
  const userSide: "w" | "b" = game.color === "black" ? "b" : "w";
  return {
    id: game.id,
    userAccuracy: userSide === "w" ? report.white.accuracy : report.black.accuracy,
    opponentAccuracy: userSide === "w" ? report.black.accuracy : report.white.accuracy,
    reviewedAt: new Date(now()).toISOString(),
    mistakeCounts: userMistakeCounts(rows, userSide),
  };
}

export function createReviewQueue(callbacks: ReviewQueueCallbacks): { start: () => Promise<void>; cancel: () => void } {
  // `threads` is plumbing for the caller (it owns the lease engine with its
  // thread count); the queue intentionally stays serial — one position at a
  // time — so a batch never disturbs interactive analysis.
  const { games, preset, engineBuild, engine, onGameDone, onProgress, isCancelled, now } = callbacks;
  const clock = now ?? Date.now;
  let cancelled = false;

  return {
    cancel() {
      cancelled = true;
    },
    async start() {
      const total = games.length;
      for (let index = 0; index < games.length; index += 1) {
        const game = games[index];
        if (cancelled || isCancelled?.()) {
          return;
        }
        onProgress?.(index, total, game.id);
        let summary: ReviewQueueSummary | null = null;
        try {
          const input = queueGameInput(game.pgn, game, preset, engineBuild);
          if (input.playable) {
            const outcome = await runReview({
              fens: input.fens,
              moves: input.ucis.map((uci) => ({ uci })),
              preset,
              engine,
              // No bookReplies: the batch must not hit the explorer API per
              // game; book moves grade without the book label (offline
              // grading), unlike the interactive run. No resume: a cancelled
              // game is simply unreviewed and retried on the next run.
              isCancelled: () => cancelled || isCancelled?.() || false,
            });
            if (outcome.status === "done") {
              const rows = outcome.rows.filter(
                (row) => row.playedUci.length >= 4 && !isNullMoveToken(row.playedUci),
              );
              // The interactive hook caches the raw rows; the cache key is
              // over fens/ucis so filtering null-move rows here keeps the
              // same key valid for the opener.
              setCachedReview(input.cacheKey, outcome.rows);
              persistReview(input.fens, input.ucis, preset, engineBuild, input.cacheKey, outcome.rows);
              summary = summaryFromRows(game, rows, input.headers, clock);
            }
          }
        } catch {
          summary = null;
        }
        if (cancelled || isCancelled?.()) {
          return;
        }
        await onGameDone(summary, game);
        onProgress?.(index + 1, total, game.id);
      }
    },
  };
}
