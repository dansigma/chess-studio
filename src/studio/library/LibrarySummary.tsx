"use client";

// SIG-1339: with no game selected, the right panel summarizes the selected
// sources as a whole, replacing the old one-line bar. With a search or filters
// active it summarizes the filtered set instead ("Filter summary").
import { tLibrary } from "@/src/i18n/library-strings";
import { averageElo, topEco, topPlayers, yearBuckets } from "@/src/lib/library/overview";
import { localizeOpeningName } from "@/src/lib/opening-names";
import { useStudioStore } from "@/src/store/studio-store";
import { EcoBadge } from "../ui/EcoBadge";
import { ResultBar } from "../ui/ResultBar";
import { formatGameCount } from "./filter-chips";
import { hasActiveFilters, useLibraryStore } from "./library-store";
import { useFilteredOverview } from "./use-filtered-overview";
import { useLibraryOverview, type LibraryOverviewState } from "./use-library-overview";

const TOP_OPENINGS = 10;
const TOP_PLAYERS = 8;
const TOP_YEARS = 15;

const SHELL = "flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-3";
const HEADING = "text-caption uppercase tracking-wider text-studio-faint";

const itemClass = (active: boolean) =>
  `w-full rounded px-2 py-1 text-left transition-colors ${
    active ? "bg-studio-accent-soft text-studio-accent-text" : "text-studio-fg hover:bg-studio-hover-subtle"
  }`;

function percentOf(value: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
}

/** A plain frequency bar: accent fill over the track. */
function Bar({ percent }: { percent: number }) {
  return (
    <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-studio-track">
      <span className="block h-full rounded-full bg-studio-accent" style={{ width: `${percent}%` }} />
    </span>
  );
}

export function LibrarySummary() {
  const locale = useStudioStore((s) => s.settings.locale);
  const filters = useLibraryStore((s) => s.filters);
  const setEco = useLibraryStore((s) => s.setEco);
  const setPlayer = useLibraryStore((s) => s.setPlayer);
  const setYearRange = useLibraryStore((s) => s.setYearRange);
  const sourceCount = useLibraryStore((s) => s.filters.sources.length);
  const filtered = hasActiveFilters(filters);
  const baseState = useLibraryOverview();
  const filteredState = useFilteredOverview(filters, filtered);
  const state: LibraryOverviewState & { capped?: boolean } = !filtered
    ? baseState
    : filteredState.kind === "ready"
      ? { kind: "ready", overview: filteredState.overview, myGamesFailed: false, capped: filteredState.capped }
      : filteredState.kind === "failed"
        ? { kind: "failed" }
        : { kind: "loading" };

  const title = tLibrary(locale, filtered ? "library.summary.filteredTitle" : "library.summary.title");
  const number = (n: number) => formatGameCount(n, locale);
  const header = (line: string) => (
    <header className="flex shrink-0 flex-col gap-0.5">
      <h2 className="text-body font-medium text-studio-fg">{title}</h2>
      <p className="text-caption text-studio-muted">{line}</p>
    </header>
  );

  if (state.kind === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={tLibrary(locale, "library.overview.loading")}
        data-testid="library-summary"
        className={SHELL}
      >
        {header(tLibrary(locale, "library.overview.loading"))}
        <span data-testid="library-summary-skeleton" className="block h-24 animate-pulse rounded bg-studio-border/40" />
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div role="group" aria-label={title} data-testid="library-summary" className={SHELL}>
        {header(
          sourceCount === 0
            ? tLibrary(locale, "library.summary.empty")
            : tLibrary(locale, "library.overview.unavailablePublic"),
        )}
      </div>
    );
  }

  if (state.kind === "failed") {
    return (
      <div role="group" aria-label={title} data-testid="library-summary" className={SHELL}>
        {header(tLibrary(locale, "library.overview.failed"))}
      </div>
    );
  }

  const { overview, myGamesFailed } = state;
  const ecoFilter = filters.eco.trim().toUpperCase();
  const playerFilter = filters.player.trim().toLowerCase();
  const avg = averageElo(overview);
  const openings = topEco(overview, TOP_OPENINGS);
  const players = topPlayers(overview, TOP_PLAYERS);
  const years = yearBuckets(overview).slice(-TOP_YEARS);
  const maxYear = years.reduce((max, bucket) => Math.max(max, bucket.count), 0);
  const results = overview.results;
  // Unfinished games (`*`) are counted in the Games tile but have no result,
  // so the bar and the three counts cover the finished games only (SIG-1339
  // review). With no finished game there is no result to show at all.
  const finishedGames = results.white + results.draws + results.black;
  const resultsLabel = [
    `${tLibrary(locale, "library.summary.whiteWins")} ${number(results.white)}`,
    `${tLibrary(locale, "library.summary.draws")} ${number(results.draws)}`,
    `${tLibrary(locale, "library.summary.blackWins")} ${number(results.black)}`,
  ].join(", ");
  const toggleYear = (year: number) => {
    if (filters.yearFrom === year && filters.yearTo === year) {
      setYearRange(null, null);
    } else {
      setYearRange(year, year);
    }
  };

  return (
    <div
      role="group"
      aria-label={title}
      data-testid="library-summary"
      data-scope={filtered ? "filter" : "base"}
      className={SHELL}
    >
      {header(
        filtered
          ? state.capped
            ? tLibrary(locale, "library.summary.filteredCapped", { count: number(overview.games) })
            : tLibrary(locale, "library.summary.filteredScope")
          : tLibrary(locale, "library.summary.scope"),
      )}

      <dl data-testid="library-summary-tiles" className="grid shrink-0 grid-cols-3 gap-2">
        {[
          { key: "games" as const, label: "library.overview.games" as const, value: number(overview.games) },
          { key: "players" as const, label: "library.overview.players" as const, value: number(overview.players.size) },
          { key: "avgElo" as const, label: "library.overview.avgElo" as const, value: avg === null ? "–" : number(avg) },
        ].map((tile) => (
          <div key={tile.key} className="rounded-md bg-studio-hover-subtle px-2 py-1.5">
            <dt className="text-caption uppercase tracking-wide text-studio-faint">{tLibrary(locale, tile.label)}</dt>
            <dd className="text-body font-semibold tabular-nums text-studio-fg">{tile.value}</dd>
          </div>
        ))}
      </dl>

      {finishedGames > 0 ? (
        <section data-testid="library-summary-results" className="flex shrink-0 flex-col gap-1">
          <ResultBar white={results.white} draws={results.draws} black={results.black} label={resultsLabel} />
          <div className="grid grid-cols-3 gap-2 text-caption text-studio-muted">
            <span>
              {tLibrary(locale, "library.summary.whiteWins")}{" "}
              <strong className="font-semibold tabular-nums text-studio-fg">{number(results.white)}</strong>
            </span>
            <span>
              {tLibrary(locale, "library.summary.draws")}{" "}
              <strong className="font-semibold tabular-nums text-studio-fg">{number(results.draws)}</strong>
            </span>
            <span>
              {tLibrary(locale, "library.summary.blackWins")}{" "}
              <strong className="font-semibold tabular-nums text-studio-fg">{number(results.black)}</strong>
            </span>
          </div>
          {results.other > 0 ? (
            <p data-testid="library-summary-unfinished" className="text-caption text-studio-faint">
              {tLibrary(
                locale,
                results.other === 1 ? "library.summary.unfinished.one" : "library.summary.unfinished.other",
                { count: number(results.other) },
              )}
            </p>
          ) : null}
        </section>
      ) : null}

      {openings.length > 0 ? (
        <section data-testid="library-summary-openings" className="flex flex-col gap-1">
          <h3 className={HEADING}>{tLibrary(locale, "library.summary.openings")}</h3>
          <ul className="flex flex-col gap-0.5">
            {openings.map(({ code, opening, count }) => {
              const active = ecoFilter === code;
              const name = opening ? localizeOpeningName(opening, locale, code) : null;
              return (
                <li key={code}>
                  <button
                    type="button"
                    aria-pressed={active}
                    title={tLibrary(locale, "library.overview.ecoTitle", { code })}
                    onClick={() => setEco(active ? "" : code)}
                    className={`flex flex-col gap-1 ${itemClass(active)}`}
                  >
                    <span className="flex min-w-0 items-baseline gap-2 text-dense">
                      <EcoBadge code={code} opening={name} />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <span className="shrink-0 text-caption tabular-nums">{number(count)}</span>
                    </span>
                    <Bar percent={percentOf(count, overview.games)} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {players.length > 0 ? (
        <section data-testid="library-summary-players" className="flex flex-col gap-1">
          <h3 className={HEADING}>{tLibrary(locale, "library.summary.players")}</h3>
          <ul className="flex flex-col gap-0.5">
            {players.map(({ name, games }) => {
              const active = playerFilter === name.trim().toLowerCase();
              return (
                <li key={name}>
                  <button
                    type="button"
                    aria-pressed={active}
                    title={tLibrary(locale, "library.summary.filterPlayer", { name })}
                    onClick={() => setPlayer(active ? "" : name)}
                    className={`flex items-center justify-between gap-2 text-dense ${itemClass(active)}`}
                  >
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 text-caption tabular-nums">{number(games)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {years.length > 0 ? (
        <section data-testid="library-summary-years" className="flex flex-col gap-1">
          <h3 className={HEADING}>{tLibrary(locale, "library.summary.years")}</h3>
          <ul className="flex flex-col gap-0.5">
            {years.map(({ year, count }) => {
              const active = filters.yearFrom === year && filters.yearTo === year;
              return (
                <li key={year}>
                  <button
                    type="button"
                    aria-pressed={active}
                    title={tLibrary(locale, "library.summary.filterYear", { year })}
                    onClick={() => toggleYear(year)}
                    className={`grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 text-dense ${itemClass(active)}`}
                  >
                    <span className="tabular-nums">{year}</span>
                    <Bar percent={percentOf(count, maxYear)} />
                    <span className="text-caption tabular-nums">{number(count)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {myGamesFailed ? (
        <p data-testid="library-summary-failed" className="shrink-0 text-caption text-studio-faint">
          {tLibrary(locale, "library.overview.failed")}
        </p>
      ) : null}
    </div>
  );
}
