"use client";

import { useMemo } from "react";
import { REVIEW_PRESETS, estimateRemainingMs, type ReviewPreset } from "@/src/chess/review-engine";
import { buildReviewReport, keyMoments } from "@/src/chess/review-report";
import {
  formatReviewEta,
  reviewCancelledText,
  reviewFailedText,
  reviewPresetOption,
  reviewProgressText,
  reviewResumeText,
  tReview,
} from "@/src/chess/review-strings";
import { lookupBookOpening } from "@/src/lib/opening-book";
import { resolveOpeningName } from "@/src/lib/opening-names";
import { ReviewReportCard } from "./review/ReviewReportCard";
import { useGameReview } from "./review/useGameReview";
import { WhyBlock } from "./review/WhyBlock";
import { getNodeAt, pathAlongLine, pathsEqual, variationPoints } from "@/src/chess/tree";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";

const PRESET_IDS = Object.keys(REVIEW_PRESETS) as ReviewPreset[];

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
  const {
    preset,
    setPreset,
    running,
    cancelled,
    failed,
    progress,
    rows,
    cached,
    start,
    cancel,
    resumable,
    partialDone,
    partialTotal,
    resume,
    previewRows,
  } = useGameReview({
    tree: board.tree,
    points,
    engineBuild,
    engineThreads,
    setupMode,
  });

  // Finished report, else the read-only partial preview (SIG-966).
  const displayRows = rows ?? previewRows;

  // "Why?" follows the board: it explains the reviewed move the board is on.
  const selected = useMemo(
    () => displayRows?.find((row) => pathsEqual(row.path, board.path)) ?? null,
    [displayRows, board.path],
  );
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

  const report = useMemo(
    () => (displayRows ? buildReviewReport(displayRows, board.headers, locale) : null),
    [displayRows, board.headers, locale],
  );
  const moments = useMemo(() => (displayRows ? keyMoments(displayRows) : []), [displayRows]);
  const openingName = useMemo(() => {
    if (!displayRows) {
      return null;
    }
    for (let index = points.length - 1; index > 0; index -= 1) {
      const opening = lookupBookOpening(points[index].fen);
      if (opening?.name) {
        const name = resolveOpeningName(opening.eco, opening.name, locale);
        return opening.eco ? `${opening.eco} · ${name}` : name;
      }
    }
    return null;
  }, [displayRows, points, locale]);
  const lineNote = points[points.length - 1]?.path.some((index) => index !== 0) ? tReview(locale, "panel.lineNote") : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-studio-panel text-body text-studio-fg">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-studio-border-subtle px-3 py-2">
        <span className="text-dense font-semibold">{tReview(locale, "panel.title")}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select
            aria-label={tReview(locale, "panel.depthLabel")}
            value={preset}
            disabled={running}
            onChange={(event) => setPreset(event.target.value as ReviewPreset)}
            className="h-6 rounded-md border border-studio-border-strong bg-studio-panel px-1 text-caption text-studio-fg disabled:opacity-60"
          >
            {PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {reviewPresetOption(locale, id, REVIEW_PRESETS[id].depth)}
              </option>
            ))}
          </select>
          {running ? (
            <Button size="sm" onClick={cancel}>
              {tReview(locale, "panel.cancel")}
            </Button>
          ) : resumable ? (
            <>
              <Button size="sm" variant="primary" disabled={setupMode} onClick={resume}>
                {reviewResumeText(locale, { done: partialDone, total: partialTotal })}
              </Button>
              <Button size="sm" variant="secondary" disabled={setupMode || points.length < 2} onClick={start}>
                {tReview(locale, "panel.reviewAgain")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="primary" disabled={setupMode || points.length < 2} onClick={start}>
              {rows ? tReview(locale, "panel.reviewAgain") : tReview(locale, "panel.reviewGame")}
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {points.length < 2 ? (
          <p className="px-3 py-4 text-dense text-studio-faint">{tReview(locale, "panel.empty")}</p>
        ) : null}
        {setupMode ? <p className="px-3 py-2 text-caption text-studio-warning-fg">{tReview(locale, "panel.pausedSetup")}</p> : null}
        {running && !setupMode ? (
          <div className="px-3 py-3 text-dense text-studio-muted">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span>
                {reviewProgressText(locale, { depth: REVIEW_PRESETS[preset].depth, done: progress.done, total: progress.total })}
              </span>
              <span className="text-caption text-studio-faint">
                {(() => {
                  const remaining = estimateRemainingMs(progress);
                  return remaining == null ? tReview(locale, "panel.estimating") : formatReviewEta(locale, remaining);
                })()}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={tReview(locale, "panel.progressLabel")}
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
        {failed && !running ? (
          <p className="px-3 py-3 text-dense text-studio-warning-fg">
            {reviewFailedText(locale, { done: progress.done, total: progress.total })}
          </p>
        ) : null}
        {cancelled && !running && !rows ? (
          <p className="px-3 py-3 text-dense text-studio-muted">
            {reviewCancelledText(locale, { done: progress.done, total: progress.total })}
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
          <>
            {cached ? (
              <p className="px-3 pt-2 text-caption text-studio-faint">{tReview(locale, "panel.savedReview")}</p>
            ) : null}
            {!rows && previewRows ? (
              <p className="px-3 pt-2 text-caption text-studio-faint">{tReview(locale, "panel.partialNote")}</p>
            ) : null}
            <ReviewReportCard
              report={report}
              moments={moments}
              moveNotation={moveNotation}
              locale={locale}
              onSelectMoment={goPath}
              openingName={openingName}
              lineNote={lineNote}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
