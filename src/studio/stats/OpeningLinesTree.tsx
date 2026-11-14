// SIG-1329: expandable opening-lines tree (Brancas/Pretas tabs, time-class /
// rated / date filters, worst-line highlight, "open line"), extracted from
// `MyStatsPanel`'s private `OpeningsTab` (SIG-1099). Pure view over
// `openingRows` + callbacks — no dependency on the signed-in user, so the
// Library player dossier can reuse it for an opponent.
"use client";

import type { ReactNode } from "react";
import { formatDecimal1, formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tMyGames } from "@/src/i18n/my-games-strings";
import type { OpeningDatePreset, OpeningRow, OpeningUiFilters } from "@/src/lib/my-games/opening-rows";

const OPENING_PRESETS: readonly OpeningDatePreset[] = ["m1", "m3", "m6", "m12", "all"];

const PRESET_STRING_KEYS = {
  m1: "myGames.openingsLastMonth",
  m3: "myGames.openingsLast3Months",
  m6: "myGames.openingsLast6Months",
  m12: "myGames.openingsLast12Months",
  all: "myGames.openingsAllTime",
} as const;

/** Optional extra content for one line row. */
export type OpeningLineExtra = {
  /** Rendered after the open-line button, in the first line. */
  trailing?: ReactNode;
  /** Rendered as a second line under the stats line. */
  secondLine?: ReactNode;
};

export type OpeningLinesTreeProps = {
  locale: SiteLocale;
  lineColor: "white" | "black";
  setLineColor: (color: "white" | "black") => void;
  uiFilters: OpeningUiFilters;
  setUiFilters: (filters: OpeningUiFilters) => void;
  timeClasses: string[];
  rows: OpeningRow[];
  totalGames: number;
  onToggle: (key: string) => void;
  onOpenLine: (path: string[]) => void;
  /** Overrides the open-line button label (default: `myGames.openingsOpenLine`). */
  openLineLabel?: string;
  renderRowExtra?: (row: OpeningRow) => OpeningLineExtra | null | undefined;
};

function TrendMarkers({
  locale,
  trend,
}: {
  locale: SiteLocale;
  trend: { m1: { games: number; scorePct: number } | null; m3: { games: number; scorePct: number } | null; m6: { games: number; scorePct: number } | null; m12: { games: number; scorePct: number } | null };
}) {
  const windows = [
    { label: "1", entry: trend.m1 },
    { label: "3", entry: trend.m3 },
    { label: "6", entry: trend.m6 },
    { label: "12", entry: trend.m12 },
  ] as const;
  return (
    <span className="flex shrink-0 items-center gap-1" title={tMyGames(locale, "myGames.openingsTrend")}>
      {windows.map(({ label, entry }) => (
        <span key={label} className="text-caption tabular-nums text-studio-faint" title={`${label}m: ${entry ? `${entry.scorePct}% (${entry.games})` : "—"}`}>
          <span
            aria-hidden
            className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: entry == null ? "var(--studio-disabled)" : entry.scorePct >= 50 ? "var(--studio-success)" : entry.scorePct >= 40 ? "var(--studio-warning-fg)" : "var(--studio-error)" }}
          />
          {entry == null ? "–" : `${entry.scorePct}%`}
        </span>
      ))}
    </span>
  );
}

export function OpeningLinesTree({
  locale,
  lineColor,
  setLineColor,
  uiFilters,
  setUiFilters,
  timeClasses,
  rows,
  totalGames,
  onToggle,
  onOpenLine,
  openLineLabel,
  renderRowExtra,
}: OpeningLinesTreeProps) {
  return (
    <section aria-labelledby="mystats-openings-tree" className="flex flex-col gap-2">
      <h2 id="mystats-openings-tree" className="mb-1 text-caption font-semibold text-studio-muted">
        {tMyGames(locale, "myGames.statsOpenings")}
      </h2>
      <div role="tablist" aria-label={tMyGames(locale, "myGames.statsOpenings")} className="flex gap-1">
        {(["white", "black"] as const).map((color) => (
          <button
            key={color}
            type="button"
            role="tab"
            aria-selected={lineColor === color}
            onClick={() => setLineColor(color)}
            className={`rounded px-2 py-0.5 text-caption ${lineColor === color ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
          >
            {tMyGames(locale, color === "white" ? "myGames.statsWhite" : "myGames.statsBlack")}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-caption text-studio-muted">
          {tMyGames(locale, "myGames.openingsTimeClass")}
          <select
            aria-label={tMyGames(locale, "myGames.openingsTimeClass")}
            value={uiFilters.timeClass}
            onChange={(event) => setUiFilters({ ...uiFilters, timeClass: event.target.value })}
            className="rounded bg-studio-hover px-1 py-0.5 text-caption text-studio-fg"
          >
            <option value="all">{tMyGames(locale, "myGames.openingsAll")}</option>
            {timeClasses.map((timeClass) => (
              <option key={timeClass} value={timeClass}>
                {timeClass}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-caption text-studio-muted">
          <input
            type="checkbox"
            checked={uiFilters.ratedOnly}
            onChange={(event) => setUiFilters({ ...uiFilters, ratedOnly: event.target.checked })}
          />
          {tMyGames(locale, "myGames.openingsRatedOnly")}
        </label>
        <select
          aria-label={tMyGames(locale, "myGames.openingsAllTime")}
          value={uiFilters.preset}
          onChange={(event) => setUiFilters({ ...uiFilters, preset: event.target.value as OpeningDatePreset })}
          className="rounded bg-studio-hover px-1 py-0.5 text-caption text-studio-fg"
        >
          {OPENING_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {tMyGames(locale, PRESET_STRING_KEYS[preset])}
            </option>
          ))}
        </select>
        <span className="text-caption tabular-nums text-studio-faint">
          {formatInteger(locale, totalGames)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-dense text-studio-faint">{tMyGames(locale, "myGames.openingsEmpty")}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => {
            const extra = renderRowExtra?.(row);
            return (
              <li key={row.key} className="border-t border-studio-border-subtle py-1" style={{ paddingLeft: row.depth * 12 }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-dense text-studio-fg">
                    {row.hasChildren ? (
                      <button
                        type="button"
                        aria-expanded={row.expanded}
                        aria-label={row.numberedSan}
                        onClick={() => onToggle(row.key)}
                        className="mr-1 text-studio-muted hover:text-studio-fg"
                      >
                        {row.expanded ? "▾" : "▸"}
                      </button>
                    ) : null}
                    {row.numberedSan}
                    {row.isWorst ? (
                      <span className="ml-1 rounded bg-studio-warning-bg px-1 text-caption text-studio-warning-fg">
                        {tMyGames(locale, "myGames.openingsWorst")}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenLine(row.path)}
                    className="shrink-0 text-caption font-medium text-studio-accent-text hover:underline"
                  >
                    {openLineLabel ?? tMyGames(locale, "myGames.openingsOpenLine")}
                  </button>
                  {extra?.trailing != null ? <span className="shrink-0">{extra.trailing}</span> : null}
                </div>
                <div className="flex items-center gap-2 text-caption tabular-nums text-studio-faint">
                  <span>
                    {formatInteger(locale, row.node.games)} · {formatInteger(locale, row.node.scorePct)}%
                  </span>
                  <span title={tMyGames(locale, "myGames.openingsAccuracy")}>
                    {row.node.avgAccuracy == null ? "–" : formatDecimal1(locale, row.node.avgAccuracy)}
                  </span>
                  <TrendMarkers locale={locale} trend={row.node.trend} />
                </div>
                {extra?.secondLine != null ? <div className="text-caption text-studio-faint">{extra.secondLine}</div> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
