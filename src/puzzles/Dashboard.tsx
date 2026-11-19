"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChartNoAxesColumn,
  Check,
  Flame,
  History,
  Microscope,
  Play,
  RotateCcw,
  Shapes,
  Target,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { SiteFooter } from "@/src/site/SiteFooter";
import { SiteHeader as CourseChrome } from "@/src/site/SiteHeader";
import { Skeleton } from "@/src/site/ui/Skeleton";
import type { SiteLocale } from "@/src/i18n/locale";
import { formatDuration, formatInteger } from "@/src/i18n/format";
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
import { compilePuzzle, dailyPuzzle, dateKey, levelFromXp, type CompiledPuzzle } from "./engine";
import { orientationFor } from "./use-puzzle-feedback";
import { exerciseKeyForPuzzle, exerciseToPuzzle } from "./mistake-puzzle";
import { motifSummary, weakestMotif } from "./motif-stats";
import { loadPuzzleById, loadPuzzleCatalog } from "./puzzle-client";
import { ProgressHeatmap, StreakMetrics } from "./ProgressHeatmap";
import { localDayKey } from "./activity";
import { hydratePuzzleProgress, progressSource } from "./progress";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { openPuzzleInStudio, type StudioPuzzle } from "./studio-handoff";
import { THEME_CARDS, THEME_LABEL_KEYS, type PuzzleHistoryEntry, type PuzzleMode, type PuzzleProgress } from "./types";

const MODE_KEYS: Record<PuzzleMode, PuzzleStringKey> = {
  rated: "puzzle.mode.rated",
  streak: "puzzle.mode.streak",
  rush: "puzzle.mode.rush",
  daily: "puzzle.mode.daily",
  mistakes: "puzzle.mode.mistakes",
} as const;

/** Attempts shown in Recent (the stored history keeps more). */
const RECENT_LIMIT = 10;
const RECENT_LIMIT_MOBILE = 5;

export function PuzzleDashboard() {
  const router = useRouter();
  const locale = useStudioStore((state) => state.settings.locale);
  const [progress, setProgress] = useState<PuzzleProgress | null>(null);
  const [puzzles, setPuzzles] = useState<CompiledPuzzle[]>([]);
  const [exercises, setExercises] = useState<MistakeExercisesMap>({});
  const [now, setNow] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // SIG-1258: known only once the load has read the auth user; null = not known yet.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [source, setSource] = useState<"account" | "browser">("browser");
  // SIG-1097: due mistake-exercise count for the "My mistakes" card.
  const [dueMistakes, setDueMistakes] = useState<number | null>(null);
  // SIG-1256 / SIG-1412: difficulty filter shared between hero Solve now and theme links; null = All (normal rated session).
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const openingRef = useRef<{ rowKey: string; controller: AbortController | null; seq: number } | null>(null);
  const openingSeqRef = useRef(0);
  const mountedRef = useRef(true);

  // Bumped on every load and on unmount, so a stale response is dropped.
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    const stale = () => requestId.current !== id;
    try {
      const supabase = createBrowserSupabase();
      const user = supabase ? (await supabase.auth.getUser()).data.user : null;
      const [loaded, catalog, loadedExercises] = await Promise.all([
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
      setExercises(loadedExercises as MistakeExercisesMap);
      setNow(timestamp);
      setSource(progressSource());
      setSignedIn(Boolean(user));
      setDueMistakes(dueExercises(loadedExercises as MistakeExercisesMap, new Date(timestamp)).length);
      setStatus("ready");
    } catch (error) {
      console.error("Failed to load puzzle progress.", error);
      if (!stale()) {
        // No partial data: zeros would read as real progress.
        setProgress(null);
        setPuzzles([]);
        setExercises({});
        setNow(null);
        setSignedIn(null);
        setDueMistakes(null);
        setStatus("error");
      }
    }
  }, []);

  const retry = useCallback(() => {
    openingRef.current?.controller?.abort();
    openingRef.current = null;
    setOpeningKey(null);
    setStatus("loading");
    setRecentError(null);
    void load();
  }, [load]);

  /* eslint-disable react-hooks/set-state-in-effect -- SIG-1258: initial fetch; state is only set after the awaits. */
  useEffect(() => {
    mountedRef.current = true;
    void load();
    const ref = requestId;
    return () => {
      mountedRef.current = false;
      ref.current += 1;
      openingRef.current?.controller?.abort();
      openingRef.current = null;
    };
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const openRecent = useCallback(
    async (entry: PuzzleHistoryEntry, rowKey: string) => {
      if (openingRef.current?.rowKey === rowKey) {
        return;
      }
      // Last clicked row wins: cancel any earlier lookup so it cannot clobber
      // or hijack navigation after the user picks another Recent row.
      openingRef.current?.controller?.abort();
      const seq = openingSeqRef.current + 1;
      openingSeqRef.current = seq;
      openingRef.current = null;
      setOpeningKey(null);
      setRecentError(null);

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const push = (href: string) => router.push(href);
      const openNow = (puzzle: StudioPuzzle) => {
        openingRef.current = { rowKey, controller: null, seq };
        setOpeningKey(rowKey);
        openPuzzleInStudio(puzzle, entry.mode, locale, push, origin);
      };

      if (entry.mode === "mistakes" || entry.id.startsWith("mx-")) {
        const stored = exercises[exerciseKeyForPuzzle(entry.id)] ?? exercises[entry.id];
        const converted = stored ? exerciseToPuzzle(stored.exercise) : null;
        let compiled: StudioPuzzle | null = null;
        if (converted) {
          try {
            compiled = compilePuzzle(converted);
          } catch {
            compiled = null;
          }
        }
        if (compiled) {
          openNow(compiled);
        } else {
          setRecentError(tPuzzle(locale, "puzzle.dashboard.recent.notFound"));
        }
        return;
      }

      const cached = puzzles.find((item) => item.id === entry.id);
      if (cached) {
        openNow(cached);
        return;
      }

      const controller = new AbortController();
      openingRef.current = { rowKey, controller, seq };
      setOpeningKey(rowKey);
      try {
        const loaded = await loadPuzzleById(entry.id, { signal: controller.signal });
        if (!mountedRef.current || openingRef.current?.seq !== seq) {
          return;
        }
        if (!loaded) {
          openingRef.current = null;
          setOpeningKey(null);
          setRecentError(tPuzzle(locale, "puzzle.dashboard.recent.notFound"));
          return;
        }
        openingRef.current = { rowKey, controller: null, seq };
        openPuzzleInStudio(loaded, entry.mode, locale, push, origin);
      } catch {
        if (!mountedRef.current || openingRef.current?.seq !== seq) {
          return;
        }
        openingRef.current = null;
        setOpeningKey(null);
        setRecentError(tPuzzle(locale, "puzzle.dashboard.recent.loadError"));
      }
    },
    [exercises, locale, puzzles, router],
  );

  const loading = status === "loading";
  const failed = status === "error";

  const solveNowHref = difficulty
    ? `/puzzles/play?mode=rated&difficulty=${difficulty}`
    : "/puzzles/play?mode=rated";

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
  // The callout shows the same rounded % as the table row (no recalculation).
  const weakestRow = weakest ? (motifRows.find((row) => row.theme === weakest) ?? null) : null;

  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome />
      <main className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6" aria-busy={loading}>
        <Panel as="section" className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-8 text-studio-fg sm:text-[28px] sm:leading-9">{tPuzzle(locale, "puzzle.dashboard.heading")}</h1>
            <p className="mt-2 max-w-md text-body text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.intro")}</p>
            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <Button
                className="w-full shrink-0 transition-colors duration-150 max-sm:h-11 sm:w-auto sm:min-w-40"
                variant="primary"
                onClick={() => router.push(solveNowHref)}
              >
                {tPuzzle(locale, "puzzle.dashboard.solveNow")}
              </Button>
              <DifficultySegmented difficulty={difficulty} onChange={setDifficulty} locale={locale} />
            </div>
            {difficulty ? (
              <p className="mt-1.5 text-caption text-studio-muted" data-testid="hero-difficulty-unrated">
                {tPuzzle(locale, "puzzle.panel.unrated")}
              </p>
            ) : null}
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
                  className="text-studio-accent-text underline-offset-2 transition-colors duration-150 hover:text-studio-fg hover:underline max-sm:-mb-[25px] max-sm:-mt-1 max-sm:inline-block max-sm:pb-[25px] max-sm:pt-1"
                >
                  {tPuzzle(locale, "puzzle.dashboard.signIn.link")}
                </Link>{" "}
                {tPuzzle(locale, "puzzle.dashboard.signIn.rest")}
              </p>
            ) : null}
            {failed ? (
              <div role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="text-body text-studio-warning-fg">{tPuzzle(locale, "puzzle.dashboard.loadError")}</p>
                <Button size="sm" variant="secondary" className="transition-colors duration-150 max-sm:h-11" onClick={retry}>
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
          className="mt-2 flex flex-wrap gap-1.5 max-sm:[&_button]:relative max-sm:[&_button]:after:absolute max-sm:[&_button]:after:inset-x-0 max-sm:[&_button]:after:-bottom-[9px] max-sm:[&_button]:after:-top-[15px] max-sm:[&_button]:after:content-['']"
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

        {/* SIG-1267: From lg, By motif (~65%) and Recent (~35%) sit side by side; with no motif rows, Recent takes the full width. */}
        <div
          className={`mt-6 grid gap-x-4 gap-y-6 lg:items-start ${motifRows.length > 0 ? "lg:grid-cols-[13fr_7fr]" : ""}`}
        >
        {motifRows.length > 0 ? (
          <section className="min-w-0">
            <SectionHeading icon={ChartNoAxesColumn}>
              {tPuzzle(locale, "puzzle.dashboard.motifsTitle")}
            </SectionHeading>
            {weakestRow ? (
              <Panel className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                <Target aria-hidden className="size-4 shrink-0 text-studio-accent-text" />
                <p className="min-w-0 flex-1 basis-48 text-body text-studio-fg">
                  {tPuzzle(locale, "puzzle.dashboard.motifs.focus", {
                    theme: tPuzzle(locale, THEME_LABEL_KEYS[weakestRow.theme]),
                    pct: formatInteger(locale, weakestRow.successPct),
                  })}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="transition-colors duration-150 max-sm:h-11"
                  onClick={() => router.push(`/puzzles/play?mode=rated&theme=${weakestRow.theme}`)}
                >
                  {tPuzzle(locale, "puzzle.dashboard.motifs.train")}
                </Button>
              </Panel>
            ) : null}
            <p className="mt-2 text-dense text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.motifsSubtitle")}</p>
            <Panel className="mt-2 overflow-hidden">
              <table className="w-full text-dense">
                <thead>
                  <tr className="text-left text-caption uppercase tracking-normal sm:tracking-wide text-studio-muted">
                    <th scope="col" className="px-2 py-1.5 sm:px-3 font-medium">
                      {tPuzzle(locale, "puzzle.dashboard.motifs.motif")}
                    </th>
                    <th scope="col" className="px-2 py-1.5 sm:px-3 text-right font-medium tabular-nums">
                      {tPuzzle(locale, "puzzle.dashboard.motifs.attempts")}
                    </th>
                    <th scope="col" className="px-2 py-1.5 sm:px-3 text-right font-medium tabular-nums">
                      {tPuzzle(locale, "puzzle.dashboard.motifs.successRate")}
                    </th>
                    <th scope="col" className="hidden px-2 py-1.5 text-right font-medium tabular-nums sm:table-cell sm:px-3">
                      {tPuzzle(locale, "puzzle.dashboard.motifs.avgTime")}
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-right font-medium max-[359px]:hidden sm:px-3">
                      <span className="sr-only">{tPuzzle(locale, "puzzle.dashboard.motifs.trendFlat")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-studio-border">
                  {motifRows.map((row) => (
                    <tr key={row.theme}>
                      <td className="px-2 py-1.5 sm:px-3 font-semibold text-studio-fg">
                        {tPuzzle(locale, THEME_LABEL_KEYS[row.theme])}
                      </td>
                      <td className="px-2 py-1.5 sm:px-3 text-right tabular-nums text-studio-muted">
                        {formatInteger(locale, row.attempts)}
                      </td>
                      <td className="px-2 py-1.5 sm:px-3 text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          <span aria-hidden className="h-1.5 w-6 shrink-0 max-[359px]:hidden overflow-hidden rounded-full bg-studio-border sm:w-14">
                            <span
                              className={`block h-full rounded-full ${row.theme === weakest ? "bg-studio-accent" : "bg-studio-muted"}`}
                              style={{ width: `${Math.max(0, Math.min(100, row.successPct))}%` }}
                            />
                          </span>
                          <span
                            className={`tabular-nums ${row.theme === weakest ? "font-semibold text-studio-accent-text" : "text-studio-fg"}`}
                          >
                            {formatInteger(locale, row.successPct)}%
                          </span>
                        </span>
                      </td>
                      <td className="hidden px-2 py-1.5 text-right tabular-nums text-studio-muted sm:table-cell sm:px-3">
                        {row.avgSeconds === null ? "—" : `${row.avgSeconds.toFixed(1)}s`}
                      </td>
                      <td
                        className="px-2 py-1.5 text-right max-[359px]:hidden sm:px-3"
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
          </section>
        ) : null}

        <section className="min-w-0">
        <SectionHeading icon={History}>
          {tPuzzle(locale, "puzzle.dashboard.recentTitle")}
        </SectionHeading>
        {loading ? <Skeleton className="mt-2 w-40 text-body" /> : null}
        {progress && progress.history.length === 0 ? (
          <p className="mt-2 text-body text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.recentEmpty")}</p>
        ) : null}
        {progress && progress.history.length > 0 ? (
          <Panel as="ul" className="mt-2 divide-y divide-studio-border-subtle overflow-hidden">
            {/* SIG-1267: display only the last 10; `progress.history` itself keeps 20. SIG-1269: below `sm` only the first 5 show (CSS, so SSR and hydration agree). */}
            {progress.history.slice(0, RECENT_LIMIT).map((entry, index) => {
              const rowKey = `${entry.id}-${entry.at}-${index}`;
              const isOpening = openingKey === rowKey;
              // SIG-1268: themes, time and rating come from the entry itself (older entries have none).
              const themes = (entry.themes ?? []).filter((item) => item in THEME_LABEL_KEYS).slice(0, 2);
              // "Rated" is the default, so only the other modes are named.
              const modeLabel = entry.mode === "rated" ? "" : tPuzzle(locale, MODE_KEYS[entry.mode satisfies PuzzleMode]);
              const ResultIcon = entry.success ? Check : X;
              const outcomeLabel = entry.success
                ? tPuzzle(locale, "puzzle.dashboard.history.solved")
                : tPuzzle(locale, "puzzle.dashboard.history.missed");
              const ratingText = entry.puzzleRating !== undefined ? formatInteger(locale, entry.puzzleRating) : null;
              const timeText = entry.ms !== undefined ? formatDuration(locale, entry.ms) : null;
              const deltaText = entry.delta > 0 ? `+${entry.delta}` : entry.delta === 0 ? "—" : String(entry.delta);
              const rowSummary = [
                outcomeLabel,
                ratingText,
                ...themes.map((item) => tPuzzle(locale, THEME_LABEL_KEYS[item])),
                timeText,
                modeLabel || null,
                entry.delta !== 0 ? deltaText : null,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <li
                  key={rowKey}
                  className={index >= RECENT_LIMIT_MOBILE ? "max-sm:hidden" : undefined}
                >
                  <button
                    type="button"
                    onClick={() => void openRecent(entry, rowKey)}
                    disabled={isOpening}
                    aria-busy={isOpening || undefined}
                    aria-label={tPuzzle(locale, "puzzle.dashboard.recent.openAria", { summary: rowSummary })}
                    title={tPuzzle(locale, "puzzle.studio.analyze")}
                    className="group flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left transition-colors duration-150 hover:bg-studio-hover focus-visible:bg-studio-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-studio-accent disabled:cursor-wait disabled:opacity-60 sm:h-8 sm:min-h-0"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ResultIcon aria-hidden className={`size-4 shrink-0 ${entry.success ? "text-studio-success" : "text-studio-warning-fg"}`} />
                      <span className="sr-only">{outcomeLabel}</span>
                      {ratingText ? (
                        <span className="shrink-0 text-dense tabular-nums text-studio-fg">{ratingText}</span>
                      ) : null}
                      {/* One line tall: a pill that does not fit wraps out of view, so the second theme drops first. */}
                      {themes.length > 0 ? (
                        <span className="flex h-[18px] min-w-0 flex-wrap gap-1 overflow-hidden">
                          {themes.map((item) => (
                            <Badge key={item}>{tPuzzle(locale, THEME_LABEL_KEYS[item])}</Badge>
                          ))}
                        </span>
                      ) : null}
                      {timeText ? (
                        <span className="shrink-0 text-caption tabular-nums text-studio-muted">
                          <span className="sr-only">{tPuzzle(locale, "puzzle.dashboard.history.time")} </span>
                          {timeText}
                        </span>
                      ) : null}
                      {modeLabel ? <span className="min-w-0 truncate text-caption text-studio-muted">{modeLabel}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className={`text-dense font-medium tabular-nums ${
                          entry.delta > 0 ? "text-studio-success" : entry.delta < 0 ? "text-studio-warning-fg" : "text-studio-muted"
                        }`}
                      >
                        {deltaText}
                      </span>
                      <Microscope
                        aria-hidden
                        className={`size-3.5 shrink-0 transition-opacity duration-150 ${
                          isOpening
                            ? "animate-pulse text-studio-accent-text opacity-100"
                            : "text-studio-faint opacity-0 group-hover:text-studio-accent-text group-hover:opacity-100 group-focus-visible:text-studio-accent-text group-focus-visible:opacity-100 max-sm:opacity-60"
                        }`}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </Panel>
        ) : null}
        {recentError ? (
          <p role="status" className="mt-2 text-dense text-studio-warning-fg">
            {recentError}
          </p>
        ) : null}
        </section>
        </div>
        <p className="mt-6 text-center text-caption text-studio-faint">
          {tPuzzle(locale, "puzzle.dashboard.credit")}
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

const DIFFICULTY_OPTIONS: readonly (Difficulty | null)[] = [null, ...DIFFICULTIES];

function DifficultySegmented({
  difficulty,
  onChange,
  locale,
}: {
  difficulty: Difficulty | null;
  onChange: (value: Difficulty | null) => void;
  locale: SiteLocale;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = (index + step + DIFFICULTY_OPTIONS.length) % DIFFICULTY_OPTIONS.length;
    onChange(DIFFICULTY_OPTIONS[next] ?? null);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={tPuzzle(locale, "puzzle.difficulty.label")}
      className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-studio-bg p-0.5"
    >
      {DIFFICULTY_OPTIONS.map((option, index) => {
        const selected = option === difficulty;
        const label =
          option === null
            ? tPuzzle(locale, "puzzle.difficulty.all")
            : tPuzzle(locale, `puzzle.difficulty.${option}`);
        return (
          <button
            key={option ?? "all"}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`min-h-11 rounded-md px-2.5 text-dense font-medium whitespace-nowrap transition-colors duration-150 sm:h-7 sm:min-h-0 ${
              selected
                ? "bg-studio-accent-soft text-studio-accent-text"
                : "text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
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
          className="mt-3 inline-flex h-7 items-center justify-center max-sm:h-11 gap-1.5 self-start rounded-lg bg-studio-hover-strong px-2.5 text-dense font-medium text-studio-fg transition-colors duration-150 hover:bg-studio-selected active:brightness-95"
        >
          {action}
        </Link>
      ) : (
        <Button
          className={`mt-3 self-start transition-colors duration-150 max-sm:h-11 ${pending ? "invisible" : ""}`}
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
            key={`daily-preview-${puzzle.id}-${pieceSet}`}
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
