"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { useRouter } from "next/navigation";
import { CalendarDays, ChartNoAxesColumn, Flame, History, Play, RotateCcw, Shapes, Zap, type LucideIcon } from "lucide-react";
import { SiteFooter } from "@/src/site/SiteFooter";
import { CourseChrome } from "@/src/courses/CourseChrome";
import type { SiteLocale } from "@/src/i18n/locale";
import { formatInteger } from "@/src/i18n/format";
import { tPuzzle, type PuzzleStringKey } from "@/src/i18n/puzzle-strings";
import { tMistakes } from "@/src/i18n/mistakes-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { Badge, Chip } from "@/src/studio/ui/Controls";
import { Panel } from "@/src/studio/ui/Panel";
import { dueExercises, hydrateExercises, type MistakeExercisesMap } from "@/src/lib/mistake-exercises-store";
import { boardCoordinateOptions, boardSquareStyles } from "@/src/chess/board-themes";
import { piecesForSet } from "@/src/chess/piece-sets";
import { DIFFICULTIES, type Difficulty } from "./difficulty";
import { LevelBar } from "./XpBreakdown";
import { dailyPuzzle, dateKey, levelFromXp, type CompiledPuzzle } from "./engine";
import { orientationFor } from "./use-puzzle-feedback";
import { motifSummary, weakestMotif } from "./motif-stats";
import { loadPuzzleCatalog } from "./puzzle-client";
import { ProgressHeatmap, StreakMetrics } from "./ProgressHeatmap";
import { localDayKey } from "./activity";
import { hydratePuzzleProgress, progressSource } from "./progress";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { THEME_CARDS, THEME_LABEL_KEYS, type PuzzleMode, type PuzzleProgress } from "./types";

const MODE_KEYS: Record<PuzzleMode, PuzzleStringKey> = {
  rated: "puzzle.mode.rated",
  streak: "puzzle.mode.streak",
  rush: "puzzle.mode.rush",
  daily: "puzzle.mode.daily",
  mistakes: "puzzle.mode.mistakes",
} as const;

export function PuzzleDashboard() {
  const router = useRouter();
  const locale = useStudioStore((state) => state.settings.locale);
  const [progress, setProgress] = useState<PuzzleProgress | null>(null);
  const [puzzles, setPuzzles] = useState<CompiledPuzzle[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // SIG-1258: known only once the load has read the auth user; null = not known yet.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [source, setSource] = useState<"account" | "browser">("browser");
  // SIG-1097: due mistake-exercise count for the "My mistakes" card.
  const [dueMistakes, setDueMistakes] = useState<number | null>(null);
  // SIG-1256: difficulty filter for theme links; null = All (normal rated session).
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  // Bumped on every load and on unmount, so a stale response is dropped.
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    const stale = () => requestId.current !== id;
    try {
      const supabase = createBrowserSupabase();
      const user = supabase ? (await supabase.auth.getUser()).data.user : null;
      const [loaded, catalog, exercises] = await Promise.all([
        hydratePuzzleProgress(user?.id ?? null),
        loadPuzzleCatalog(),
        hydrateExercises(user?.id ?? null),
      ]);
      const timestamp = Date.now();
      if (stale()) {
        return;
      }
      setProgress(loaded);
      setPuzzles(catalog);
      setNow(timestamp);
      setSource(progressSource());
      setSignedIn(Boolean(user));
      setDueMistakes(dueExercises(exercises as MistakeExercisesMap, new Date(timestamp)).length);
      setStatus("ready");
    } catch (error) {
      console.error("Failed to load puzzle progress.", error);
      if (!stale()) {
        // No partial data: zeros would read as real progress.
        setProgress(null);
        setPuzzles([]);
        setNow(null);
        setSignedIn(null);
        setDueMistakes(null);
        setStatus("error");
      }
    }
  }, []);

  const retry = useCallback(() => {
    setStatus("loading");
    void load();
  }, [load]);

  /* eslint-disable react-hooks/set-state-in-effect -- SIG-1258: initial fetch; state is only set after the awaits. */
  useEffect(() => {
    void load();
    const ref = requestId;
    return () => {
      ref.current += 1;
    };
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loading = status === "loading";
  const failed = status === "error";

  const daily = now === null ? null : dailyPuzzle(puzzles, now);
  const playedToday = Boolean(progress && now !== null && progress.daily === dateKey(now));
  const attempts = progress ? progress.solved + progress.failed : 0;
  // SIG-1254: signed-out users have a zeroed progress object, so gate on real activity.
  const hasActivity = attempts > 0 || Object.keys(progress?.days ?? {}).length > 0;
  const accuracy = progress && attempts > 0 ? Math.round((progress.solved / attempts) * 100) : null;
  const level = levelFromXp(progress?.xp ?? 0);
  // SIG-1103: per-motif rows, sorted by attempts desc; the weakest-motif
  // button reuses the existing `?mode=rated&theme=` deep link into training.
  const motifRows = progress ? motifSummary(progress) : [];
  const weakest = progress ? weakestMotif(progress) : null;

  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome />
      <main className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6" aria-busy={loading}>
        <Panel as="section" className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-8 text-studio-fg sm:text-[28px] sm:leading-9">{tPuzzle(locale, "puzzle.dashboard.heading")}</h1>
            <p className="mt-2 max-w-md text-body text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.intro")}</p>
            <Button
              className="mt-4 w-full transition-colors duration-150 sm:w-auto sm:min-w-40"
              variant="primary"
              onClick={() => router.push("/puzzles/play?mode=rated")}
            >
              {tPuzzle(locale, "puzzle.dashboard.solveNow")}
            </Button>
            {loading ? <Skeleton className="mt-1.5 w-40 text-caption" /> : null}
            {status === "ready" && signedIn ? (
              <p className="mt-1.5 text-caption text-studio-muted">
                {source === "account"
                  ? tPuzzle(locale, "puzzle.dashboard.savedAccount")
                  : tPuzzle(locale, "puzzle.dashboard.savedBrowser")}
              </p>
            ) : null}
            {status === "ready" && signedIn === false ? (
              <p className="mt-1.5 text-caption text-studio-muted" data-testid="signin-prompt">
                <Link
                  href="/login"
                  className="text-studio-accent-text underline-offset-2 transition-colors duration-150 hover:text-studio-fg hover:underline"
                >
                  {tPuzzle(locale, "puzzle.dashboard.signIn.link")}
                </Link>{" "}
                {tPuzzle(locale, "puzzle.dashboard.signIn.rest")}
              </p>
            ) : null}
            {failed ? (
              <div role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="text-body text-studio-warning-fg">{tPuzzle(locale, "puzzle.dashboard.loadError")}</p>
                <Button size="sm" variant="secondary" className="transition-colors duration-150" onClick={retry}>
                  {tPuzzle(locale, "puzzle.dashboard.retry")}
                </Button>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-2 sm:w-44">
            <div>
              <div className="text-caption uppercase tracking-wide text-studio-muted">
                {tPuzzle(locale, "puzzle.dashboard.yourRating")}
              </div>
              <div className="text-title font-semibold tabular-nums text-studio-fg">
                {loading ? <Skeleton className="w-16" /> : progress ? formatInteger(locale, progress.rating) : "—"}
              </div>
            </div>
            {loading ? (
              <div aria-hidden className="min-w-0 flex-1 text-caption sm:w-full sm:flex-none">
                <Skeleton className="w-28" />
                <Skeleton className="mt-1 w-24" />
              </div>
            ) : progress ? (
              <div className="min-w-0 flex-1 sm:w-full sm:flex-none">
                <LevelBar level={level} locale={locale} compact />
              </div>
            ) : null}
          </div>
          {daily || loading ? <DailyPreview puzzle={daily} locale={locale} /> : null}
        </Panel>

        {loading ? (
          <Panel aria-hidden className="mt-4 min-h-[17rem] animate-pulse" />
        ) : failed ? (
          <Panel as="section" aria-label={tPuzzle(locale, "puzzle.heatmap.title")} className="mt-4 p-4">
            <StreakMetrics locale={locale} allTime={null} period={null} />
          </Panel>
        ) : progress && now !== null && hasActivity ? (
          <div className="mt-4">
            <ProgressHeatmap
              days={progress.days}
              today={localDayKey(now)}
              locale={locale}
              allTime={{ solved: progress.solved, accuracy, streak: progress.streak, bestStreak: progress.bestStreak }}
            />
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ModeCard
            icon={CalendarDays}
            iconClass="text-studio-accent-text"
            title={tPuzzle(locale, "puzzle.dashboard.daily.title")}
            detail={
              loading
                ? null
                : daily
                ? `${playedToday ? tPuzzle(locale, "puzzle.dashboard.daily.solvedToday") : tPuzzle(locale, "puzzle.dashboard.daily.today")} · ${formatInteger(locale, daily.rating)}`
                : tPuzzle(locale, "puzzle.dashboard.daily.fallback")
            }
            body={tPuzzle(locale, "puzzle.dashboard.daily.body")}
            action={
              playedToday
                ? tPuzzle(locale, "puzzle.dashboard.daily.review")
                : tPuzzle(locale, "puzzle.dashboard.daily.play")
            }
            onClick={() => router.push("/puzzles/play?mode=daily")}
          />
          <ModeCard
            icon={Flame}
            iconClass="text-studio-warning-fg"
            title={tPuzzle(locale, "puzzle.dashboard.streak.title")}
            detail={
              loading
                ? null
                : progress
                ? tPuzzle(locale, "puzzle.dashboard.streak.best", { best: formatInteger(locale, progress.bestStreak) })
                : tPuzzle(locale, "puzzle.dashboard.streak.fallback")
            }
            body={tPuzzle(locale, "puzzle.dashboard.streak.body")}
            action={tPuzzle(locale, "puzzle.dashboard.streak.action")}
            onClick={() => router.push("/puzzles/play?mode=streak")}
          />
          <ModeCard
            icon={Zap}
            iconClass="text-studio-success"
            title={tPuzzle(locale, "puzzle.dashboard.rush.title")}
            detail={
              loading
                ? null
                : progress
                ? tPuzzle(locale, "puzzle.dashboard.rush.best", { best: formatInteger(locale, progress.rushBest) })
                : tPuzzle(locale, "puzzle.dashboard.rush.fallback")
            }
            body={tPuzzle(locale, "puzzle.dashboard.rush.body")}
            action={tPuzzle(locale, "puzzle.dashboard.rush.action")}
            onClick={() => router.push("/puzzles/play?mode=rush")}
          />
          <ModeCard
            icon={RotateCcw}
            iconClass="text-studio-comment"
            title={tMistakes(locale, "mistakes.dashboard.title")}
            detail={
              loading
                ? null
                : dueMistakes === null
                ? ""
                : dueMistakes === 0
                  ? tMistakes(locale, "mistakes.dashboard.none")
                  : tMistakes(locale, dueMistakes === 1 ? "mistakes.dashboard.detail.one" : "mistakes.dashboard.detail.other", {
                      count: formatInteger(locale, dueMistakes),
                    })
            }
            badge={!loading && dueMistakes !== null && dueMistakes > 0 ? formatInteger(locale, dueMistakes) : undefined}
            body={
              loading ? null : tMistakes(locale, dueMistakes === 0 ? "mistakes.dashboard.empty" : "mistakes.dashboard.body")
            }
            action={dueMistakes === 0 ? tMistakes(locale, "mistakes.dashboard.analyze") : tMistakes(locale, "mistakes.dashboard.action")}
            onClick={() => router.push("/puzzles/play?mode=mistakes")}
            href={dueMistakes === 0 ? "/studio" : undefined}
            pending={loading}
          />
        </div>

        <SectionHeading icon={Shapes} className="mt-6">
          {tPuzzle(locale, "puzzle.dashboard.themesTitle")}
        </SectionHeading>
        <p className="mt-0.5 text-dense text-studio-muted">
          {tPuzzle(locale, difficulty ? "puzzle.dashboard.themesSubtitleUnrated" : "puzzle.dashboard.themesSubtitle")}
        </p>
        <div
          role="group"
          aria-label={tPuzzle(locale, "puzzle.difficulty.label")}
          className="mt-2 flex flex-wrap gap-1.5"
        >
          <Chip active={difficulty === null} onClick={() => setDifficulty(null)}>
            {tPuzzle(locale, "puzzle.difficulty.all")}
          </Chip>
          {DIFFICULTIES.map((value) => (
            <Chip key={value} active={difficulty === value} onClick={() => setDifficulty(value)}>
              {tPuzzle(locale, `puzzle.difficulty.${value}`)}
            </Chip>
          ))}
        </div>
        {/* 9 theme cards: 1 column on phones, 3 from sm up (3 full rows, no orphan). */}
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {THEME_CARDS.map((theme) => (
            <Link
              key={theme.id}
              href={`/puzzles/play?mode=rated&theme=${theme.id}${difficulty ? `&difficulty=${difficulty}` : ""}`}
              className="group block rounded-[10px] border border-transparent bg-studio-panel px-3 py-2 text-left transition-colors duration-150 hover:border-studio-border-strong hover:[background-image:linear-gradient(var(--studio-hover-subtle),var(--studio-hover-subtle))] active:[background-image:linear-gradient(var(--studio-hover),var(--studio-hover))]"
            >
              <span className="text-body font-semibold text-studio-fg transition-colors duration-150 group-hover:text-studio-accent-text">
                {tPuzzle(locale, theme.labelKey)}</span>
              <p className="mt-0.5 text-dense text-studio-muted">{tPuzzle(locale, theme.blurbKey)}</p>
            </Link>
          ))}
        </div>

        {motifRows.length > 0 ? (
          <>
            <SectionHeading icon={ChartNoAxesColumn} className="mt-6">
              {tPuzzle(locale, "puzzle.dashboard.motifsTitle")}
            </SectionHeading>
            <p className="mt-0.5 text-dense text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.motifsSubtitle")}</p>
            <Panel className="mt-2 overflow-hidden">
              <table className="w-full text-dense">
                <thead>
                  <tr className="text-left text-caption uppercase tracking-wide text-studio-muted">
                    <th scope="col" className="px-3 py-1.5 font-medium">
                      {tPuzzle(locale, "puzzle.dashboard.themesTitle")}
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium tabular-nums">
                      {tPuzzle(locale, "puzzle.dashboard.motifs.attempts")}
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium tabular-nums">
                      {tPuzzle(locale, "puzzle.dashboard.motifs.successRate")}
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium tabular-nums">
                      {tPuzzle(locale, "puzzle.dashboard.motifs.avgTime")}
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">
                      <span className="sr-only">{tPuzzle(locale, "puzzle.dashboard.motifs.trendFlat")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-studio-border">
                  {motifRows.map((row) => (
                    <tr key={row.theme}>
                      <td className="px-3 py-1.5 font-semibold text-studio-fg">
                        {tPuzzle(locale, THEME_LABEL_KEYS[row.theme])}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-studio-muted">
                        {formatInteger(locale, row.attempts)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-studio-fg">
                        {formatInteger(locale, row.successPct)}%
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-studio-muted">
                        {row.avgSeconds === null ? "—" : `${row.avgSeconds.toFixed(1)}s`}
                      </td>
                      <td
                        className="px-3 py-1.5 text-right"
                        title={
                          row.trend === "up"
                            ? tPuzzle(locale, "puzzle.dashboard.motifs.trendUp")
                            : row.trend === "down"
                              ? tPuzzle(locale, "puzzle.dashboard.motifs.trendDown")
                              : row.trend === "flat"
                                ? tPuzzle(locale, "puzzle.dashboard.motifs.trendFlat")
                                : tPuzzle(locale, "puzzle.dashboard.motifs.trendUnknown")
                        }
                        aria-label={
                          row.trend === "up"
                            ? tPuzzle(locale, "puzzle.dashboard.motifs.trendUp")
                            : row.trend === "down"
                              ? tPuzzle(locale, "puzzle.dashboard.motifs.trendDown")
                              : row.trend === "flat"
                                ? tPuzzle(locale, "puzzle.dashboard.motifs.trendFlat")
                                : tPuzzle(locale, "puzzle.dashboard.motifs.trendUnknown")
                        }
                      >
                        <span aria-hidden>{row.trend === "up" ? "↗" : row.trend === "down" ? "↘" : row.trend === "flat" ? "→" : "·"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel as="section" aria-labelledby="weakest-motif-heading" className="mt-2 p-4">
              <h3 id="weakest-motif-heading" className="text-body font-semibold text-studio-fg">
                {tPuzzle(locale, "puzzle.dashboard.weakest.title")}
              </h3>
              {weakest ? (
                <Button
                  className="mt-2 transition-colors duration-150"
                  variant="secondary"
                  onClick={() => router.push(`/puzzles/play?mode=rated&theme=${weakest}`)}
                >
                  {tPuzzle(locale, "puzzle.dashboard.weakest.action", {
                    theme: tPuzzle(locale, THEME_LABEL_KEYS[weakest]),
                  })}
                </Button>
              ) : (
                <p className="mt-2 text-body text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.weakest.empty")}</p>
              )}
            </Panel>
          </>
        ) : null}

        <SectionHeading icon={History} className="mt-6">
          {tPuzzle(locale, "puzzle.dashboard.recentTitle")}
        </SectionHeading>
        {loading ? <Skeleton className="mt-2 w-40 text-body" /> : null}
        {progress && progress.history.length === 0 ? (
          <p className="mt-2 text-body text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.recentEmpty")}</p>
        ) : null}
        {progress && progress.history.length > 0 ? (
          <Panel as="ul" className="mt-2 divide-y divide-studio-border-subtle overflow-hidden">
            {progress.history.map((entry, index) => {
              const puzzle = puzzles.find((item) => item.id === entry.id);
              const themes = puzzle?.themes
                .slice(0, 2)
                .map((item) => tPuzzle(locale, THEME_LABEL_KEYS[item]))
                .join(" · ");
              return (
                <li key={`${entry.id}-${entry.at}-${index}`} className="flex h-8 items-center justify-between gap-3 px-3">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <div className="shrink-0 text-dense text-studio-fg">
                      {entry.success
                        ? tPuzzle(locale, "puzzle.dashboard.history.solved")
                        : tPuzzle(locale, "puzzle.dashboard.history.missed")}
                      {puzzle ? ` · ${formatInteger(locale, puzzle.rating)}` : ""}
                    </div>
                    <div className="truncate text-caption text-studio-muted">
                      {tPuzzle(locale, MODE_KEYS[entry.mode satisfies PuzzleMode])}
                      {themes ? ` · ${themes}` : ""}
                    </div>
                  </div>
                  <div
                    className={`text-dense font-medium tabular-nums ${
                      entry.delta > 0 ? "text-studio-success" : entry.delta < 0 ? "text-studio-warning-fg" : "text-studio-muted"
                    }`}
                  >
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta === 0 ? "—" : entry.delta}
                  </div>
                </li>
              );
            })}
          </Panel>
        ) : null}
        <p className="mt-6 text-center text-caption text-studio-faint">
          {tPuzzle(locale, "puzzle.dashboard.credit")}
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

/** SIG-1258: loading placeholder. One line tall (`1lh` of the parent's text size), so data arriving does not move the layout. */
function Skeleton({ className = "", lines = 1 }: { className?: string; lines?: number }) {
  return (
    <span
      aria-hidden
      style={{ height: `${lines}lh` }}
      className={`block animate-pulse rounded bg-studio-hover-strong ${className}`}
    />
  );
}

function SectionHeading({
  icon: Icon,
  className = "",
  children,
}: {
  icon: LucideIcon;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h2 className={`flex items-center gap-1.5 text-body font-semibold text-studio-fg ${className}`}>
      <Icon className="size-4 text-studio-faint" aria-hidden />
      {children}
    </h2>
  );
}

function ModeCard({
  icon: Icon,
  iconClass,
  title,
  detail,
  badge,
  body,
  action,
  onClick,
  href,
  pending = false,
}: {
  icon: LucideIcon;
  /** Text colour token for the icon only; the card surface is the same for every mode. */
  iconClass: string;
  title: string;
  detail: string | null;
  /** Pending count on the title row. Decorative: the detail line says the same for screen readers. */
  badge?: string;
  body: string | null;
  action: string;
  onClick: () => void;
  /** When set, the action is a link (secondary style) instead of a button. */
  href?: string;
  /** Loading: keep the action's slot but render it invisible and inert. */
  pending?: boolean;
}) {
  return (
    <Panel as="section" className="flex h-full flex-col p-3">
      <h2 className="flex items-center gap-1.5 text-body font-semibold text-studio-fg">
        <Icon className={`size-4 ${iconClass}`} aria-hidden />
        {title}
        {badge ? (
          <span aria-hidden data-testid="mistakes-badge" className="ml-auto">
            <Badge tone="accent">
              <span className="tabular-nums">{badge}</span>
            </Badge>
          </span>
        ) : null}
      </h2>
      <p className="mt-0.5 min-h-[1lh] text-caption text-studio-muted">{detail === null ? <Skeleton className="w-24" /> : detail}</p>
      <p className="mt-2 flex-1 text-dense text-studio-muted">{body === null ? <Skeleton lines={2} className="w-full" /> : body}</p>
      {href && !pending ? (
        <Link
          href={href}
          className="mt-3 inline-flex h-7 items-center justify-center gap-1.5 self-start rounded-lg bg-studio-hover-strong px-2.5 text-dense font-medium text-studio-fg transition-colors duration-150 hover:bg-studio-selected active:brightness-95"
        >
          {action}
        </Link>
      ) : (
        <Button
          className={`mt-3 self-start transition-colors duration-150 ${pending ? "invisible" : ""}`}
          size="sm"
          onClick={onClick}
          disabled={pending}
          aria-hidden={pending || undefined}
          tabIndex={pending ? -1 : undefined}
        >
          {action}
        </Button>
      )}
    </Panel>
  );
}

/**
 * SIG-1252: read-only preview of today's puzzle, linking to the daily mode.
 * Same start position and orientation as the trainer (`puzzle.fen`, side to
 * move at the bottom), no arrows or highlights, so it never gives the answer.
 * `puzzle === null` reserves the space so the hero does not jump on load.
 */
function DailyPreview({ puzzle, locale }: { puzzle: CompiledPuzzle | null; locale: SiteLocale }) {
  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const size = "size-40 sm:size-44";
  if (!puzzle) {
    return (
      <div aria-hidden className="flex shrink-0 flex-col items-center gap-1.5 self-center">
        <div className={`${size} rounded-lg bg-studio-bg`} />
        <Skeleton className="w-28 text-caption" />
      </div>
    );
  }
  const orientation = orientationFor(puzzle);
  const rating = formatInteger(locale, puzzle.rating);
  const themeStyles = boardSquareStyles(boardTheme);
  return (
    <Link
      href="/puzzles/play?mode=daily"
      aria-label={tPuzzle(locale, "puzzle.dashboard.preview.aria", {
        rating,
        side: tPuzzle(locale, orientation === "black" ? "puzzle.side.black" : "puzzle.side.white"),
      })}
      className="group flex shrink-0 flex-col items-center gap-1.5 self-center rounded-lg"
    >
      <div className={`relative ${size}`}>
        <div className="pointer-events-none size-full overflow-hidden rounded-lg ring-1 ring-studio-border-strong transition-shadow duration-150 group-hover:ring-studio-accent group-focus-visible:ring-studio-accent" aria-hidden>
          <Chessboard
            options={{
              id: `daily-preview-${puzzle.id}`,
              position: puzzle.fen,
              boardOrientation: orientation,
              showNotation: false,
              ...boardCoordinateOptions(boardTheme),
              allowDragging: false,
              allowDrawingArrows: false,
              arrows: [],
              lightSquareStyle: themeStyles.light,
              darkSquareStyle: themeStyles.dark,
              pieces: piecesForSet(pieceSet),
              boardStyle: { width: "100%", height: "100%" },
            }}
          />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-studio-scrim text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Play className="size-8 fill-current" strokeWidth={1.5} />
        </div>
      </div>
      <span className="text-caption text-studio-muted transition-colors duration-150 group-hover:text-studio-fg group-hover:underline group-focus-visible:text-studio-fg group-focus-visible:underline">
        {tPuzzle(locale, "puzzle.dashboard.preview.label", { rating })}
      </span>
    </Link>
  );
}
