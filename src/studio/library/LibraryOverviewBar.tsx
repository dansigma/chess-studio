"use client";

import { tLibrary } from "@/src/i18n/library-strings";
import { averageElo, topEco } from "@/src/lib/library/overview";
import { useStudioStore } from "@/src/store/studio-store";
import { Chip } from "../ui/Controls";
import { formatGameCount } from "./filter-chips";
import { useLibraryOverview } from "./use-library-overview";
import { useLibraryStore } from "./library-store";

const TOP_ECO = 3;

/** SIG-1327: one-line summary of the selected sources; top ECO codes toggle the ECO filter. */
export function LibraryOverviewBar() {
  const locale = useStudioStore((s) => s.settings.locale);
  const eco = useLibraryStore((s) => s.filters.eco);
  const setEco = useLibraryStore((s) => s.setEco);
  const state = useLibraryOverview();
  const label = tLibrary(locale, "library.overview.label");
  const shell = "flex min-w-0 shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap px-0.5 pb-1 text-caption text-studio-muted";

  if (state.kind === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label={tLibrary(locale, "library.overview.loading")} data-testid="library-overview-bar" className={shell}>
        <span data-testid="library-overview-skeleton" className="h-[22px] w-72 max-w-full animate-pulse rounded-full bg-studio-border/40" />
      </div>
    );
  }
  if (state.kind === "unavailable") {
    return (
      <div role="group" aria-label={label} data-testid="library-overview-bar" className={shell}>
        <span>{tLibrary(locale, "library.overview.unavailableMasters")}</span>
      </div>
    );
  }
  if (state.kind === "failed") {
    return (
      <div role="group" aria-label={label} data-testid="library-overview-bar" className={shell}>
        <span data-testid="library-overview-failed">{tLibrary(locale, "library.overview.failed")}</span>
      </div>
    );
  }

  const { overview, myGamesFailed } = state;
  const number = (n: number) => formatGameCount(n, locale);
  const avg = averageElo(overview);
  const active = eco.trim().toUpperCase();
  const stat = (name: string, value: string) => (
    <span className="shrink-0">
      {name} <strong className="font-semibold tabular-nums text-studio-fg">{value}</strong>
    </span>
  );
  return (
    <div role="group" aria-label={label} data-testid="library-overview-bar" className={shell}>
      {stat(tLibrary(locale, "library.overview.games"), number(overview.games))}
      {stat(tLibrary(locale, "library.overview.players"), number(overview.players.size))}
      {stat(tLibrary(locale, "library.overview.avgElo"), avg === null ? "–" : number(avg))}
      {topEco(overview, TOP_ECO).map(({ code, opening, count }) => {
        const isActive = active === code;
        return (
          <span key={code} title={tLibrary(locale, "library.overview.ecoTitle", { code })} className="shrink-0">
            <Chip active={isActive} onClick={() => setEco(isActive ? "" : code)}>
              <span className="font-semibold">{code}</span>
              {opening ? <span className="max-w-40 truncate">{opening}</span> : null}
              <span className="tabular-nums opacity-80">{number(count)}</span>
            </Chip>
          </span>
        );
      })}
      {myGamesFailed ? (
        <span data-testid="library-overview-failed" className="shrink-0 text-studio-faint">
          {tLibrary(locale, "library.overview.failed")}
        </span>
      ) : null}
    </div>
  );
}
