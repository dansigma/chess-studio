"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { REVIEW_PRESETS, estimateRemainingMs, type ReviewPreset } from "@/src/chess/review-engine";
import { buildReviewReport, evalSeries, keyMoments } from "@/src/chess/review-report";
import { buildReviewSummary } from "@/src/chess/review-share";
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
import { ReviewEvalChart, type ReviewChartMoment } from "./review/ReviewEvalChart";
import {
  filterKeyMoments,
  chartSummary,
  phaseSeparators,
  prevNextIndices,
  type SideFilter,
  type TierGroup,
} from "./review/review-chart";
import { useGameReview } from "./review/useGameReview";
import { WhyBlock } from "./review/WhyBlock";
import { buildReviewAnnotations, type ReviewAnnotationOptions } from "@/src/chess/review-annotate";
import { boardPngBlob, copyPngToClipboard, downloadPng } from "@/src/chess/copy-board-image";
import { getFenAt, getNodeAt, pathAlongLine, pathsEqual, variationPoints } from "@/src/chess/tree";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

const PRESET_IDS = Object.keys(REVIEW_PRESETS) as ReviewPreset[];

export function ReviewPanel() {
  const board = useActiveBoard();
  const setupMode = useStudioStore((state) => state.setupMode);
  const engineBuild = useStudioStore((state) => state.settings.engineBuild);
  const engineThreads = useStudioStore((state) => state.settings.engineThreads);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const goPath = useStudioStore((state) => state.goPath);
  const annotateReview = useStudioStore((state) => state.annotateReview);
  const undoReviewAnnotations = useStudioStore((state) => state.undoReviewAnnotations);
  const setStatus = useStudioStore((state) => state.setStatus);
  const locale = useStudioStore((state) => state.settings.locale);

  // SIG-968: annotate options dialog (NAGs always written, these toggle the
  // comment block lines). Local state — closing the dialog discards them.
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annotateEvals, setAnnotateEvals] = useState(true);
  const [annotateBestMove, setAnnotateBestMove] = useState(true);
  const [annotateKeyMomentsOnly, setAnnotateKeyMomentsOnly] = useState(false);
  // SIG-968: report-card PNG snapshot target. The ref wraps ReviewReportCard
  // only — the card is untouched, the panel owns the image/share buttons.
  const reportRef = useRef<HTMLDivElement | null>(null);

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

  // SIG-968: "Annotate game" reads the live tree for comments/NAGs (the pure
  // builder merges with user text) and resolves each fenBefore from the tree —
  // the rows own paths, never cached FENs. Undo consumes the one-level store
  // snapshot; the dialog closes on confirm either way (empty edits also mean
  // "nothing new to write", e.g. a re-annotate with identical options).
  const confirmAnnotate = () => {
    if (!displayRows) {
      return;
    }
    const active = useStudioStore.getState().active();
    const options: ReviewAnnotationOptions = {
      evals: annotateEvals,
      bestMove: annotateBestMove,
      keyMomentsOnly: annotateKeyMomentsOnly,
    };
    const edits = buildReviewAnnotations(
      locale,
      displayRows.map((row) => {
        const parent = points[row.index]?.path ?? [];
        return {
          path: row.path,
          label: row.label,
          afterPawns: row.afterPawns,
          bestPv: row.bestPv,
          playedUci: row.playedUci,
          fenBefore: getFenAt(active.tree, parent),
          comment: getNodeAt(active.tree, row.path)?.comment,
          nags: getNodeAt(active.tree, row.path)?.nags,
        };
      }),
      options,
    );
    setAnnotateOpen(false);
    annotateReview(edits);
    setStatus(tReview(locale, "annotate.done"));
  };
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

  // SIG-967: chart filter state lives in the component (resets on line change).
  const [sideFilter, setSideFilter] = useState<SideFilter>("both");
  const [tierGroup, setTierGroup] = useState<TierGroup>("all");

  // Reviewed-line identity: stable across cursor moves, changes on a new review.
  const lineKey = useMemo(
    () =>
      displayRows
        ? `${displayRows.length}|${displayRows[0]?.path.join(",") ?? ""}|${displayRows[displayRows.length - 1]?.path.join(",") ?? ""}`
        : "none",
    [displayRows],
  );
  const [lastLineKey, setLastLineKey] = useState(lineKey);
  if (lastLineKey !== lineKey) {
    // New reviewed line: reset filters during render (React-endorsed
    // derived-state pattern — avoids a cascading setState-in-effect).
    setLastLineKey(lineKey);
    setSideFilter("both");
    setTierGroup("all");
  }

  // Chart derivations: white-perspective eval per ply, phase separators,
  // filtered key moments joined with row data, cursor ply (null off-line).
  const series = useMemo(() => (displayRows ? evalSeries(displayRows) : []), [displayRows]);
  const separators = useMemo(() => (displayRows ? phaseSeparators(displayRows) : []), [displayRows]);
  const filteredMoments = useMemo(
    () => filterKeyMoments(moments, { side: sideFilter, tierGroup }),
    [moments, sideFilter, tierGroup],
  );
  const plyPaths = useMemo(
    () => [points[0]?.path ?? [], ...(displayRows ? displayRows.map((row) => row.path) : [])],
    [points, displayRows],
  );
  const currentIndex = useMemo(() => {
    const found = plyPaths.findIndex((path) => pathsEqual(path, board.path));
    return found === -1 ? null : found;
  }, [plyPaths, board.path]);
  const chartMoments = useMemo<ReviewChartMoment[]>(
    () =>
      filteredMoments.flatMap((row) =>
        row.label == null
          ? []
          : [
              {
                path: row.path,
                san: row.san,
                side: row.side,
                label: row.label,
                moveIndex: row.index,
                value: row.afterPawns,
                lossCp: row.lossCp,
              },
            ],
      ),
    [filteredMoments],
  );

  // Position within the filtered order; prev/next walk game order, no wrap.
  // Off-moment but on-line, anchor to the surrounding moments so Next jumps
  // forward instead of staying disabled.
  const selectedMomentIndex = useMemo(() => {
    const found = filteredMoments.findIndex((row) => pathsEqual(row.path, board.path));
    return found === -1 ? null : found;
  }, [filteredMoments, board.path]);
  const { prevMomentIndex, nextMomentIndex } = useMemo(() => {
    if (selectedMomentIndex != null) {
      const { prev, next } = prevNextIndices(filteredMoments.length, selectedMomentIndex);
      return { prevMomentIndex: prev, nextMomentIndex: next };
    }
    if (currentIndex == null) {
      return { prevMomentIndex: null, nextMomentIndex: null };
    }
    const nextIdx = chartMoments.findIndex((moment) => moment.moveIndex + 1 > currentIndex);
    if (nextIdx === -1) {
      return {
        prevMomentIndex: filteredMoments.length > 0 ? filteredMoments.length - 1 : null,
        nextMomentIndex: null,
      };
    }
    return { prevMomentIndex: nextIdx > 0 ? nextIdx - 1 : null, nextMomentIndex: nextIdx };
  }, [selectedMomentIndex, currentIndex, filteredMoments.length, chartMoments]);

  // `[` / `]` walk the filtered moments. Guard editable targets so typing
  // in notation inputs never navigates.
  useEffect(() => {
    if (!report) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key !== "[" && event.key !== "]") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const index = event.key === "[" ? prevMomentIndex : nextMomentIndex;
      if (index == null) {
        return;
      }
      const moment = filteredMoments[index];
      if (moment) {
        event.preventDefault();
        goPath(moment.path);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [report, prevMomentIndex, nextMomentIndex, filteredMoments, goPath]);

  const goToMoment = (index: number | null) => {
    if (index == null) {
      return;
    }
    const moment = filteredMoments[index];
    if (moment) {
      goPath(moment.path);
    }
  };

  // SIG-968: report export. The ref wraps ReviewReportCard only so the PNG
  // snapshots the card in the active theme (no buttons in frame). Copy falls
  // back to download when clipboard image write is unavailable (same grain
  // as MenuBarFileMenu copyBoardImage); the summary is localized plain text.
  const copyReportImage = async () => {
    const element = reportRef.current;
    if (!element) {
      return;
    }
    try {
      const blob = await boardPngBlob(element);
      try {
        await copyPngToClipboard(blob);
        setStatus(tReview(locale, "share.imageCopied"));
      } catch {
        downloadPng(blob, "chess-studio-review.png");
        setStatus(tReview(locale, "share.imageDownloaded"));
      }
    } catch {
      setStatus(tReview(locale, "share.imageFailed"));
    }
  };
  const downloadReportImage = async () => {
    const element = reportRef.current;
    if (!element) {
      return;
    }
    try {
      const blob = await boardPngBlob(element);
      downloadPng(blob, "chess-studio-review.png");
      setStatus(tReview(locale, "share.imageDownloaded"));
    } catch {
      setStatus(tReview(locale, "share.imageFailed"));
    }
  };
  const copyReviewSummary = async () => {
    if (!report) {
      return;
    }
    const text = buildReviewSummary(locale, {
      report,
      moments: filteredMoments,
      moveNotation,
      startFen: board.tree.startFen,
      openingName,
    });
    try {
      await navigator.clipboard.writeText(text);
      setStatus(tReview(locale, "share.copied"));
    } catch {
      setStatus(tReview(locale, "share.copyFailed"));
    }
  };

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
            <div className="border-b border-studio-border-subtle px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-caption uppercase tracking-wide text-studio-faint">
                  {tReview(locale, "chart.title")}
                </span>
                <span className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!board.reviewAnnotateUndo}
                    onClick={() => {
                      undoReviewAnnotations();
                      setStatus(tReview(locale, "annotate.undone"));
                    }}
                  >
                    {tReview(locale, "annotate.undo")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setAnnotateOpen(true)}>
                    {tReview(locale, "annotate.title")}
                  </Button>
                </span>
              </div>
              <ReviewEvalChart
                series={series}
                plyPaths={plyPaths}
                moments={chartMoments}
                separators={separators}
                currentIndex={currentIndex}
                moveNotation={moveNotation}
                locale={locale}
                ariaLabel={`${tReview(locale, "chart.ariaLabel")} — ${chartSummary(locale, {
                  plies: series.length,
                  moments: chartMoments.length,
                })}`}
                emptyText={tReview(locale, "chart.empty")}
                onSelect={goPath}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-caption text-studio-muted">
                  <span>{tReview(locale, "filter.side")}</span>
                  <select
                    value={sideFilter}
                    onChange={(event) => setSideFilter(event.target.value as SideFilter)}
                    className="h-6 rounded-md border border-studio-border-strong bg-studio-panel px-1 text-caption text-studio-fg"
                  >
                    <option value="both">{tReview(locale, "filter.sideBoth")}</option>
                    <option value="w">{tReview(locale, "filter.sideWhite")}</option>
                    <option value="b">{tReview(locale, "filter.sideBlack")}</option>
                  </select>
                </label>
                <label className="flex items-center gap-1 text-caption text-studio-muted">
                  <span>{tReview(locale, "filter.tierGroup")}</span>
                  <select
                    value={tierGroup}
                    onChange={(event) => setTierGroup(event.target.value as TierGroup)}
                    className="h-6 rounded-md border border-studio-border-strong bg-studio-panel px-1 text-caption text-studio-fg"
                  >
                    <option value="all">{tReview(locale, "filter.tierAll")}</option>
                    <option value="brilliant">{tReview(locale, "filter.tierBrilliant")}</option>
                    <option value="mistakes">{tReview(locale, "filter.tierMistakes")}</option>
                    <option value="misses">{tReview(locale, "filter.tierMisses")}</option>
                    <option value="blunders">{tReview(locale, "filter.tierBlunders")}</option>
                  </select>
                </label>
                <span className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={prevMomentIndex == null}
                    onClick={() => goToMoment(prevMomentIndex)}
                  >
                    {tReview(locale, "moments.prev")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={nextMomentIndex == null}
                    onClick={() => goToMoment(nextMomentIndex)}
                  >
                    {tReview(locale, "moments.next")}
                  </Button>
                </span>
              </div>
            </div>
            <div ref={reportRef}>
              <ReviewReportCard
                report={report}
                moments={filteredMoments}
                moveNotation={moveNotation}
                locale={locale}
                onSelectMoment={goPath}
                openingName={openingName}
                lineNote={lineNote}
                selectedPath={board.path}
                hasUnfilteredMoments={moments.length > 0}
              />
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-caption uppercase tracking-wide text-studio-faint">
                {tReview(locale, "share.title")}
              </span>
              <span className="flex flex-wrap items-center justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={copyReportImage}>
                  {tReview(locale, "share.copyImage")}
                </Button>
                <Button size="sm" variant="secondary" onClick={downloadReportImage}>
                  {tReview(locale, "share.downloadImage")}
                </Button>
                <Button size="sm" variant="secondary" onClick={copyReviewSummary}>
                  {tReview(locale, "share.copySummary")}
                </Button>
              </span>
            </div>
          </>
        ) : null}
      </div>
      {annotateOpen ? (
        <Dialog
          title={tReview(locale, "annotate.title")}
          onClose={() => setAnnotateOpen(false)}
          footer={<Button onClick={confirmAnnotate}>{tReview(locale, "annotate.confirm")}</Button>}
        >
          <div className="flex flex-col gap-1.5">
            {(
              [
                ["evals", annotateEvals, setAnnotateEvals],
                ["bestMove", annotateBestMove, setAnnotateBestMove],
                ["keyMomentsOnly", annotateKeyMomentsOnly, setAnnotateKeyMomentsOnly],
              ] as const
            ).map(([key, checked, setChecked]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-dense text-studio-fg">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setChecked(!checked)}
                  className="h-4 w-4 accent-studio-accent"
                />
                {tReview(locale, `annotate.${key}`)}
              </label>
            ))}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
