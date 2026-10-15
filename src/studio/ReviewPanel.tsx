"use client";

import { useMemo } from "react";
import { REVIEW_PRESETS, estimateRemainingMs, type ReviewPreset } from "@/src/chess/review-engine";
import { buildReviewReport, keyMoments } from "@/src/chess/review-report";
import { lookupBookOpening } from "@/src/lib/opening-book";
import { ReviewReportCard } from "./review/ReviewReportCard";
import { useGameReview } from "./review/useGameReview";
import { WhyBlock } from "./review/WhyBlock";
import { getNodeAt, pathAlongLine, pathsEqual, variationPoints } from "@/src/chess/tree";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";

const PRESET_IDS = Object.keys(REVIEW_PRESETS) as ReviewPreset[];

function formatEta(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60 ? `~${seconds}s left` : `~${Math.floor(seconds / 60)}m ${seconds % 60}s left`;
}

export function ReviewPanel() {
  const board = useActiveBoard();
  const setupMode = useStudioStore((state) => state.setupMode);
  const engineBuild = useStudioStore((state) => state.settings.engineBuild);
  const engineThreads = useStudioStore((state) => state.settings.engineThreads);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const goPath = useStudioStore((state) => state.goPath);
  const locale = useStudioStore((state) => state.settings.locale);

  const points = useMemo(
    () => variationPoints(board.tree, board.path),
    [board.tree, board.path],
  );
  const { preset, setPreset, running, cancelled, progress, rows, start, cancel } = useGameReview({
    tree: board.tree,
    points,
    engineBuild,
    engineThreads,
    setupMode,
  });

  // "Why?" follows the board: it explains the reviewed move the board is on.
  const selected = useMemo(() => rows?.find((row) => pathsEqual(row.path, board.path)) ?? null, [rows, board.path]);
  const selectedContext = useMemo(() => {
    if (!selected) {
      return null;
    }
    const before = points[selected.index];
    const after = points[selected.index + 1];
    if (!before || !after) {
      return null;
    }
    const previousUci = getNodeAt(board.tree, before.path)?.uci ?? "";
    return {
      fenBefore: before.fen,
      fenAfter: after.fen,
      parentPath: before.path,
      previous: before.san ? { to: previousUci.slice(2, 4), capture: before.san.includes("x") } : null,
    };
  }, [selected, points, board.tree]);

  const playLine = (ucis: string[], ply: number) => {
    if (!selectedContext) {
      return;
    }
    const { parentPath, fenBefore } = selectedContext;
    const store = useStudioStore.getState();
    // Already in the notation (e.g. the played move is the engine's): just go there.
    const existing = pathAlongLine(store.active().tree, parentPath, ucis.slice(0, ply + 1));
    if (existing) {
      store.goPath(existing);
      return;
    }
    store.goPath(parentPath);
    store.insertEngineLines(fenBefore, [ucis]);
    const target = pathAlongLine(useStudioStore.getState().active().tree, parentPath, ucis.slice(0, ply + 1));
    if (target) {
      useStudioStore.getState().goPath(target);
    }
  };

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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-studio-border-subtle px-3 py-2">
        <span className="text-dense font-semibold">Game Review</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            aria-label="Review depth"
            value={preset}
            disabled={running}
            onChange={(event) => setPreset(event.target.value as ReviewPreset)}
            className="h-6 rounded-md border border-studio-border-strong bg-studio-panel px-1 text-caption text-studio-fg disabled:opacity-60"
          >
            {PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {REVIEW_PRESETS[id].label} (depth {REVIEW_PRESETS[id].depth})
              </option>
            ))}
          </select>
          {running ? (
            <Button size="sm" onClick={cancel}>
              Cancel
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabled={setupMode || points.length < 2} onClick={start}>
              {rows ? "Review again" : "Review game"}
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {points.length < 2 ? (
          <p className="px-3 py-4 text-dense text-studio-faint">Play or open a game to review it.</p>
        ) : null}
        {setupMode ? <p className="px-3 py-2 text-caption text-studio-warning-fg">Paused in setup.</p> : null}
        {running && !setupMode ? (
          <div className="px-3 py-3 text-dense text-studio-muted">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span>
                Scoring moves at depth {REVIEW_PRESETS[preset].depth}… {progress.done}/{progress.total}
              </span>
              <span className="text-caption text-studio-faint">
                {(() => {
                  const remaining = estimateRemainingMs(progress);
                  return remaining == null ? "estimating…" : formatEta(remaining);
                })()}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Review progress"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              className="h-1.5 overflow-hidden rounded-full bg-studio-border-subtle"
            >
              <div
                className="h-full bg-studio-accent"
                style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : null}
        {cancelled && !running && !rows ? (
          <p className="px-3 py-3 text-dense text-studio-muted">
            Review cancelled at {progress.done}/{progress.total} positions.
          </p>
        ) : null}
        {selected && selectedContext && !running ? (
          <WhyBlock
            key={selected.path.join(".")}
            row={selected}
            fenBefore={selectedContext.fenBefore}
            fenAfter={selectedContext.fenAfter}
            previous={selectedContext.previous}
            locale={locale}
            moveNotation={moveNotation}
            onPlayLine={playLine}
          />
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
