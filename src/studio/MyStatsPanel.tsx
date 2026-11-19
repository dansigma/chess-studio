// SIG-1091: "My stats" dock panel (My Games 5/5). Reads the user's `my_games`
// rows via `loadMyGames` (paged loop, signed-in only — same seam as
// `MyGamesSidebar`), then aggregates with the pure `stats.ts` functions:
// accuracy trend (bespoke SVG; NOT ReviewEvalChart — that chart is
// eval-per-ply with board-path coupling), results-by-opening table with
// white/black tabs, and per-phase mistake bars. Fewer than 3 reviewed games
// shows the empty hint (`myStatsViewState` rule).
// SIG-1095: "Where you leave your repertoire" section — top-10 deviation
// groups over the last 50 games (`deviationsForRecentGames`), each row with
// the SIG-1094 one-click fix button for the group's most recent example.
// Hidden when no repertoire board is marked (same condition as the sidebar
// `needsRepHint`); groups need no review (deviations are PGN-shape, not
// engine output), but the section lives inside the `ready` branch so the
// <3-reviewed empty state stays the single gate.
// SIG-1099: "Openings" tab — per-color opening tree (`buildOpeningTree` /
// `worstLines` from SIG-1048) over up to `OPENING_MAX_GAMES` loaded games,
// with time-class / rated-only / date-preset filters, an expandable line
// list (`openingRows`), worst-line highlight, and "Open line" via a synthetic
// `PlayerGame` (`moves`) + orientation set to the selected color.
"use client";

import { useEffect, useMemo, useState } from "react";
import { sanMovesFromPgn } from "@/src/chess/pgn-clean";
import { tMyGames } from "@/src/i18n/my-games-strings";
import { tRepertoire } from "@/src/i18n/repertoire-strings";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import { loadCappedMyGames } from "@/src/lib/my-games/load-games";
import {
  deviationsForRecentGames,
  DEVIATION_TOP_GROUPS,
  mistakesPerGame,
  MY_STATS_MIN_REVIEWED,
  myStatsViewState,
  resultsByOpening,
  type OpeningSort,
} from "@/src/lib/my-games/stats";
import { exerciseCountsByPhase, type ExerciseCounts } from "@/src/lib/mistake-exercise-counts";
import { hydrateExercises } from "@/src/lib/mistake-exercises-store";
import {
  DEFAULT_OVERVIEW_FILTERS,
  filterGames,
  isDefaultOverviewFilters,
  overviewKpis,
  type OverviewFilters,
} from "@/src/lib/my-games/overview-filters";
import { OpeningLinesTree } from "./stats/OpeningLinesTree";
import { OpeningResultsTable } from "./stats/OpeningResultsTable";
import { MyStatsFilterBar, MyStatsKpiCards } from "./MyStatsOverviewHeader";
import {
  buildOpeningTree,
  worstLines,
  type OpeningTreeGame,
} from "@/src/lib/my-games/opening-tree";
import {
  OPENING_MAX_GAMES,
  openingFilterToTreeFilters,
  openingRows,
  syntheticLineGame,
  timeClassOptions,
  type OpeningUiFilters,
} from "@/src/lib/my-games/opening-rows";
import type { PlayerGame } from "@/src/lib/player-types";
import { preparationLineTitle } from "@/src/lib/prep/prep-rows";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "./dock-api";
import { MyStatsPhases } from "./MyStatsPhases";
import { MyStatsReviewGate } from "./MyStatsReviewGate";
import { MyStatsTrend } from "./MyStatsTrend";

type LoadState = "signedOut" | "loading" | "ready" | "unavailable";

// SIG-1180: per-user in-flight share — concurrent mounts (StrictMode /
// dockview remount) join the same promise instead of each running the page
// loop. The entry is dropped once the loop settles, so later mounts always
// refetch (same as before; no stale-after-sync risk). `refs` counts live
// joiners; the loop stops paging once nobody is listening.
const myStatsLoadByUser = new Map<string, { promise: Promise<PlayerGame[] | null>; refs: number }>();


export function MyStatsPanel() {
  const locale = useStudioStore((state) => state.settings.locale);
  const user = useStudioStore((state) => state.user);
  const importPlayerGame = useStudioStore((state) => state.importPlayerGame);
  const flip = useStudioStore((state) => state.flip);
  const setActivity = useStudioStore((state) => state.setActivity);
  const [games, setGames] = useState<PlayerGame[]>([]);
  // Load state derives from `user` on first render; the effect below keeps it
  // in sync on transitions (same grain as MyGamesSidebar's synchronous
  // loading start, which the eslint-disable there documents).
  const [state, setState] = useState<LoadState>(user ? "loading" : "signedOut");
  const [colorTab, setColorTab] = useState<"white" | "black">("white");
  // SIG-1305: Overview-only filters (local state; reset on remount). Separate
  // from the Openings tab's `uiFilters`.
  const [overviewFilters, setOverviewFilters] = useState<OverviewFilters>(DEFAULT_OVERVIEW_FILTERS);
  // SIG-1304: results-by-opening sort + minimum-games filter (local state).
  const [openingSort, setOpeningSort] = useState<OpeningSort>("games");
  const [minGames, setMinGames] = useState<number>(3);
  // SIG-1099: panel-level tab + Openings-tab filter/expansion state. `lineColor`
  // is separate from Overview's `colorTab` so the tabs don't fight.
  const [panelTab, setPanelTab] = useState<"overview" | "openings">("overview");
  const [lineColor, setLineColor] = useState<"white" | "black">("white");
  const [uiFilters, setUiFilters] = useState<OpeningUiFilters>({
    timeClass: "all",
    ratedOnly: false,
    preset: "all",
  });
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(new Set());

  /* eslint-disable react-hooks/set-state-in-effect -- SIG-1091: resetting to
     the signed-out state synchronously avoids flashing a stale list when the
     user signs out (same grain as MyGamesSidebar's loading-start disable). */
  // SIG-1180: keyed on the stable user id — `setUser` builds a fresh object
  // on every auth callback (mount emits getUser + INITIAL_SESSION) and token
  // refresh, so depending on the whole `user` object restarted this loop and
  // each stale loop paged to completion (~4x requests).
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      setGames([]);
      setState("signedOut");
      return;
    }
    let cancelled = false;
    const supabase: SupabaseClient<Database> | null = createBrowserSupabase();
    if (!supabase) {
      setState("unavailable");
      return;
    }
    setState("loading");
    // SIG-1180: join the in-flight load for this user when one exists
    // (StrictMode / dockview remount reuses it with zero new requests);
    // otherwise start the loop. The loop stops paging once the entry is
    // gone or has no listeners — a superseded run therefore ends after its
    // in-flight page instead of loading all ~60 pages.
    let slot = myStatsLoadByUser.get(userId);
    if (!slot) {
      // SIG-1099: the opening tree builds over at most OPENING_MAX_GAMES
      // rows — stop paging once the cap is reached (Overview aggregates over
      // the same capped list).
      const entry: { promise: Promise<PlayerGame[] | null>; refs: number } = {
        promise: Promise.resolve(null),
        refs: 0,
      };
      entry.promise = loadCappedMyGames(supabase, {
        limit: 50,
        maxGames: OPENING_MAX_GAMES,
        isCancelled: () => {
          const current = myStatsLoadByUser.get(userId);
          return current !== entry || current.refs === 0;
        },
      }).then(
        (result) => (result.ok && !result.cancelled ? result.games : null),
        () => null,
      );
      // Never reuse a settled entry: drop it so a later mount (e.g. after a
      // sidebar sync imports new rows) always refetches fresh data.
      void entry.promise.then(() => {
        if (myStatsLoadByUser.get(userId) === entry) {
          myStatsLoadByUser.delete(userId);
        }
      });
      myStatsLoadByUser.set(userId, entry);
      slot = entry;
    }
    const current = slot;
    current.refs += 1;
    void current.promise.then((loaded) => {
      if (cancelled) {
        return;
      }
      if (!loaded) {
        if (myStatsLoadByUser.get(userId) === current) {
          myStatsLoadByUser.delete(userId);
        }
        setState("unavailable");
        return;
      }
      setGames(loaded);
      setState("ready");
    });
    return () => {
      cancelled = true;
      current.refs -= 1;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [userId]);

  // SIG-1307: saved exercises, hydrated once per signed-in user. Failure or
  // loading leaves `null` (the Train actions simply don't render).
  const [exerciseCounts, setExerciseCounts] = useState<ExerciseCounts | null>(null);
  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;
    hydrateExercises(userId)
      .then((map) => {
        if (!cancelled) {
          setExerciseCounts(exerciseCountsByPhase(map));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExerciseCounts(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // SIG-1306: same open flow as My Games — import into a new board, orient to
  // the user's side, reveal the board panel.
  function onOpenGame(game: PlayerGame) {
    importPlayerGame(game, { openInNewBoard: true });
    if (game.color === "black" && selectActiveBoard(useStudioStore.getState()).orientation !== "black") {
      flip();
    }
    const active = selectActiveBoard(useStudioStore.getState());
    openBoardPanel(active.id, active.title);
  }

  // The panel-level gate stays on ALL loaded games (< 3 reviewed overall).
  const totalReviewed = useMemo(
    () => games.filter((game) => game.reviewedAt != null && game.userAccuracy != null).length,
    [games],
  );
  const view = myStatsViewState(totalReviewed);
  // SIG-1305: one filtered list feeds every Overview aggregate.
  /* eslint-disable react-hooks/purity -- `now` is the memo's intentional clock read. */
  const filteredGames = useMemo(() => filterGames(games, overviewFilters, Date.now()), [games, overviewFilters]);
  /* eslint-enable react-hooks/purity */
  const kpis = useMemo(() => overviewKpis(filteredGames), [filteredGames]);
  const reviewedCount = kpis.reviewed;
  const filteredReady = myStatsViewState(reviewedCount) === "ready";
  const openings = useMemo(() => resultsByOpening(filteredGames, { minGames }), [filteredGames, minGames]);
  const phaseStats = useMemo(() => mistakesPerGame(filteredGames), [filteredGames]);
  // Global colour (Brancas/Pretas) overrides the White/Black tabs.
  const openingsColor = overviewFilters.color === "all" ? colorTab : overviewFilters.color;
  // SIG-1099: tree input — SAN paths from PGN (moves-only rows have no PGN;
  // skip them). The tree memo captures `now` once per computation so the
  // trend windows and date-preset filter stay consistent; it recomputes only
  // when games or filters change (not on every render).
  const treeGames = useMemo<OpeningTreeGame[]>(
    () =>
      games.flatMap((game) => {
        if (!game.pgn) {
          return [];
        }
        const sans = sanMovesFromPgn(game.pgn);
        if (sans.length === 0) {
          return [];
        }
        return [
          {
            sans,
            color: game.color,
            result: game.playerResult,
            playedAt: game.playedAt,
            accuracy: game.userAccuracy ?? null,
            timeClass: game.timeClass ?? null,
            rated: game.rated ?? null,
          },
        ];
      }),
    [games],
  );
  /* eslint-disable react-hooks/purity -- SIG-1180: `now` is the memo's
     intentional clock read (same grain as the SIG-1099 comment below); the
     memo recomputes only when tree inputs/filters change. */
  const treeRoot = useMemo(
    () => {
      const now = Date.now();
      return buildOpeningTree(treeGames, {
        color: lineColor,
        now,
        filters: openingFilterToTreeFilters(uiFilters, now),
      });
    },
    [treeGames, lineColor, uiFilters],
  );
  /* eslint-enable react-hooks/purity */
  const worstKeys = useMemo(
    () => new Set(worstLines(treeRoot).map((line) => line.path.join(" "))),
    [treeRoot],
  );
  const lineRows = useMemo(() => openingRows(treeRoot, expandedKeys, worstKeys), [treeRoot, expandedKeys, worstKeys]);
  const timeClasses = useMemo(() => timeClassOptions(games), [games]);
  // SIG-1095: per-color repertoire trees + board ids (same selector grain as
  // MyGamesSidebar's row badges so the section recomputes only when a tree
  // or mark changes). Separate selectors keep subscriptions narrow — no
  // unrelated board edits re-trigger the 50-game `importPgn` scan.
  const whiteRepTree = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "white")?.tree ?? null);
  const blackRepTree = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "black")?.tree ?? null);
  const whiteRepBoardId = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "white")?.id ?? null);
  const blackRepBoardId = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "black")?.id ?? null);
  const trainDeviationLine = useStudioStore((state) => state.trainDeviationLine);
  const addGapToRepertoire = useStudioStore((state) => state.addGapToRepertoire);
  const deviationGroups = useMemo(
    () => deviationsForRecentGames(filteredGames, { white: whiteRepTree, black: blackRepTree }).slice(0, DEVIATION_TOP_GROUPS),
    [filteredGames, whiteRepTree, blackRepTree],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-studio-panel text-dense text-studio-fg">
      {/* SIG-1308: overflow-x-hidden is only a safety net. The real offenders
          were MyStatsTrend (320px fallback SVG + unclamped labels/tooltip
          poking past the right edge); with overflow-y:auto, overflow-x
          computes to auto, so any wider child produced a useless scrollbar. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
        {state === "signedOut" ? (
          <p role="status" className="text-dense text-studio-muted">
            {tMyGames(locale, "myGames.signInHint")}
          </p>
        ) : state === "loading" ? (
          <p role="status" className="text-dense text-studio-faint">
            {tMyGames(locale, "myGames.loading")}
          </p>
        ) : state === "unavailable" ? (
          <p role="status" className="text-dense text-studio-muted">
            {tMyGames(locale, "myGames.error.unavailable")}
          </p>
        ) : games.length === 0 ? (
          <div role="status" data-testid="mystats-no-games" className="flex flex-col items-start gap-2">
            <p className="text-dense text-studio-muted">{tMyGames(locale, "myGames.empty")}</p>
            <button
              type="button"
              onClick={() => setActivity("mygames")}
              className="rounded bg-studio-hover px-2 py-0.5 text-caption font-medium text-studio-accent-text hover:bg-studio-hover-strong"
            >
              {tPanels(locale, "games.import")}
            </button>
          </div>
        ) : view === "empty" ? (
          <MyStatsReviewGate locale={locale} reviewed={totalReviewed} />
        ) : (
          <>
            <div role="tablist" aria-label={tMyGames(locale, "myGames.statsTitle")} className="mb-2 flex gap-1">
              {(["overview", "openings"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={panelTab === tab}
                  onClick={() => setPanelTab(tab)}
                  className={`rounded px-2 py-0.5 text-caption ${panelTab === tab ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
                >
                  {tMyGames(locale, tab === "overview" ? "myGames.statsOverview" : "myGames.statsOpenings")}
                </button>
              ))}
            </div>
            {panelTab === "openings" ? (
              <OpeningLinesTree
                locale={locale}
                lineColor={lineColor}
                setLineColor={(color) => {
                  setLineColor(color);
                  setExpandedKeys(new Set());
                }}
                uiFilters={uiFilters}
                setUiFilters={(filters) => {
                  setUiFilters(filters);
                  setExpandedKeys(new Set());
                }}
                timeClasses={timeClasses}
                rows={lineRows}
                totalGames={treeRoot.games}
                onToggle={(key) => {
                  setExpandedKeys((previous) => {
                    const next = new Set(previous);
                    if (next.has(key)) {
                      next.delete(key);
                    } else {
                      next.add(key);
                    }
                    return next;
                  });
                }}
                onOpenLine={(path) => {
                  const title = preparationLineTitle(locale, path);
                  importPlayerGame(syntheticLineGame(path, lineColor, title), { openInNewBoard: true, title });
                  // SIG-1099: a fresh import is always white-oriented
                  // (`emptyBoard`); flip when the line color is black, then
                  // reveal the board panel (same grain as PlayerGamesPanel).
                  if (lineColor === "black" && selectActiveBoard(useStudioStore.getState()).orientation !== "black") {
                    flip();
                  }
                  const active = selectActiveBoard(useStudioStore.getState());
                  openBoardPanel(active.id, active.title);
                }}
              />
            ) : (
          <div className="@container flex min-w-0 flex-col gap-5">
            <MyStatsFilterBar
              locale={locale}
              filters={overviewFilters}
              onChange={setOverviewFilters}
              timeClasses={timeClasses}
            />
            {filteredGames.length === 0 ? (
              <div role="status" className="flex flex-col items-start gap-2" data-testid="mystats-filter-empty">
                <p className="text-dense text-studio-muted">{tMyGames(locale, "myGames.filterEmpty")}</p>
                <button
                  type="button"
                  onClick={() => setOverviewFilters(DEFAULT_OVERVIEW_FILTERS)}
                  className="rounded bg-studio-hover px-2 py-0.5 text-caption font-medium text-studio-accent-text hover:bg-studio-hover-strong"
                >
                  {tMyGames(locale, "myGames.filterReset")}
                </button>
              </div>
            ) : (
            <>
            <MyStatsKpiCards locale={locale} kpis={kpis} />
            {/* SIG-1385: with filters leaving fewer than 3 reviewed games, the
                gate shows once here; the trend and phase sections wait for it. */}
            {filteredReady ? null : (
              <MyStatsReviewGate
                locale={locale}
                reviewed={reviewedCount}
                onResetFilters={
                  reviewedCount === filteredGames.length
                    ? () => setOverviewFilters(DEFAULT_OVERVIEW_FILTERS)
                    : undefined
                }
              />
            )}
            {filteredReady ? (
              <section aria-labelledby="mystats-trend">
                <h2 id="mystats-trend" className="mb-1 text-caption font-semibold text-studio-muted">
                  {tMyGames(locale, "myGames.statsTrend")}
                </h2>
                <MyStatsTrend games={filteredGames} locale={locale} onOpenGame={onOpenGame} />
              </section>
            ) : null}
            <OpeningResultsTable
              locale={locale}
              rows={openings}
              color={openingsColor}
              hideColorTabs={overviewFilters.color !== "all"}
              onColorChange={setColorTab}
              sort={openingSort}
              onSortChange={setOpeningSort}
              minGames={minGames}
              onMinGamesChange={setMinGames}
            />
            {filteredReady ? (
              <section aria-labelledby="mystats-phases">
                <h2 id="mystats-phases" className="mb-1 text-caption font-semibold text-studio-muted">
                  {tMyGames(locale, "myGames.statsByPhase")}
                </h2>
                <MyStatsPhases
                  locale={locale}
                  stats={phaseStats}
                  exerciseCounts={userId ? exerciseCounts : null}
                  filtersActive={!isDefaultOverviewFilters(overviewFilters)}
                />
              </section>
            ) : null}
            {whiteRepTree === null && blackRepTree === null ? null : (
              <section aria-labelledby="mystats-deviations">
                <h2 id="mystats-deviations" className="mb-1 text-caption font-semibold text-studio-muted">
                  {tRepertoire(locale, "repertoire.deviation.statsTitle")}
                </h2>
                {deviationGroups.length === 0 ? (
                  <p className="text-dense text-studio-faint">{tMyGames(locale, "myGames.statsDeviationsEmpty")}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {deviationGroups.map((group) => {
                      const repMissing =
                        group.color === "white" ? whiteRepBoardId === null : blackRepBoardId === null;
                      const fixLabel = tRepertoire(
                        locale,
                        group.kind === "user_deviation" ? "repertoire.deviation.trainLine" : "repertoire.deviation.addGap",
                      );
                      return (
                        <li key={group.key} className="border-t border-studio-border-subtle py-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate text-dense text-studio-fg">{group.label}</span>
                            <span className="shrink-0 text-caption tabular-nums text-studio-faint">
                              {tRepertoire(locale, group.count === 1 ? "repertoire.deviation.statsCount.one" : "repertoire.deviation.statsCount.other", {
                                count: group.count,
                              })}
                            </span>
                          </div>
                          <button
                            type="button"
                            title={repMissing ? tRepertoire(locale, "repertoire.deviation.noBoard") : fixLabel}
                            aria-label={fixLabel}
                            disabled={repMissing}
                            onClick={() => {
                              if (group.kind === "user_deviation") {
                                trainDeviationLine(group.recentEvent, group.color);
                              } else {
                                addGapToRepertoire(group.recentEvent, group.color);
                              }
                            }}
                            className="text-caption font-medium text-studio-accent-text hover:underline disabled:cursor-default disabled:text-studio-disabled disabled:hover:no-underline"
                          >
                            {fixLabel}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
            </>
            )}
            </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Minimum reviewed games before the stats panel shows charts (test seam). */
export { MY_STATS_MIN_REVIEWED };
