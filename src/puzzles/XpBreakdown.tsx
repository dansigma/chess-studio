"use client";

import { Crown } from "lucide-react";
import { formatInteger, formatMultiplier } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
import type { LevelProgress, XpBreakdown } from "./xp";

/**
 * SIG-1234: "+42 XP · 20 solved × 1.4 hard × 1.5 fast". Pure so the unit tests
 * can pin the sentence in both locales; the component below just renders it.
 */
export function xpBreakdownText(locale: SiteLocale, breakdown: XpBreakdown): string {
  const total = tPuzzle(locale, "puzzle.xp.total", { total: formatInteger(locale, breakdown.total) });
  if (breakdown.base === 0) {
    return `${total} · ${tPuzzle(locale, "puzzle.xp.missed")}`;
  }
  const parts = [tPuzzle(locale, "puzzle.xp.base", { base: formatInteger(locale, breakdown.base) })];
  for (const factor of breakdown.factors) {
    const value = formatMultiplier(locale, factor.value);
    const key =
      factor.key === "difficulty"
        ? factor.value > 1
          ? "puzzle.xp.factor.difficultyUp"
          : "puzzle.xp.factor.difficultyDown"
        : factor.key === "speed"
          ? "puzzle.xp.factor.speed"
          : "puzzle.xp.factor.firstTry";
    parts.push(tPuzzle(locale, key, { value }));
  }
  return `${total} · ${parts.join(" ")}`;
}

/**
 * Lives inside the panel's aria-live region, so a screen reader announces the
 * whole sentence when it appears. Colours are existing tokens only.
 */
export function XpBreakdownLine({
  breakdown,
  awarded,
  locale,
}: {
  breakdown: XpBreakdown;
  awarded: boolean;
  locale: SiteLocale;
}) {
  return (
    <div className="mt-2 border-t border-studio-border pt-2" data-testid="xp-breakdown">
      <p className="text-body tabular-nums text-studio-fg">{xpBreakdownText(locale, breakdown)}</p>
      {!awarded && breakdown.total > 0 ? (
        <p className="mt-0.5 text-body text-studio-muted">{tPuzzle(locale, "puzzle.xp.practice")}</p>
      ) : null}
    </div>
  );
}

/** Level badge, progress bar and "XP to next level", shared by panel and dashboard. */
export function LevelBar({
  level,
  locale,
  compact = false,
  totalXp,
}: {
  level: LevelProgress;
  locale: SiteLocale;
  compact?: boolean;
  /** SIG-1248: when given, the caption becomes "Level 14 · 11,747 XP · 1,045 to level 15" at body size. */
  totalXp?: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-caption tabular-nums text-studio-muted">
          <Crown className="size-3 text-studio-warning-fg" aria-hidden />
          {level.level}
        </span>
        <div
          role="progressbar"
          aria-label={tPuzzle(locale, "puzzle.level.progressAria", {
            level: level.level,
            into: formatInteger(locale, level.into),
            span: formatInteger(locale, level.span),
          })}
          aria-valuemin={0}
          aria-valuemax={level.span}
          aria-valuenow={level.into}
          className={`${compact ? "h-1.5 w-24" : "h-2 flex-1"} overflow-hidden rounded-full bg-studio-bg`}
        >
          <div
            className="h-full rounded-full bg-studio-success transition-[width] duration-500"
            style={{ width: `${(level.into / level.span) * 100}%` }}
          />
        </div>
        {compact ? null : (
          <span className="inline-flex items-center gap-1 text-caption tabular-nums text-studio-muted">
            <Crown className="size-3 text-studio-warning-fg" aria-hidden />
            {level.level + 1}
          </span>
        )}
      </div>
      {totalXp === undefined ? (
        <p className="mt-1 text-caption tabular-nums text-studio-muted">
          {tPuzzle(locale, "puzzle.level.toNext", {
            xp: formatInteger(locale, level.toNext),
            level: level.level + 1,
          })}
        </p>
      ) : (
        <p className="mt-2 text-body tabular-nums text-studio-muted" data-testid="level-line">
          {tPuzzle(locale, "puzzle.level.line", {
            level: level.level,
            total: formatInteger(locale, totalXp),
            xp: formatInteger(locale, level.toNext),
            next: level.level + 1,
          })}
        </p>
      )}
    </div>
  );
}
