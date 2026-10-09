"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import {
  REVIEW_DEPTH,
  REVIEW_LABELS,
  bookFlags,
  harmonicAccuracy,
  countLabels,
  gradeMove,
  hangsPieceOn,
  isSacrificeOn,
  lineHolds,
  mergeBookLabel,
  type PositionScore,
  type ReviewLabel,
  type ReviewedMove,
} from "@/src/chess/review";
import { isNullMoveToken } from "@/src/chess/null-move";
import { dividePhases, phaseAt, type GamePhase } from "@/src/chess/phases";
import { getNodeAt, variationPoints, type Path } from "@/src/chess/tree";
import { defaultEngineThreads, scoreNumber, type EngineInfo } from "@/src/engine/stockfish-client";
import { acquire } from "@/src/engine/shared-engine";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";

const LABEL_TEXT: Record<ReviewLabel, { name: string; mark: string; className: string }> = {
  brilliant: { name: "Brilliant", mark: "!!", className: "text-studio-accent" },
  great: { name: "Great", mark: "!", className: "text-studio-success" },
  book: { name: "Book", mark: "B", className: "text-studio-comment" },
  best: { name: "Best", mark: "★", className: "text-studio-fg" },
  interesting: { name: "Interesting", mark: "!?", className: "text-studio-fg" },
  inaccuracy: { name: "Inaccuracy", mark: "?!", className: "text-studio-warning-fg" },
  mistake: { name: "Mistake", mark: "?", className: "text-studio-warning-fg" },
  blunder: { name: "Blunder", mark: "??", className: "text-studio-danger" },
};

const KEY_MOMENTS = new Set<ReviewLabel>(["brilliant", "inaccuracy", "mistake", "blunder"]);

type MoveRow = ReviewedMove & {
  path: Path;
  san: string;
  side: "w" | "b";
  phase: GamePhase;
};

const PHASES: Array<{ id: GamePhase; name: string }> = [
  { id: "opening", name: "Opening" },
  { id: "middlegame", name: "Middlegame" },
  { id: "endgame", name: "Endgame" },
];

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
      for (let index = 0; index < moveCount; index += 1) {
        const before = scores[index];
        const after = scores[index + 1];
        const node = getNodeAt(board.tree, points[index + 1].path);
        if (!before || !after || !node || node.uci.length < 4 || isNullMoveToken(node.uci)) {
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
        });
        const negative = graded.label === "inaccuracy" || graded.label === "mistake" || graded.label === "blunder";
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
            });
          }
        }
        next.push({
          ...graded,
          label: mergeBookLabel(inBook[index], graded.label),
          path: points[index + 1].path,
          san: node.san,
          side,
          phase: phaseAt(division, index + 1),
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

  const whiteAccuracy = harmonicAccuracy(
    rows?.filter((row) => row.side === "w" && row.label !== "book").map((row) => row.accuracy) ?? [],
  );
  const blackAccuracy = harmonicAccuracy(
    rows?.filter((row) => row.side === "b" && row.label !== "book").map((row) => row.accuracy) ?? [],
  );
  const counts = countLabels(rows?.map((row) => row.label) ?? []);
  const moments = rows?.filter((row) => row.label != null && KEY_MOMENTS.has(row.label)) ?? [];
  const headers = board.headers;
  const whiteName = headers.White || "White";
  const blackName = headers.Black || "Black";

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
        {rows ? (
          <>
            <div className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 border-b border-studio-border-subtle px-3 py-2">
              <span className="text-caption text-studio-faint">Accuracy</span>
              <span className="text-right text-dense font-semibold tabular-nums">{whiteAccuracy ?? "—"}</span>
              <span className="text-right text-dense font-semibold tabular-nums">{blackAccuracy ?? "—"}</span>
              <span />
              <span className="truncate text-right text-caption text-studio-muted">{whiteName}</span>
              <span className="truncate text-right text-caption text-studio-muted">{blackName}</span>
            </div>
            {PHASES.map((phase) => {
              const white = harmonicAccuracy(
                rows.filter((row) => row.phase === phase.id && row.side === "w" && row.label !== "book").map((row) => row.accuracy),
              );
              const black = harmonicAccuracy(
                rows.filter((row) => row.phase === phase.id && row.side === "b" && row.label !== "book").map((row) => row.accuracy),
              );
              return (
                <div
                  key={phase.id}
                  className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 px-3 py-1 text-dense"
                >
                  <span className="text-caption text-studio-faint">{phase.name}</span>
                  <span className="text-right tabular-nums text-studio-muted">{white ?? "—"}</span>
                  <span className="text-right tabular-nums text-studio-muted">{black ?? "—"}</span>
                </div>
              );
            })}
            <ul className="border-b border-studio-border-subtle py-1">
              {REVIEW_LABELS.map((label) => {
                const text = LABEL_TEXT[label];
                const white = rows.filter((row) => row.side === "w" && row.label === label).length;
                const black = rows.filter((row) => row.side === "b" && row.label === label).length;
                return (
                  <li
                    key={label}
                    className="grid grid-cols-[1fr_28px_36px_36px] items-center gap-2 px-3 py-1 text-dense"
                  >
                    <span>{text.name}</span>
                    <span className={`text-center font-semibold ${text.className}`}>{text.mark}</span>
                    <span className="text-right tabular-nums text-studio-muted">{white}</span>
                    <span className="text-right tabular-nums text-studio-muted">{black}</span>
                  </li>
                );
              })}
            </ul>
            <div className="px-3 py-2 text-caption uppercase tracking-wide text-studio-faint">Key moments</div>
            {moments.length === 0 ? (
              <p className="px-3 pb-3 text-dense text-studio-faint">No mistakes in this line.</p>
            ) : (
              moments.map((row) => {
                if (!row.label) {
                  return null;
                }
                const text = LABEL_TEXT[row.label];
                return (
                  <button
                    key={row.path.join(".")}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-studio-hover"
                    onClick={() => goPath(row.path)}
                  >
                    <span className={`w-6 text-center font-semibold ${text.className}`}>{text.mark}</span>
                    <span className="font-medium">{formatSan(row.san, moveNotation, row.side)}</span>
                    <span className="ml-auto text-caption text-studio-faint">{text.name}</span>
                  </button>
                );
              })
            )}
            <p className="px-3 py-2 text-caption text-studio-faint">
              {counts.best} best {counts.best === 1 ? "move" : "moves"} kept the evaluation.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
