"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { explainMove } from "@/src/chess/explain/explain-move";
import { lineToSan } from "@/src/chess/explain/gather";
import type { ExplainLocale } from "@/src/chess/explain/locale";
import { renderExplanation, uiText } from "@/src/chess/explain/render";
import { formatSan, type MoveNotation } from "@/src/chess/move-notation";
import { REVIEW_TIERS } from "@/src/chess/review-tiers";
import { retryButtonLabel, tierName, tReview } from "@/src/chess/review-strings";
import { moveNumberForPath, plyColor } from "@/src/chess/tree";
import type { ReviewMoveRow } from "./useGameReview";
import { RetryButton } from "./RetryCard";
import { marksForStatement } from "./why-marks";
import { useWhyHover } from "./useWhyHover";

/** Plies of the engine line shown as clickable moves. */
const LINE_PLIES = 8;

type Props = {
  row: ReviewMoveRow;
  startFen: string;
  fenBefore: string;
  fenAfter: string;
  /** The opponent's previous move, for recapture wording. */
  previous: { to: string; capture: boolean } | null;
  locale: ExplainLocale;
  moveNotation: MoveNotation;
  /** Opens the engine line as a variation and goes to its `ply`-th move. */
  onPlayLine: (ucis: string[], ply: number) => void;
  /** SIG-1209: starts a retry of this move; the button sits at the end of the body. */
  onRetry?: () => void;
};

function moveNumberLabel(startFen: string, basePathLength: number, ply: number): string | null {
  const step = basePathLength + ply;
  const color = plyColor(startFen, step);
  const number = moveNumberForPath(startFen, step);
  if (color === "w") {
    return `${number}.`;
  }
  return ply === 0 ? `${number}...` : null;
}

/**
 * The explanation itself, without a header: summary, sections and the clickable
 * best line. Rendered inline under a key-moment row and inside the collapsible
 * {@link WhyBlock}. Mount it only while it is visible — it computes on mount.
 */
export function WhyBody({ row, startFen, fenBefore, fenAfter, previous, locale, moveNotation, onPlayLine, onRetry }: Props) {
  const { isPinned, bindItem, clearHover } = useWhyHover(
    fenBefore,
    fenAfter,
    `${row.path.join(".")}:${row.playedUci}:${row.bestPv[0] ?? ""}`,
  );

  const mover = row.side;
  const sign = mover === "w" ? 1 : -1;
  // Computed lazily — only for the visible move.
  const rendered = useMemo(() => {
    const explanation = explainMove({
      fenBefore,
      playedUci: row.playedUci,
      bestPv: row.bestPv,
      label: row.label,
      lossCp: row.lossCp,
      previous,
      evals: {
        bestPawns: row.beforePawns == null ? null : row.beforePawns * sign,
        playedPawns: row.afterPawns == null ? null : row.afterPawns * sign,
      },
    });
    return explanation
      ? renderExplanation(locale, explanation, { formatSan: (san) => formatSan(san, moveNotation, mover) })
      : null;
  }, [fenBefore, row, previous, locale, moveNotation, mover, sign]);

  const line = useMemo(() => lineToSan(fenBefore, row.bestPv.slice(0, LINE_PLIES)), [fenBefore, row.bestPv]);

  if (!rendered) {
    return null;
  }
  return (
    <div className="space-y-3 px-3 pb-3">
      <p className="text-dense text-studio-muted">{rendered.summary}</p>
      {rendered.confident ? (
        rendered.sections.map((section) => (
          <div key={section.id}>
            <div className="pb-1 text-caption uppercase tracking-wide text-studio-faint">{section.title}</div>
            <ul className="space-y-0.5" onMouseLeave={clearHover}>
              {section.items.map((item, index) => {
                const id = `${section.id}:${item.statement.id}-${index}`;
                const marks = marksForStatement(item.statement, section.id);
                const pinned = isPinned(id);
                return (
                  <li key={`${item.statement.id}-${index}`}>
                    <button
                      type="button"
                      className={`w-full rounded px-1.5 py-1 text-left text-dense hover:bg-studio-hover focus-visible:bg-studio-hover focus:outline-none ${
                        pinned ? "bg-studio-accent-soft ring-1 ring-inset ring-studio-accent" : ""
                      }`}
                      {...bindItem(id, { marks, at: item.statement.highlight.at })}
                    >
                      {item.text}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      ) : (
        <p className="text-caption text-studio-faint">{uiText(locale, "engineOnly")}</p>
      )}
      {line.length > 0 ? (
        <div>
          <div className="pb-1 text-caption uppercase tracking-wide text-studio-faint">{uiText(locale, "bestLine")}</div>
          <div className="flex flex-wrap gap-x-1 gap-y-0.5">
            {line.map((entry, ply) => {
              const number = moveNumberLabel(startFen, row.path.length, ply);
              const side = plyColor(startFen, row.path.length + ply);
              return (
                <button
                  key={`${entry.uci}-${ply}`}
                  type="button"
                  className="rounded px-1 text-dense text-studio-fg hover:bg-studio-hover"
                  onClick={() => onPlayLine(row.bestPv.slice(0, line.length), ply)}
                >
                  {number ? <span className="text-studio-faint">{number}</span> : null}
                  {formatSan(entry.san, moveNotation, side)}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-caption text-studio-faint">{uiText(locale, "noLine")}</p>
      )}
      {onRetry ? (
        <div>
          <RetryButton
            locale={locale}
            label={retryButtonLabel(locale, moveNotation, {
              moveNumber: moveNumberForPath(startFen, row.path.length),
              san: row.san,
              side: row.side,
            })}
            onClick={onRetry}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Collapsed-by-default "Current move" row for a reviewed move that is not a key
 * moment (key moments show {@link WhyBody} inline in the list).
 */
export function WhyBlock(props: Props) {
  const [open, setOpen] = useState(false);
  const { row, locale, moveNotation } = props;
  const tier = row.label ? REVIEW_TIERS[row.label] : null;
  return (
    <div className="border-b border-studio-border-subtle">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-studio-hover"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        <span className="text-dense font-semibold">{tReview(locale, "moments.currentMove")}</span>
        <span className="ml-auto flex items-center gap-1.5 text-caption text-studio-faint">
          <span className="font-medium text-studio-fg">{formatSan(row.san, moveNotation, row.side)}</span>
          {tier && row.label ? <span className={tier.className}>{tierName(locale, row.label)}</span> : null}
        </span>
      </button>
      {open ? <WhyBody {...props} /> : null}
    </div>
  );
}
