"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { explainMove, isHighlightLabel } from "@/src/chess/explain/explain-move";
import { lineToSan } from "@/src/chess/explain/gather";
import type { ExplainLocale } from "@/src/chess/explain/locale";
import { renderExplanation, uiText } from "@/src/chess/explain/render";
import { formatSan, type MoveNotation } from "@/src/chess/move-notation";
import { REVIEW_TIERS } from "@/src/chess/review-tiers";
import { tierName } from "@/src/chess/review-strings";
import type { ReviewMoveRow } from "./useGameReview";
import { marksForStatement } from "./why-marks";
import { useWhyHover } from "./useWhyHover";

/** Plies of the engine line shown as clickable moves. */
const LINE_PLIES = 8;

type Props = {
  row: ReviewMoveRow;
  fenBefore: string;
  fenAfter: string;
  /** The opponent's previous move, for recapture wording. */
  previous: { to: string; capture: boolean } | null;
  locale: ExplainLocale;
  moveNotation: MoveNotation;
  /** Opens the engine line as a variation and goes to its `ply`-th move. */
  onPlayLine: (ucis: string[], ply: number) => void;
};

function moveNumberLabel(fen: string, ply: number): string | null {
  const fields = fen.split(" ");
  const blackFirst = fields[1] === "b";
  const full = Number.parseInt(fields[5] ?? "1", 10) || 1;
  const isWhite = (ply % 2 === 0) !== blackFirst;
  const number = full + Math.floor((ply + (blackFirst ? 1 : 0)) / 2);
  if (isWhite) {
    return `${number}.`;
  }
  return ply === 0 ? `${number}...` : null;
}

export function WhyBlock({ row, fenBefore, fenAfter, previous, locale, moveNotation, onPlayLine }: Props) {
  const [open, setOpen] = useState(() => isHighlightLabel(row.label));
  const setHover = useWhyHover(fenBefore, fenAfter);

  const mover = row.side;
  const sign = mover === "w" ? 1 : -1;
  // Computed lazily — only the selected move, and only while the block is open.
  const rendered = useMemo(() => {
    if (!open) {
      return null;
    }
    const explanation = explainMove({
      fenBefore,
      playedUci: row.playedUci,
      bestPv: row.bestPv,
      label: row.label,
      lossCp: row.lossCp,
      previous,
      evals: { bestPawns: row.beforePawns * sign, playedPawns: row.afterPawns * sign },
    });
    return explanation
      ? renderExplanation(locale, explanation, { formatSan: (san) => formatSan(san, moveNotation, mover) })
      : null;
  }, [open, fenBefore, row, previous, locale, moveNotation, mover, sign]);

  const line = useMemo(() => (open ? lineToSan(fenBefore, row.bestPv.slice(0, LINE_PLIES)) : []), [open, fenBefore, row.bestPv]);
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
        <span className="text-dense font-semibold">{uiText(locale, "why")}</span>
        <span className="ml-auto flex items-center gap-1.5 text-caption text-studio-faint">
          <span className="font-medium text-studio-fg">{formatSan(row.san, moveNotation, mover)}</span>
          {tier && row.label ? <span className={tier.className}>{tierName(locale, row.label)}</span> : null}
        </span>
      </button>
      {open && rendered ? (
        <div className="space-y-3 px-3 pb-3">
          <p className="text-dense text-studio-muted">{rendered.summary}</p>
          {rendered.confident ? (
            rendered.sections.map((section) => (
              <div key={section.id}>
                <div className="pb-1 text-caption uppercase tracking-wide text-studio-faint">{section.title}</div>
                <ul className="space-y-0.5">
                  {section.items.map((item, index) => {
                    const marks = marksForStatement(item.statement, section.id);
                    const hover = () => setHover({ marks, at: item.statement.highlight.at });
                    return (
                      <li
                        key={`${item.statement.id}-${index}`}
                        tabIndex={0}
                        className="cursor-default rounded px-1.5 py-1 text-dense hover:bg-studio-hover focus:bg-studio-hover focus:outline-none"
                        onMouseEnter={hover}
                        onMouseLeave={() => setHover(null)}
                        onFocus={hover}
                        onBlur={() => setHover(null)}
                      >
                        {item.text}
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
                  const number = moveNumberLabel(fenBefore, ply);
                  const side = (ply % 2 === 0) === (mover === "w") ? "w" : "b";
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
        </div>
      ) : null}
    </div>
  );
}
