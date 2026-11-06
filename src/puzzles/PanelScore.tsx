"use client";

import { Flame, X } from "lucide-react";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
import type { PuzzleMode } from "./types";

/**
 * SIG-1248: the panel's hero number. Rated and daily lead with the rating and
 * its session delta; rush and mistakes lead with the solved count (SIG-1097:
 * never XP). Total XP lives in the level line below, with a label. The spaces
 * between the spans keep the text readable as "Rating 1,889 +16".
 */
export function PanelScore({
  mode,
  locale,
  rating,
  delta,
  solved,
  streak,
  strikes,
  strikeLimit,
}: {
  mode: PuzzleMode;
  locale: SiteLocale;
  rating: number;
  delta: number | null;
  solved: number;
  streak: number;
  strikes: number;
  strikeLimit: number;
}) {
  const ratingMode = mode === "rated" || mode === "daily";
  return (
    <div className="flex items-end justify-between gap-3" data-testid="panel-score">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-body text-studio-muted">
          {tPuzzle(locale, ratingMode ? "puzzle.panel.rating" : "puzzle.panel.solved")}
        </span>{" "}
        <span className="text-4xl font-semibold tabular-nums leading-none text-studio-fg" data-testid="panel-hero">
          {formatInteger(locale, ratingMode ? rating : solved)}
        </span>
        {ratingMode && delta !== null && delta !== 0 ? (
          <>
            {" "}
            <span
              className={`text-title font-semibold tabular-nums ${
                delta > 0 ? "text-studio-success" : "text-studio-warning-fg"
              }`}
              data-testid="panel-delta"
            >
              {delta > 0 ? `+${formatInteger(locale, delta)}` : formatInteger(locale, delta)}
            </span>
          </>
        ) : null}
      </p>
      {mode === "rush" ? (
        <p
          className="flex items-center gap-1"
          aria-label={tPuzzle(locale, "puzzle.panel.missesAria", { strikes, total: strikeLimit })}
        >
          {Array.from({ length: strikeLimit }, (_, index) => (
            <X
              key={index}
              className={`size-4 ${index < strikes ? "text-red-400" : "text-studio-muted opacity-35"}`}
              aria-hidden
            />
          ))}
        </p>
      ) : (
        <p className="flex items-center gap-1 text-title font-semibold tabular-nums text-studio-fg">
          <Flame className="size-5 text-orange-400" aria-hidden />
          {streak}
        </p>
      )}
    </div>
  );
}
