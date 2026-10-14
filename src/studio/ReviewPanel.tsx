"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { sideFromFen } from "@/src/chess/move-notation";
import {
  REVIEW_DEPTH,
  bookFlags,
  gradeMove,
  hangsPieceOn,
  isSacrificeOn,
  lineHolds,
  mergeBookLabel,
  type PositionScore,
  type ReviewedMove,
} from "@/src/chess/review";
import { buildReviewReport, keyMoments } from "@/src/chess/review-report";
import { lookupBookOpening } from "@/src/lib/opening-book";
import { ReviewReportCard } from "./review/ReviewReportCard";
import { isNullMoveToken } from "@/src/chess/null-move";
import { dividePhases, phaseAt, type GamePhase } from "@/src/chess/phases";
import { getNodeAt, variationPoints, type Path } from "@/src/chess/tree";
import { defaultEngineThreads, scoreNumber, type EngineInfo } from "@/src/engine/stockfish-client";
import { acquire } from "@/src/engine/shared-engine";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";

type MoveRow = ReviewedMove & {
  path: Path;
  san: string;
  side: "w" | "b";
  phase: GamePhase;
  forced: boolean;
};

function positionScore(fen: string, info: EngineInfo): PositionScore | null {
  const best = info.lines[0];
  if (!best || info.fen !== fen) {
    return null;
  }
  const side = sideFromFen(fen);
  const second = info.lines[1];
  return {
    whitePawns: scoreNumber(best, side),
    bestUci: best.pvUci[0] ?? null,
    secondWhitePawns: second ? scoreNumber(second, side) : null,
    depth: info.depth,
  };
}

export function ReviewPanel() {
  const board = useActiveBoard();
  const setupMode = useStudioStore((state) => state.setupMode);
  const engineBuild = useStudioStore((state) => state.settings.engineBuild);
  const engineThreads = useStudioStore((state) => state.settings.engineThreads);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const goPath = useStudioStore((state) => state.goPath);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [rows, setRows] = useState<MoveRow[] | null>(null);

  const points = useMemo(
    () => variationPoints(board.tree, board.path),
    [board.tree, board.path],
  );
  const lineKey = `${board.id}:${points.map((point) => point.fen).join("|")}`;

  const [lastLineKey, setLastLineKey] = useState(lineKey);
  if (lastLineKey !== lineKey) {
    setLastLineKey(lineKey);
    setRunning(false);
    setRows(null);
    setProgress({ done: 0, total: 0 });
  }

  useEffect(() => {
    if (!running || setupMode || points.length < 2) {
      return;
    }
    const lease = acquire("review", engineBuild);
    const engine = {
      subscribe: lease.subscribe.bind(lease),
      analyze: lease.analyze.bind(lease),
    };
    let cancelled = false;
    let unsubscribe: () => void = () => undefined;

    const threads = Math.max(engineThreads, defaultEngineThreads());

    async function analyzeFen(
      fen: string,
      fresh: boolean,
      depth = REVIEW_DEPTH,
      lines = 1,
      searchMoves?: string,
      timeoutMs = 20_000,
    ): Promise<PositionScore | null> {
      return new Promise((resolve) => {
        const finish = (score: PositionScore | null) => {
          window.clearTimeout(timer);
          unsubscribe();
          unsubscribe = () => undefined;
          resolve(score);
        };
        let latest: PositionScore | null = null;
        const timer = window.setTimeout(() => finish(latest), timeoutMs);
        // analyze() must run before subscribe(): subscribe() replays the last
        // snapshot synchronously, and analyze() clears lines / sets running.
        engine.analyze(fen, depth, lines, threads, searchMoves, fresh);
        unsubscribe = engine.subscribe((info) => {
          if (cancelled) {
            finish(null);
            return;
          }
          if (info.fen !== fen) {
            return;
          }
          const score = positionScore(fen, info);
          if (score) {
            latest = score;
          }
          if (score && (!info.running || info.depth >= depth)) {
            // !running is terminal for the ACTIVE search; the client discards messages from stopped searches.
            finish(score);
          }
        });
      });
    }

    async function openingReplies(): Promise<Array<string[] | null>> {
      const replies: Array<string[] | null> = [];
      for (let index = 0; index < points.length - 1; index += 1) {
        if (cancelled) {
          return replies;
        }
        try {
          const response = await fetch(`/api/explorer?fen=${encodeURIComponent(points[index].fen)}&source=masters`);
          if (!response.ok) {
            replies.push(null);
            break;
          }
          const payload = (await response.json()) as { moves?: Array<{ uci?: string }> };
          const ucis = (payload.moves ?? []).flatMap((move) => (move.uci ? [move.uci] : []));
          replies.push(ucis);
          const node = getNodeAt(board.tree, points[index + 1].path);
          if (!node || !ucis.includes(node.uci)) {
            break;
          }
        } catch {
          replies.push(null);
          break;
        }
      }
      return replies;
    }

    async function walk() {
      const bookPromise = openingReplies();
      const scores: Array<PositionScore | null> = [];
      for (let index = 0; index < points.length; index += 1) {
        if (cancelled) {
          return;
        }
        setProgress({ done: index, total: points.length });
        scores.push(await analyzeFen(points[index].fen, index === 0));
      }
      setProgress({ done: points.length, total: points.length });
      const replies = await bookPromise;
      if (cancelled) {
        return;
      }
      const played = points.slice(0, -1).map((point, index) => getNodeAt(board.tree, points[index + 1].path)?.uci ?? "");
      const inBook = bookFlags(played, replies);
      const division = dividePhases(points.map((point) => point.fen));
      const moveCount = points.length - 1;
      const next: MoveRow[] = [];
      // Win-chance points the previous mover lost; feeds "miss" detection.
      let lastWinLoss = 0;
      for (let index = 0; index < moveCount; index += 1) {
        const before = scores[index];
        const after = scores[index + 1];
        const node = getNodeAt(board.tree, points[index + 1].path);
        if (!before || !after || !node || node.uci.length < 4 || isNullMoveToken(node.uci)) {
          lastWinLoss = 0;
          continue;
        }
        const beforeBoard = new Chess(points[index].fen);
        const afterBoard = new Chess(points[index + 1].fen);
        const side = sideFromFen(points[index].fen);
        const hanging = hangsPieceOn(beforeBoard, afterBoard, node.uci, side);
        const sacrifice = isSacrificeOn(beforeBoard, afterBoard, side) || hanging;
        let beforeScore = before;
        if (sacrifice && before.bestUci === node.uci && before.secondWhitePawns == null) {
          const withSecond = await analyzeFen(points[index].fen, false, REVIEW_DEPTH, 2, undefined, 8_000);
          if (withSecond?.secondWhitePawns != null) {
            beforeScore = { ...before, secondWhitePawns: withSecond.secondWhitePawns };
          }
        }
        let graded = gradeMove({
          side,
          playedUci: node.uci,
          before: beforeScore,
          afterWhitePawns: after.whitePawns,
          sacrifice,
          opponentLastLoss: lastWinLoss,
        });
        const negative =
          graded.label === "inaccuracy" || graded.label === "mistake" || graded.label === "miss" || graded.label === "blunder";
        if (negative && (sacrifice || hanging)) {
          const deeper = await analyzeFen(points[index + 1].fen, false, REVIEW_DEPTH + 6, 1, undefined, 12_000);
          if (deeper && (deeper.depth ?? 0) >= REVIEW_DEPTH + 4 && lineHolds(side, before.whitePawns, deeper.whitePawns)) {
            graded = gradeMove({
              side,
              playedUci: node.uci,
              before: {
                whitePawns: deeper.whitePawns,
                bestUci: node.uci,
                secondWhitePawns: before.whitePawns,
              },
              afterWhitePawns: deeper.whitePawns,
              sacrifice: true,
              opponentLastLoss: lastWinLoss,
            });
          }
        }
        lastWinLoss = graded.winLoss;
        next.push({
          ...graded,
          label: mergeBookLabel(inBook[index], graded.label),
          path: points[index + 1].path,
          san: node.san,
          side,
          phase: phaseAt(division, index + 1),
          forced: beforeBoard.moves().length === 1,
        });
      }
      setRows(next);
      setProgress({ done: moveCount, total: moveCount });
      setRunning(false);
    }

    void walk();
    return () => {
      cancelled = true;
      unsubscribe();
      lease.release();
    };
  }, [board.tree, engineBuild, engineThreads, points, running, setupMode]);

  const report = useMemo(() => (rows ? buildReviewReport(rows, board.headers) : null), [rows, board.headers]);
  const moments = useMemo(() => (rows ? keyMoments(rows) : []), [rows]);
  const openingName = useMemo(() => {
    if (!rows) {
      return null;
    }
    for (let index = points.length - 1; index > 0; index -= 1) {
      const opening = lookupBookOpening(points[index].fen);
      if (opening?.name) {
        return opening.eco ? `${opening.eco} · ${opening.name}` : opening.name;
      }
    }
    return null;
  }, [rows, points]);
  const lineNote = points[points.length - 1]?.path.some((index) => index !== 0)
    ? "Reviewed line is a variation, not the main line."
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-studio-panel text-body text-studio-fg">
      <div className="flex items-center justify-between gap-2 border-b border-studio-border-subtle px-3 py-2">
        <span className="text-dense font-semibold">Game Review</span>
        <Button
          size="sm"
          variant="primary"
          disabled={setupMode || points.length < 2 || running}
          onClick={() => {
            setProgress({ done: 0, total: points.length });
            setRunning(true);
          }}
        >
          {running ? `${progress.done}/${progress.total}` : rows ? "Review again" : "Review game"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {points.length < 2 ? (
          <p className="px-3 py-4 text-dense text-studio-faint">Play or open a game to review it.</p>
        ) : null}
        {setupMode ? <p className="px-3 py-2 text-caption text-studio-warning-fg">Paused in setup.</p> : null}
        {running && !setupMode ? (
          <p className="px-3 py-3 text-dense text-studio-muted">
            Scoring moves at depth {REVIEW_DEPTH}… {progress.done}/{progress.total}
          </p>
        ) : null}
        {report ? (
          <ReviewReportCard
            report={report}
            moments={moments}
            moveNotation={moveNotation}
            onSelectMoment={goPath}
            openingName={openingName}
            lineNote={lineNote}
          />
        ) : null}
      </div>
    </div>
  );
}
