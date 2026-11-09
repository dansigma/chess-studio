"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { useRouter } from "next/navigation";
import { CalendarDays, ChartNoAxesColumn, Flame, History, RotateCcw, Shapes, Zap, type LucideIcon } from "lucide-react";
import { SiteFooter } from "@/src/site/SiteFooter";
import { CourseChrome } from "@/src/courses/CourseChrome";
import type { SiteLocale } from "@/src/i18n/locale";
import { formatInteger } from "@/src/i18n/format";
import { tPuzzle, type PuzzleStringKey } from "@/src/i18n/puzzle-strings";
import { tMistakes } from "@/src/i18n/mistakes-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { Panel } from "@/src/studio/ui/Panel";
import { dueExercises, hydrateExercises, type MistakeExercisesMap } from "@/src/lib/mistake-exercises-store";
import { boardCoordinateOptions, boardSquareStyles } from "@/src/chess/board-themes";
import { piecesForSet } from "@/src/chess/piece-sets";
import { LevelBar } from "./XpBreakdown";
import { dailyPuzzle, dateKey, levelFromXp, type CompiledPuzzle } from "./engine";
import { orientationFor } from "./use-puzzle-feedback";
import { motifSummary, weakestMotif } from "./motif-stats";
import { loadPuzzleCatalog } from "./puzzle-client";
import { ProgressHeatmap } from "./ProgressHeatmap";
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
  const [loadError, setLoadError] = useState<boolean>(false);
  const [source, setSource] = useState<"account" | "browser">("browser");
  // SIG-1097: due mistake-exercise count for the "My mistakes" card.
  const [dueMistakes, setDueMistakes] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const supabase = createBrowserSupabase();
        const user = supabase ? (await supabase.auth.getUser()).data.user : null;
        const [loaded, catalog, exercises] = await Promise.all([
          hydratePuzzleProgress(user?.id ?? null),
          loadPuzzleCatalog(),
          hydrateExercises(user?.id ?? null),
        ]);
        const timestamp = Date.now();
        if (cancel) {
          return;
        }
        setProgress(loaded);
        setPuzzles(catalog);
        setNow(timestamp);
        setSource(progressSource());
        setDueMistakes(dueExercises(exercises as MistakeExercisesMap, new Date(timestamp)).length);
        setLoadError(false);
      } catch (error) {
        console.error("Failed to load puzzle progress.", error);
        if (!cancel) {
          setLoadError(true);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const daily = now === null ? null : dailyPuzzle(puzzles, now);
  const playedToday = Boolean(progress && now !== null && progress.daily === dateKey(now));
  const attempts = progress ? progress.solved + progress.failed : 0;
  const accuracy = progress && attempts > 0 ? Math.round((progress.solved / attempts) * 100) : null;
  const level = levelFromXp(progress?.xp ?? 0);
  // SIG-1103: per-motif rows, sorted by attempts desc; the weakest-motif
  // button reuses the existing `?mode=rated&theme=` deep link into training.
  const motifRows = progress ? motifSummary(progress) : [];
  const weakest = progress ? weakestMotif(progress) : null;

  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome />
      <main className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6">
        <Panel as="section" className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-title font-semibold text-studio-fg">{tPuzzle(locale, "puzzle.dashboard.heading")}</h1>
            <p className="mt-1 max-w-md text-body text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.intro")}</p>
            <Button
              className="mt-3 w-full sm:w-auto sm:min-w-40"
              variant="primary"
              onClick={() => router.push("/puzzles/play?mode=rated")}
            >
              {tPuzzle(locale, "puzzle.dashboard.solveNow")}
            </Button>
            {progress ? (
              <p className="mt-1.5 text-caption text-studio-muted">
                {source === "account"
                  ? tPuzzle(locale, "puzzle.dashboard.savedAccount")
                  : tPuzzle(locale, "puzzle.dashboard.savedBrowser")}
              </p>
            ) : null}
            {loadError ? (
              <p className="mt-2 text-body text-studio-warning-fg">{tPuzzle(locale, "puzzle.dashboard.loadError")}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-2 sm:w-44">
            <div>
              <div className="text-caption uppercase tracking-wide text-studio-muted">
                {tPuzzle(locale, "puzzle.dashboard.yourRating")}
              </div>
              <div className="text-title font-semibold tabular-nums text-studio-fg">
                {progress ? formatInteger(locale, progress.rating) : "—"}
              </div>
            </div>
            {progress ? (
              <div className="min-w-0 flex-1 sm:w-full sm:flex-none">
                <LevelBar level={level} locale={locale} compact />
              </div>
            ) : null}
          </div>
          {daily || (now === null && !loadError) ? <DailyPreview puzzle={daily} locale={locale} /> : null}
        </Panel>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={tPuzzle(locale, "puzzle.dashboard.stat.solved")} value={progress ? formatInteger(locale, progress.solved) : "—"} />
          <Stat
            label={tPuzzle(locale, "puzzle.dashboard.stat.accuracy")}
            value={accuracy === null ? "—" : `${formatInteger(locale, accuracy)}%`}
          />
          <Stat label={tPuzzle(locale, "puzzle.dashboard.stat.streak")} value={progress ? formatInteger(locale, progress.streak) : "—"} />
          <Stat
            label={tPuzzle(locale, "puzzle.dashboard.stat.bestStreak")}
            value={progress ? formatInteger(locale, progress.bestStreak) : "—"}
          />
        </dl>

        {progress && now !== null ? (
          <div className="mt-4">
            <ProgressHeatmap
              days={progress.days}
              today={localDayKey(now)}
              locale={locale}
              onStart={() => router.push("/puzzles/play?mode=rated")}
            />
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ModeCard
            icon={CalendarDays}
            title={tPuzzle(locale, "puzzle.dashboard.daily.title")}
            detail={
              daily
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
            title={tPuzzle(locale, "puzzle.dashboard.streak.title")}
            detail={
              progress
                ? tPuzzle(locale, "puzzle.dashboard.streak.best", { best: formatInteger(locale, progress.bestStreak) })
                : tPuzzle(locale, "puzzle.dashboard.streak.fallback")
            }
            body={tPuzzle(locale, "puzzle.dashboard.streak.body")}
            action={tPuzzle(locale, "puzzle.dashboard.streak.action")}
            onClick={() => router.push("/puzzles/play?mode=streak")}
          />
          <ModeCard
            icon={Zap}
            title={tPuzzle(locale, "puzzle.dashboard.rush.title")}
            detail={
              progress
                ? tPuzzle(locale, "puzzle.dashboard.rush.best", { best: formatInteger(locale, progress.rushBest) })
                : tPuzzle(locale, "puzzle.dashboard.rush.fallback")
            }
            body={tPuzzle(locale, "puzzle.dashboard.rush.body")}
            action={tPuzzle(locale, "puzzle.dashboard.rush.action")}
            onClick={() => router.push("/puzzles/play?mode=rush")}
          />
          <ModeCard
            icon={RotateCcw}
            title={tMistakes(locale, "mistakes.dashboard.title")}
            detail={
              dueMistakes === null
                ? tMistakes(locale, "mistakes.dashboard.empty")
                : dueMistakes === 0
                  ? tMistakes(locale, "mistakes.dashboard.empty")
                  : tMistakes(
                      locale,
                      dueMistakes === 1 ? "mistakes.dashboard.detail.one" : "mistakes.dashboard.detail.other",
                      { count: formatInteger(locale, dueMistakes) },
                    )
            }
            body={tMistakes(locale, "mistakes.dashboard.body")}
            action={tMistakes(locale, "mistakes.dashboard.action")}
            onClick={() => router.push("/puzzles/play?mode=mistakes")}
            disabled={dueMistakes === 0}
          />
        </div>

        <SectionHeading icon={Shapes} className="mt-6">
          {tPuzzle(locale, "puzzle.dashboard.themesTitle")}
        </SectionHeading>
        <p className="mt-0.5 text-dense text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.themesSubtitle")}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {THEME_CARDS.map((theme) => {
            const count = puzzles.filter((puzzleItem) => puzzleItem.themes.includes(theme.id)).length;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => router.push(`/puzzles/play?mode=rated&theme=${theme.id}`)}
                className="rounded-[10px] border border-transparent bg-studio-panel px-3 py-2 text-left hover:border-studio-border-strong"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body font-semibold text-studio-fg">{tPuzzle(locale, theme.labelKey)}</span>
                  <span className="text-caption tabular-nums text-studio-faint">{count}</span>
                </div>
                <p className="mt-0.5 text-dense text-studio-muted">{tPuzzle(locale, theme.blurbKey)}</p>
              </button>
            );
          })}
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
                  className="mt-2"
                  variant="primary"
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Panel className="px-3 py-2">
      <dt className="text-caption uppercase tracking-wide text-studio-muted">{label}</dt>
      <dd className="mt-0.5 text-title font-semibold tabular-nums text-studio-fg">{value}</dd>
    </Panel>
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
  title,
  detail,
  body,
  action,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  body: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Panel as="section" className="flex flex-col p-3">
      <h2 className="flex items-center gap-1.5 text-body font-semibold text-studio-fg">
        <Icon className="size-4 text-studio-faint" aria-hidden />
        {title}
      </h2>
      <p className="mt-0.5 text-caption text-studio-accent-text">{detail}</p>
      <p className="mt-2 flex-1 text-dense text-studio-muted">{body}</p>
      <Button className="mt-3 self-start" size="sm" onClick={onClick} disabled={disabled}>
        {action}
      </Button>
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
    return <div aria-hidden className={`${size} shrink-0 self-center rounded-lg bg-studio-bg`} />;
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
      <div className={`pointer-events-none ${size} overflow-hidden rounded-lg ring-1 ring-studio-border-strong`} aria-hidden>
        <Chessboard
          options={{
            id: `puzzle-preview-${puzzle.id}`,
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
      <span className="text-caption text-studio-muted group-hover:text-studio-fg">
        {tPuzzle(locale, "puzzle.dashboard.preview.label", { rating })}
      </span>
    </Link>
  );
}
