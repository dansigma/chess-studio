"use client";

import { RotateCcw } from "lucide-react";
import { lineToSan } from "@/src/chess/explain/gather";
import { formatSan, type MoveNotation } from "@/src/chess/move-notation";
import { retryContextText, tierName, tReview } from "@/src/chess/review-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { moveNumberForPath } from "@/src/chess/tree";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "../ui/Button";

/** The small "Retry" button on a key-moment row and at the end of the Why? body. */
export function RetryButton({
  locale,
  label,
  onClick,
}: {
  locale: SiteLocale;
  /** Accessible name, e.g. "Retry move 14, Nf3". */
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-retry-button=""
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-caption text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg focus-visible:outline-2 focus-visible:outline-studio-accent"
      onClick={(event) => {
        // The row itself navigates; the button only starts the retry.
        event.stopPropagation();
        onClick();
      }}
    >
      <RotateCcw size={11} aria-hidden />
      <span>{tReview(locale, "retry.button")}</span>
    </button>
  );
}

/**
 * SIG-1209: replaces the report summary at the top of the Game Review panel
 * while a retry is open. Three single-line rows (context, message, actions) so
 * it fits the default ~200 px bottom panel.
 */
export function RetryCard({
  locale,
  moveNotation,
  startFen,
}: {
  locale: SiteLocale;
  moveNotation: MoveNotation;
  startFen: string;
}) {
  const retry = useStudioStore((state) => state.retry);
  const retryHint = useStudioStore((state) => state.retryHint);
  const revealRetry = useStudioStore((state) => state.revealRetry);
  const nextRetry = useStudioStore((state) => state.nextRetry);
  const exitRetry = useStudioStore((state) => state.exitRetry);
  const insertEngineLines = useStudioStore((state) => state.insertEngineLines);
  if (!retry.active) {
    return null;
  }
  const { exercise } = retry;
  const side = exercise.fen.split(" ")[1] === "b" ? "b" : "w";
  const solution = lineToSan(exercise.fen, exercise.solutionUci);
  const first = solution[0];
  const solutionSide = (index: number) => ((index % 2 === 0) === (side === "w") ? "w" : "b");
  const context = retryContextText(locale, {
    side,
    tier: tierName(locale, exercise.label),
    moveNumber: moveNumberForPath(startFen, retry.parentPath.length + 1),
  });

  let message: string;
  let tone = "text-studio-fg";
  switch (retry.status) {
    case "wrong":
      message = tReview(locale, retry.wrongGameMove ? "retry.wrongGameMove" : "retry.wrong");
      tone = "text-studio-warning-fg";
      break;
    case "continuing":
      message = tReview(locale, "retry.continuing");
      break;
    case "solved":
      message =
        retry.missed || retry.hintUsed
          ? tReview(locale, "retry.solvedAfterMiss")
          : tReview(locale, "retry.solvedFirst").replace(
              "{san}",
              first ? formatSan(first.san, moveNotation, side) : exercise.solutionUci[0],
            );
      tone = "text-studio-success";
      break;
    case "revealed":
      message = tReview(locale, "retry.revealed").replace(
        "{line}",
        solution.map((entry, index) => formatSan(entry.san, moveNotation, solutionSide(index))).join(" "),
      );
      break;
    default:
      message = tReview(locale, "retry.thinking");
  }

  const done = retry.status === "solved" || retry.status === "revealed";
  const hasNext = retry.queue.some((target) => target.index > retry.momentIndex);
  return (
    <section
      aria-label={tReview(locale, "retry.region")}
      data-retry-card=""
      data-retry-status={retry.status}
      className="border-b border-studio-border-subtle"
    >
      <div className="flex min-w-0 items-baseline gap-2 px-3 pt-1.5">
        <span className="shrink-0 text-dense font-semibold">{context}</span>
        {retry.freePractice ? (
          <span data-retry-free className="min-w-0 truncate text-caption text-studio-faint">
            {tReview(locale, "retry.freePractice")}
          </span>
        ) : null}
      </div>
      <p role="status" data-retry-message className={`truncate px-3 py-1 text-body ${tone}`} title={message}>
        {message}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1.5">
        {done ? (
          <>
            <Button size="sm" variant="primary" disabled={!hasNext} onClick={() => nextRetry()}>
              {tReview(locale, "retry.nextMistake")}
            </Button>
            {retry.status === "revealed" ? (
              <Button size="sm" onClick={() => insertEngineLines(exercise.fen, [exercise.bestPv])}>
                {tReview(locale, "retry.insert")}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button size="sm" disabled={retry.awaitingReply} onClick={retryHint}>
              {tReview(locale, "retry.hint")}
            </Button>
            <Button size="sm" onClick={revealRetry}>
              {tReview(locale, "retry.showSolution")}
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" title="Esc" onClick={() => exitRetry()}>
          {tReview(locale, "retry.exit")}
        </Button>
      </div>
    </section>
  );
}
