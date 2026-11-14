"use client";

// SIG-1338: the Library player dossier. Selecting a player in the Players tab
// keeps the search list on the left and opens this frame on the right: header,
// the same quick filters as "My Stats", summary cards, and the two placeholders
// later issues fill with the player's openings and games.
import { useMemo } from "react";
import { formatInteger } from "@/src/i18n/format";
import { tLibrary, type LibraryStringKey } from "@/src/i18n/library-strings";
import { filterGames, overviewKpis } from "@/src/lib/my-games/overview-filters";
import { timeClassOptions } from "@/src/lib/my-games/opening-rows";
import type { PlayerGame, PlayerSource } from "@/src/lib/player-types";
import { useStudioStore } from "@/src/store/studio-store";
import { MyStatsFilterBar, MyStatsKpiCards } from "../../MyStatsOverviewHeader";
import { Button, IconButton } from "../../ui/Button";
import { Panel } from "../../ui/Panel";
import { usePlayerGames } from "../use-player-games";
import { DossierGames } from "./DossierGames";
import { DossierOpenings } from "./DossierOpenings";
import { useDossierStore } from "./dossier-store";
import { isLocalPlayer, showPlayerInLibrary } from "./show-in-library";
import { X } from "lucide-react";

const ORIGIN_KEYS: Record<PlayerSource, LibraryStringKey> = {
  studio: "library.dossier.origin.local",
  lichess: "library.dossier.origin.lichess",
  chesscom: "library.dossier.origin.chesscom",
};

function gameYear(game: PlayerGame): number | null {
  if (game.year != null) {
    return game.year;
  }
  if (game.playedAt != null) {
    return new Date(game.playedAt).getUTCFullYear();
  }
  return null;
}

/** First and last year covered by the games, or null when none is dated. */
export function playerYearRange(games: readonly PlayerGame[]): [number, number] | null {
  let first: number | null = null;
  let last: number | null = null;
  for (const game of games) {
    const year = gameYear(game);
    if (year === null) {
      continue;
    }
    first = first === null ? year : Math.min(first, year);
    last = last === null ? year : Math.max(last, year);
  }
  return first === null || last === null ? null : [first, last];
}

export function LibraryPlayerDossier() {
  const locale = useStudioStore((state) => state.settings.locale);
  const openPlayerView = useStudioStore((state) => state.openPlayerView);
  const setWorkspaceView = useStudioStore((state) => state.setWorkspaceView);
  const player = useDossierStore((state) => state.player);
  const filters = useDossierStore((state) => state.filters);
  const setFilters = useDossierStore((state) => state.setFilters);
  const closePlayer = useDossierStore((state) => state.closePlayer);
  const games = usePlayerGames(player);

  /* eslint-disable react-hooks/purity -- `now` is the memo's intentional clock read (same grain as MyStatsPanel). */
  const filtered = useMemo(() => filterGames(games.games, filters, Date.now()), [games.games, filters]);
  /* eslint-enable react-hooks/purity */
  const kpis = useMemo(() => overviewKpis(filtered), [filtered]);
  const timeClasses = useMemo(() => timeClassOptions(games.games), [games.games]);
  const period = useMemo(() => playerYearRange(games.games), [games.games]);
  const notice =
    games.notice ?? (games.partial || games.truncated ? tLibrary(locale, "library.dossier.partial") : null);

  function openInStudio() {
    if (!player) {
      return;
    }
    openPlayerView(player, filters.color);
    setWorkspaceView("studio");
  }

  return (
    <Panel
      as="section"
      aria-label={tLibrary(locale, "library.dossier.label")}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-testid="library-player-dossier"
    >
      {player === null ? (
        <p className="p-4 text-dense text-studio-muted" data-testid="library-player-dossier-hint">
          {tLibrary(locale, "library.dossier.hint")}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="@container flex min-w-0 flex-col gap-3 p-3">
            <header className="flex min-w-0 items-start gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-body font-semibold text-studio-fg" data-testid="dossier-player-name">
                  {player.displayName}
                </h2>
                <p className="text-caption text-studio-faint" data-testid="dossier-player-meta">
                  {tLibrary(locale, ORIGIN_KEYS[player.source])} ·{" "}
                  {tLibrary(locale, "library.dossier.games", { count: formatInteger(locale, games.games.length) })}
                  {period ? ` · ${period[0]}–${period[1]}` : ""}
                </p>
              </div>
              {isLocalPlayer(player) ? (
                <Button size="sm" variant="ghost" onClick={() => showPlayerInLibrary(player, filters.color)}>
                  {tLibrary(locale, "library.dossier.viewGames")}
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={openInStudio}>
                {tLibrary(locale, "library.dossier.openInStudio")}
              </Button>
              <IconButton size="sm" label={tLibrary(locale, "library.dossier.close")} onClick={closePlayer}>
                <X size={14} />
              </IconButton>
            </header>
            <MyStatsFilterBar
              locale={locale}
              filters={filters}
              onChange={setFilters}
              timeClasses={timeClasses}
              hideTimeClass={timeClasses.length === 0}
            />
            {games.loading ? (
              <p role="status" className="text-dense text-studio-faint">
                {tLibrary(locale, "library.dossier.loading")}
              </p>
            ) : games.error ? (
              <div role="alert" className="flex flex-col items-start gap-2">
                <p className="text-dense text-studio-fg">
                  {tLibrary(locale, "library.dossier.error", { message: games.error })}
                </p>
                <Button size="sm" variant="secondary" onClick={games.retry}>
                  {tLibrary(locale, "library.dossier.retry")}
                </Button>
              </div>
            ) : games.noGames ? (
              <p role="status" className="text-dense text-studio-muted">
                {tLibrary(locale, "library.dossier.noGames")}
              </p>
            ) : (
              <>
                {notice ? (
                  <p
                    role="status"
                    className="rounded bg-studio-hover/60 px-2 py-1 text-caption text-studio-muted"
                    data-testid="dossier-partial"
                  >
                    {notice}
                  </p>
                ) : null}
                {filtered.length === 0 ? (
                  <p role="status" className="text-dense text-studio-muted" data-testid="dossier-filter-empty">
                    {tLibrary(locale, "library.dossier.noMatch")}
                  </p>
                ) : (
                  <MyStatsKpiCards locale={locale} kpis={kpis} hideAccuracy />
                )}
                <div className="grid min-w-0 grid-cols-1 gap-3 @min-[720px]:grid-cols-2">
                  <DossierOpenings games={filtered} />
                  <DossierGames games={filtered} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
