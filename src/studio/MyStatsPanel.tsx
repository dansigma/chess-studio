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
import { phaseName, tierName } from "@/src/chess/review-strings";
import { sanMovesFromPgn } from "@/src/chess/pgn-clean";
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
  type OpeningDatePreset,
  type OpeningUiFilters,
} from "@/src/lib/my-games/opening-rows";
import type { MistakeTier } from "@/src/lib/my-games/review-queue";
import type { GamePhase } from "@/src/chess/phases";
import type { PlayerGame } from "@/src/lib/player-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "./dock-api";

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
  const importPlayerGame = useStudioStore((state) => state.importPlayerGame);
  const flip = useStudioStore((state) => state.flip);
  const [games, setGames] = useState<PlayerGame[]>([]);
  // Load state derives from `user` on first render; the effect below keeps it
  // in sync on transitions (same grain as MyGamesSidebar's synchronous
  // loading start, which the eslint-disable there documents).
  const [state, setState] = useState<LoadState>(user ? "loading" : "signedOut");
  const [colorTab, setColorTab] = useState<"white" | "black">("white");
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
        // SIG-1099: the opening tree builds over at most OPENING_MAX_GAMES
        // rows — stop paging once the cap is reached (Overview aggregates
        // over the same capped list).
        if (all.length >= OPENING_MAX_GAMES || !page.hasMore || !page.cursor) {
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
  // SIG-1099: tree input — SAN paths from PGN (moves-only rows have no PGN;
  // skip them). The tree + worst set recompute per filter change; `treeNow`
  // is captured fresh per render (same grain as the Overview trend, which
  // reads current games each render).
  // is intentionally fresh per render (same grain as the Overview trend
  // reading current games each render); the tree memo below depends on it.
  const treeNow = Date.now();
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
  const treeFilters = useMemo(
    () => openingFilterToTreeFilters(uiFilters, treeNow),
    [uiFilters, treeNow],
  );
  const treeRoot = useMemo(
    () => buildOpeningTree(treeGames, { color: lineColor, now: treeNow, filters: treeFilters }),
    [treeGames, lineColor, treeNow, treeFilters],
  );
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
              <OpeningsTab
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
                  importPlayerGame(syntheticLineGame(path, lineColor), { openInNewBoard: true });
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
          </>
        )}
      </div>
    </div>
  );
}

/** Minimum reviewed games before the stats panel shows charts (test seam). */
export { MY_STATS_MIN_REVIEWED };

const OPENING_PRESETS: readonly OpeningDatePreset[] = ["m1", "m3", "m6", "m12", "all"];

const PRESET_STRING_KEYS = {
  m1: "myGames.openingsLastMonth",
  m3: "myGames.openingsLast3Months",
  m6: "myGames.openingsLast6Months",
  m12: "myGames.openingsLast12Months",
  all: "myGames.openingsAllTime",
} as const;

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

function OpeningsTab({
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
}: {
  locale: SiteLocale;
  lineColor: "white" | "black";
  setLineColor: (color: "white" | "black") => void;
  uiFilters: OpeningUiFilters;
  setUiFilters: (filters: OpeningUiFilters) => void;
  timeClasses: string[];
  rows: ReturnType<typeof openingRows>;
  totalGames: number;
  onToggle: (key: string) => void;
  onOpenLine: (path: string[]) => void;
}) {
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
          {rows.map((row) => (
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
                  {tMyGames(locale, "myGames.openingsOpenLine")}
                </button>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
