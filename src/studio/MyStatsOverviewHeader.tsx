"use client";

// SIG-1305: Overview filter bar (period / time class / colour) + KPI cards.
// Presentational: the panel owns the filter state and the filtered games.
import { formatDecimal1, formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tMyGames } from "@/src/i18n/my-games-strings";
import type { OverviewColor, OverviewFilters, OverviewKpis } from "@/src/lib/my-games/overview-filters";
import type { OpeningDatePreset } from "@/src/lib/my-games/opening-rows";
import { ResultBar } from "./ui/ResultBar";

const PRESETS: readonly OpeningDatePreset[] = ["m1", "m3", "m6", "m12", "all"];
const PRESET_KEYS = {
  m1: "myGames.openingsLastMonth",
  m3: "myGames.openingsLast3Months",
  m6: "myGames.openingsLast6Months",
  m12: "myGames.openingsLast12Months",
  all: "myGames.openingsAllTime",
} as const;
const COLORS: readonly OverviewColor[] = ["all", "white", "black"];
const COLOR_KEYS = {
  all: "myGames.filterColorAll",
  white: "myGames.filterColorWhite",
  black: "myGames.filterColorBlack",
} as const;

const SELECT_CLASS = "rounded bg-studio-hover px-1 py-0.5 text-caption text-studio-fg";

export function MyStatsFilterBar({
  locale,
  filters,
  onChange,
  timeClasses,
}: {
  locale: SiteLocale;
  filters: OverviewFilters;
  onChange: (filters: OverviewFilters) => void;
  timeClasses: readonly string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" role="group" aria-label={tMyGames(locale, "myGames.statsOverview")}>
      <label className="flex items-center gap-1 text-caption text-studio-muted">
        {tMyGames(locale, "myGames.filterPeriod")}
        <select
          aria-label={tMyGames(locale, "myGames.filterPeriod")}
          value={filters.preset}
          onChange={(event) => onChange({ ...filters, preset: event.target.value as OpeningDatePreset })}
          className={SELECT_CLASS}
        >
          {PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {tMyGames(locale, PRESET_KEYS[preset])}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-caption text-studio-muted">
        {tMyGames(locale, "myGames.openingsTimeClass")}
        <select
          aria-label={tMyGames(locale, "myGames.openingsTimeClass")}
          value={filters.timeClass}
          onChange={(event) => onChange({ ...filters, timeClass: event.target.value })}
          className={SELECT_CLASS}
        >
          <option value="all">{tMyGames(locale, "myGames.openingsAll")}</option>
          {timeClasses.map((timeClass) => (
            <option key={timeClass} value={timeClass}>
              {timeClass}
            </option>
          ))}
        </select>
      </label>
      <div role="group" aria-label={tMyGames(locale, "myGames.filterColor")} className="flex items-center gap-1 text-caption text-studio-muted">
        <span>{tMyGames(locale, "myGames.filterColor")}</span>
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-pressed={filters.color === color}
            onClick={() => onChange({ ...filters, color })}
            className={`rounded px-2 py-0.5 text-caption ${filters.color === color ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
          >
            {tMyGames(locale, COLOR_KEYS[color])}
          </button>
        ))}
      </div>
    </div>
  );
}

const ARROWS = { up: "↑", down: "↓", flat: "=" } as const;

export function MyStatsKpiCards({ locale, kpis }: { locale: SiteLocale; kpis: OverviewKpis }) {
  const trendTitle = tMyGames(
    locale,
    kpis.insufficientForTrend
      ? "myGames.kpiTrendFew"
      : kpis.direction === "up"
        ? "myGames.kpiTrendUp"
        : kpis.direction === "down"
          ? "myGames.kpiTrendDown"
          : "myGames.kpiTrendFlat",
  );
  const arrowClass =
    kpis.direction === "up" ? "text-studio-success" : kpis.direction === "down" ? "text-studio-danger" : "text-studio-faint";
  const card = "flex min-w-0 flex-col gap-0.5 rounded border border-studio-border-subtle bg-studio-hover/40 p-2";
  const label = "text-caption text-studio-muted";
  const value = "text-lg font-semibold tabular-nums text-studio-fg";
  return (
    <div className="grid grid-cols-1 gap-2 @sm:grid-cols-3" data-testid="mystats-kpis">
      <div className={card}>
        <span className={label}>{tMyGames(locale, "myGames.kpiGames")}</span>
        <span className={value} data-testid="kpi-games">{formatInteger(locale, kpis.games)}</span>
        <span className="text-caption text-studio-faint" data-testid="kpi-reviewed">
          {tMyGames(locale, kpis.reviewed === 1 ? "myGames.kpiReviewed.one" : "myGames.kpiReviewed.other", { count: kpis.reviewed })}
        </span>
      </div>
      <div className={card}>
        <span className={label}>{tMyGames(locale, "myGames.kpiAccuracy")}</span>
        <span className={value}>
          <span data-testid="kpi-accuracy">{kpis.avgAccuracy === null ? "–" : formatDecimal1(locale, kpis.avgAccuracy)}</span>
          {kpis.avgAccuracy === null ? null : (
            <span
              className={`ml-1 text-dense ${arrowClass}`}
              title={trendTitle}
              aria-label={trendTitle}
              data-testid="kpi-trend"
              data-direction={kpis.direction}
            >
              {ARROWS[kpis.direction]}
            </span>
          )}
        </span>
      </div>
      <div className={card}>
        <span className={label}>{tMyGames(locale, "myGames.kpiScore")}</span>
        <span className={value} data-testid="kpi-score">
          {kpis.scorePct === null ? "–" : `${formatInteger(locale, kpis.scorePct)}%`}
        </span>
        <ResultBar
          perspective="player"
          white={kpis.wins}
          draws={kpis.draws}
          black={kpis.losses}
          label={`${tMyGames(locale, "myGames.statsWins")} ${kpis.wins}, ${tMyGames(locale, "myGames.statsDraws")} ${kpis.draws}, ${tMyGames(locale, "myGames.statsLosses")} ${kpis.losses}`}
        />
        <span className="text-caption tabular-nums text-studio-faint">
          {tMyGames(locale, "myGames.statsWins")} {formatInteger(locale, kpis.wins)} · {tMyGames(locale, "myGames.statsDraws")}{" "}
          {formatInteger(locale, kpis.draws)} · {tMyGames(locale, "myGames.statsLosses")} {formatInteger(locale, kpis.losses)}
        </span>
      </div>
    </div>
  );
}
