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
"use client";

import { useEffect, useMemo, useState } from "react";
import { phaseName, tierName } from "@/src/chess/review-strings";
import { formatDecimal1, formatInteger } from "@/src/i18n/format";
import { tMyGames } from "@/src/i18n/my-games-strings";
import { tRepertoire } from "@/src/i18n/repertoire-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { loadMyGames, type MyGamesPage } from "@/src/lib/my-games/load-games";
import {
  accuracyTrend,
  deviationsForRecentGames,
  DEVIATION_TOP_GROUPS,
  mistakesByPhase,
  MY_STATS_MIN_REVIEWED,
  myStatsViewState,
  resultsByOpening,
} from "@/src/lib/my-games/stats";
import type { MistakeTier } from "@/src/lib/my-games/review-queue";
import type { GamePhase } from "@/src/chess/phases";
import type { PlayerGame } from "@/src/lib/player-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { useStudioStore } from "@/src/store/studio-store";

type LoadState = "signedOut" | "loading" | "ready" | "unavailable";

const PHASES: readonly GamePhase[] = ["opening", "middlegame", "endgame"];
const TIERS: readonly MistakeTier[] = ["inaccuracy", "mistake", "miss", "blunder"];

function TrendChart({ points, locale, label }: { points: Array<{ playedAt: number; accuracy: number }>; locale: SiteLocale; label: string }) {
  const width = 640;
  const height = 120;
  const padX = 8;
  const padY = 10;
  if (points.length === 0) {
    return null;
  }
  const xs = points.map((_, index) =>
    points.length === 1 ? width / 2 : padX + (index / (points.length - 1)) * (width - padX * 2),
  );
  const ys = points.map((point) => padY + ((100 - Math.max(0, Math.min(100, point.accuracy))) / 100) * (height - padY * 2));
  const line = xs.map((x, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${ys[index]?.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg
      className="h-28 w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <path d={line} fill="none" stroke="var(--studio-accent)" strokeWidth="2" />
      {xs.map((x, index) => (
        <circle
          key={index}
          cx={x}
          cy={ys[index]}
          r="3"
          fill="var(--studio-accent)"
        >
          <title>{`${formatDecimal1(locale, points[index]?.accuracy ?? 0)}`}</title>
        </circle>
      ))}
      {last ? (
        <text
          x={width - padX}
          y={padY + 10}
          textAnchor="end"
          fontSize="11"
          fill="var(--studio-muted)"
        >
          {formatDecimal1(locale, last.accuracy)}
        </text>
      ) : null}
    </svg>
  );
}

export function MyStatsPanel() {
  const locale = useStudioStore((state) => state.settings.locale);
  const user = useStudioStore((state) => state.user);
  const [games, setGames] = useState<PlayerGame[]>([]);
  // Load state derives from `user` on first render; the effect below keeps it
  // in sync on transitions (same grain as MyGamesSidebar's synchronous
  // loading start, which the eslint-disable there documents).
  const [state, setState] = useState<LoadState>(user ? "loading" : "signedOut");
  const [colorTab, setColorTab] = useState<"white" | "black">("white");

  /* eslint-disable react-hooks/set-state-in-effect -- SIG-1091: resetting to
     the signed-out state synchronously avoids flashing a stale list when the
     user signs out (same grain as MyGamesSidebar's loading-start disable). */
  useEffect(() => {
    if (!user) {
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
    async function loadAll(client: SupabaseClient<Database>): Promise<void> {
      const all: PlayerGame[] = [];
      let cursor: string | null = null;
      for (;;) {
        const result = await loadMyGames(client, { limit: 50, before: cursor });
        if (!result.ok) {
          if (!cancelled) {
            setState("unavailable");
          }
          return;
        }
        const page: MyGamesPage = result.page;
        all.push(...page.games);
        if (!page.hasMore || !page.cursor) {
          break;
        }
        cursor = page.cursor;
      }
      if (!cancelled) {
        setGames(all);
        setState("ready");
      }
    }
    void loadAll(supabase);
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user]);

  const reviewedCount = useMemo(
    () => games.filter((game) => game.reviewedAt != null && game.userAccuracy != null).length,
    [games],
  );
  const view = myStatsViewState(reviewedCount);
  const trend = useMemo(() => accuracyTrend(games), [games]);
  const openings = useMemo(() => resultsByOpening(games), [games]);
  const phaseTotals = useMemo(() => mistakesByPhase(games), [games]);
  const tabRows = useMemo(() => openings.filter((row) => row.color === colorTab), [openings, colorTab]);
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
    () => deviationsForRecentGames(games, { white: whiteRepTree, black: blackRepTree }).slice(0, DEVIATION_TOP_GROUPS),
    [games, whiteRepTree, blackRepTree],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-studio-panel text-dense text-studio-fg">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
        ) : view === "empty" ? (
          <p role="status" className="text-dense text-studio-muted">
            {tMyGames(locale, "myGames.statsEmpty")}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <section aria-labelledby="mystats-trend">
              <h2 id="mystats-trend" className="mb-1 text-caption font-semibold text-studio-muted">
                {tMyGames(locale, "myGames.statsTrend")}
              </h2>
              <TrendChart points={trend} locale={locale} label={tMyGames(locale, "myGames.statsTrend")} />
            </section>
            <section aria-labelledby="mystats-openings">
              <h2 id="mystats-openings" className="mb-1 text-caption font-semibold text-studio-muted">
                {tMyGames(locale, "myGames.statsByOpening")}
              </h2>
              <div role="tablist" aria-label={tMyGames(locale, "myGames.statsByOpening")} className="mb-1 flex gap-1">
                {(["white", "black"] as const).map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="tab"
                    aria-selected={colorTab === color}
                    onClick={() => setColorTab(color)}
                    className={`rounded px-2 py-0.5 text-caption ${colorTab === color ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
                  >
                    {tMyGames(locale, color === "white" ? "myGames.statsWhite" : "myGames.statsBlack")}
                  </button>
                ))}
              </div>
              {tabRows.length === 0 ? (
                <p className="text-dense text-studio-faint">
                  {tMyGames(locale, "myGames.statsEmpty")}
                </p>
              ) : (
                <table className="w-full text-left text-dense">
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
                    </tr>
                  </thead>
                  <tbody>
                    {tabRows.map((row) => (
                      <tr key={`${row.color}:${row.opening}`} className="border-t border-studio-border-subtle">
                        <td className="py-1 pr-2">{row.opening}</td>
                        <td className="py-1 text-center tabular-nums">{formatInteger(locale, row.games)}</td>
                        <td className="py-1 text-center tabular-nums">{formatInteger(locale, row.wins)}</td>
                        <td className="py-1 text-center tabular-nums">{formatInteger(locale, row.draws)}</td>
                        <td className="py-1 text-center tabular-nums">{formatInteger(locale, row.losses)}</td>
                        <td className="py-1 text-right tabular-nums">{formatInteger(locale, row.scorePct)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section aria-labelledby="mystats-phases">
              <h2 id="mystats-phases" className="mb-1 text-caption font-semibold text-studio-muted">
                {tMyGames(locale, "myGames.statsByPhase")}
              </h2>
              <div className="flex flex-col gap-3">
                {PHASES.map((phase) => {
                  const max = Math.max(1, ...TIERS.map((tier) => phaseTotals[phase][tier]));
                  return (
                    <div key={phase}>
                      <h3 className="mb-1 text-caption text-studio-faint">{phaseName(locale, phase)}</h3>
                      <dl className="flex flex-col gap-1">
                        {TIERS.map((tier) => (
                          <div key={tier} className="grid grid-cols-[88px_1fr_32px] items-center gap-2">
                            <dt className="text-dense text-studio-muted">{tierName(locale, tier)}</dt>
                            <dd className="h-2 overflow-hidden rounded bg-studio-hover">
                              <div
                                className="h-full rounded bg-[var(--studio-accent)]"
                                style={{ width: `${(100 * phaseTotals[phase][tier]) / max}%` }}
                              />
                            </dd>
                            <dd className="text-right text-dense tabular-nums text-studio-muted">
                              {formatInteger(locale, phaseTotals[phase][tier])}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
              </div>
            </section>
            {whiteRepTree === null && blackRepTree === null ? null : (
              <section aria-labelledby="mystats-deviations">
                <h2 id="mystats-deviations" className="mb-1 text-caption font-semibold text-studio-muted">
                  {tRepertoire(locale, "repertoire.deviation.statsTitle")}
                </h2>
                {deviationGroups.length === 0 ? (
                  <p className="text-dense text-studio-faint">{tMyGames(locale, "myGames.statsEmpty")}</p>
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
          </div>
        )}
      </div>
    </div>
  );
}

/** Minimum reviewed games before the stats panel shows charts (test seam). */
export { MY_STATS_MIN_REVIEWED };
