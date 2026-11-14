// SIG-1329: results-by-opening section (Brancas/Pretas tabs, sort, min games,
// per-opening table), extracted from `MyStatsPanel`. Pure view over aggregated
// `OpeningResult[]` rows + callbacks — no dependency on the signed-in user, so
// the Library player dossier can reuse it for an opponent.
"use client";

import type { ReactNode } from "react";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tMyGames } from "@/src/i18n/my-games-strings";
import { localizeOpeningName } from "@/src/lib/opening-names";
import { sortOpeningResults, type OpeningResult, type OpeningSort } from "@/src/lib/my-games/stats";
import { ResultBar } from "../ui/ResultBar";

/** Optional extra content for one results row. */
export type OpeningResultExtra = {
  /** Rendered in an extra trailing cell (the column appears only when some row has one). */
  trailing?: ReactNode;
  /** Rendered as a second line under the result bar. */
  secondLine?: ReactNode;
};

export type OpeningResultsTableProps = {
  locale: SiteLocale;
  /** Aggregated rows (`resultsByOpening`); filtered by `color` and sorted here. */
  rows: readonly OpeningResult[];
  /** Colour whose rows are shown. */
  color: "white" | "black";
  /** Hide the Brancas/Pretas tabs (the caller already fixes the colour). */
  hideColorTabs?: boolean;
  onColorChange: (color: "white" | "black") => void;
  sort: OpeningSort;
  onSortChange: (sort: OpeningSort) => void;
  minGames: number;
  onMinGamesChange: (value: number) => void;
  renderRowExtra?: (row: OpeningResult) => OpeningResultExtra | null | undefined;
  /** When set, the opening name becomes a button that calls this. */
  onSelectRow?: (row: OpeningResult) => void;
  /** Heading id (override when more than one table is on the page). */
  headingId?: string;
};

export function OpeningResultsTable({
  locale,
  rows,
  color,
  hideColorTabs = false,
  onColorChange,
  sort,
  onSortChange,
  minGames,
  onMinGamesChange,
  renderRowExtra,
  onSelectRow,
  headingId = "mystats-openings",
}: OpeningResultsTableProps) {
  const tabRows = sortOpeningResults(
    rows.filter((row) => row.color === color),
    sort,
  );
  const extras = tabRows.map((row) => renderRowExtra?.(row) ?? null);
  const hasTrailing = extras.some((extra) => extra?.trailing != null);
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-1 text-caption font-semibold text-studio-muted">
        {tMyGames(locale, "myGames.statsByOpening")}
      </h2>
      {hideColorTabs ? null : (
        <div role="tablist" aria-label={tMyGames(locale, "myGames.statsByOpening")} className="mb-1 flex gap-1">
          {(["white", "black"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={color === tab}
              onClick={() => onColorChange(tab)}
              className={`rounded px-2 py-0.5 text-caption ${color === tab ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
            >
              {tMyGames(locale, tab === "white" ? "myGames.statsWhite" : "myGames.statsBlack")}
            </button>
          ))}
        </div>
      )}
      <div className="mb-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-studio-muted">
        <div role="group" aria-label={tMyGames(locale, "myGames.statsSortBy")} className="flex items-center gap-1">
          <span>{tMyGames(locale, "myGames.statsSortBy")}</span>
          {(["games", "score"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={sort === option}
              onClick={() => onSortChange(option)}
              className={`rounded px-2 py-0.5 text-caption ${sort === option ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
            >
              {tMyGames(locale, option === "games" ? "myGames.statsSortGames" : "myGames.statsSortScore")}
            </button>
          ))}
        </div>
        <div role="group" aria-label={tMyGames(locale, "myGames.statsMinGames")} className="flex items-center gap-1">
          <span>{tMyGames(locale, "myGames.statsMinGames")}</span>
          {[3, 5, 10].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={minGames === value}
              onClick={() => onMinGamesChange(value)}
              className={`rounded px-2 py-0.5 text-caption tabular-nums ${minGames === value ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
            >
              {formatInteger(locale, value)}
            </button>
          ))}
        </div>
      </div>
      {tabRows.length === 0 ? (
        <p className="text-dense text-studio-faint">{tMyGames(locale, "myGames.statsByOpeningEmpty")}</p>
      ) : (
        <table className="w-full table-fixed text-left text-dense">
          <thead>
            <tr className="text-caption text-studio-faint">
              <th scope="col" className="py-0.5 pr-2 font-normal">
                {tMyGames(locale, "myGames.statsByOpening")}
              </th>
              <th scope="col" className="w-10 py-0.5 text-center font-normal">
                {tMyGames(locale, "myGames.statsGames")}
              </th>
              <th scope="col" className="w-8 py-0.5 text-center font-normal">
                {tMyGames(locale, "myGames.statsWins")}
              </th>
              <th scope="col" className="w-8 py-0.5 text-center font-normal">
                {tMyGames(locale, "myGames.statsDraws")}
              </th>
              <th scope="col" className="w-8 py-0.5 text-center font-normal">
                {tMyGames(locale, "myGames.statsLosses")}
              </th>
              <th scope="col" className="w-14 py-0.5 text-right font-normal">
                {tMyGames(locale, "myGames.statsScore")}
              </th>
              {hasTrailing ? <th scope="col" className="w-16 py-0.5" /> : null}
            </tr>
          </thead>
          <tbody>
            {tabRows.map((row, index) => {
              const extra = extras[index];
              const name = localizeOpeningName(row.opening, locale);
              return (
                <tr key={`${row.color}:${row.opening}`} className="border-t border-studio-border-subtle">
                  <td className="min-w-0 py-1 pr-2">
                    <div className="truncate" title={row.opening}>
                      {onSelectRow ? (
                        <button
                          type="button"
                          onClick={() => onSelectRow(row)}
                          className="max-w-full truncate text-left hover:underline"
                        >
                          {name}
                        </button>
                      ) : (
                        name
                      )}
                    </div>
                    <div className="mt-0.5">
                      <ResultBar
                        perspective="player"
                        white={row.wins}
                        draws={row.draws}
                        black={row.losses}
                        label={`${tMyGames(locale, "myGames.statsWins")} ${row.wins}, ${tMyGames(locale, "myGames.statsDraws")} ${row.draws}, ${tMyGames(locale, "myGames.statsLosses")} ${row.losses}`}
                      />
                    </div>
                    {extra?.secondLine != null ? <div className="mt-0.5">{extra.secondLine}</div> : null}
                  </td>
                  <td className="py-1 text-center tabular-nums">{formatInteger(locale, row.games)}</td>
                  <td className="py-1 text-center tabular-nums">{formatInteger(locale, row.wins)}</td>
                  <td className="py-1 text-center tabular-nums">{formatInteger(locale, row.draws)}</td>
                  <td className="py-1 text-center tabular-nums">{formatInteger(locale, row.losses)}</td>
                  <td className="py-1 text-right tabular-nums">{formatInteger(locale, row.scorePct)}%</td>
                  {hasTrailing ? <td className="py-1 pl-1 text-right">{extra?.trailing}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
