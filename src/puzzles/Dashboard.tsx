"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown } from "lucide-react";
import { SiteFooter } from "@/src/site/SiteFooter";
import { CourseChrome } from "@/src/courses/CourseChrome";
import { formatInteger } from "@/src/i18n/format";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { dailyPuzzle, dateKey, levelFromXp, type CompiledPuzzle } from "./engine";
import { motifSummary, weakestMotif } from "./motif-stats";
import { loadPuzzleCatalog } from "./puzzle-client";
import { hydratePuzzleProgress, progressSource } from "./progress";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { THEME_CARDS, THEME_LABEL_KEYS, type PuzzleMode, type PuzzleProgress } from "./types";

const MODE_KEYS = {
  rated: "puzzle.mode.rated",
  streak: "puzzle.mode.streak",
  rush: "puzzle.mode.rush",
  daily: "puzzle.mode.daily",
} as const;

export function PuzzleDashboard() {
  const router = useRouter();
  const locale = useStudioStore((state) => state.settings.locale);
  const [progress, setProgress] = useState<PuzzleProgress | null>(null);
  const [puzzles, setPuzzles] = useState<CompiledPuzzle[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [source, setSource] = useState<"account" | "browser">("browser");

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const supabase = createBrowserSupabase();
        const user = supabase ? (await supabase.auth.getUser()).data.user : null;
        const [loaded, catalog] = await Promise.all([
          hydratePuzzleProgress(user?.id ?? null),
          loadPuzzleCatalog(),
        ]);
        const timestamp = Date.now();
        if (cancel) {
          return;
        }
        setProgress(loaded);
        setPuzzles(catalog);
        setNow(timestamp);
        setSource(progressSource());
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
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold text-studio-fg">{tPuzzle(locale, "puzzle.dashboard.heading")}</h1>
            <p className="mt-2 max-w-2xl text-body text-studio-muted">
              {tPuzzle(locale, "puzzle.dashboard.intro")}
            </p>
          </div>
          <div className="rounded-xl border border-studio-border bg-studio-chrome px-5 py-4">
            <div className="text-caption uppercase tracking-wide text-studio-muted">
              {tPuzzle(locale, "puzzle.dashboard.yourRating")}
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-studio-fg">
              {progress ? formatInteger(locale, progress.rating) : "—"}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-caption tabular-nums text-studio-muted">
                <Crown className="size-3 text-studio-warning-fg" aria-hidden />
                {progress ? level.level : "—"}
              </span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-studio-bg">
                <div
                  className="h-full rounded-full bg-studio-success"
                  style={{ width: progress ? `${(level.into / level.span) * 100}%` : "0%" }}
                />
              </div>
            </div>
            <Button className="mt-3" variant="primary" onClick={() => router.push("/puzzles/play?mode=rated")}>
              {tPuzzle(locale, "puzzle.dashboard.startTraining")}
            </Button>
            {progress ? (
              <p className="mt-2 text-caption text-studio-muted">
                {source === "account"
                  ? tPuzzle(locale, "puzzle.dashboard.savedAccount")
                  : tPuzzle(locale, "puzzle.dashboard.savedBrowser")}
              </p>
            ) : null}
            {loadError ? (
              <p className="mt-3 text-body text-studio-warning-fg">{tPuzzle(locale, "puzzle.dashboard.loadError")}</p>
            ) : null}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <ModeCard
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
        </div>

        <h2 className="mt-10 text-title font-semibold text-studio-fg">
          {tPuzzle(locale, "puzzle.dashboard.themesTitle")}
        </h2>
        <p className="mt-1 text-body text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.themesSubtitle")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEME_CARDS.map((theme) => {
            const count = puzzles.filter((puzzleItem) => puzzleItem.themes.includes(theme.id)).length;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => router.push(`/puzzles/play?mode=rated&theme=${theme.id}`)}
                className="rounded-xl border border-studio-border bg-studio-chrome px-4 py-3 text-left hover:border-studio-border-strong"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-studio-fg">{tPuzzle(locale, theme.labelKey)}</span>
                  <span className="text-caption tabular-nums text-studio-faint">{count}</span>
                </div>
                <p className="mt-1 text-body text-studio-muted">{tPuzzle(locale, theme.blurbKey)}</p>
              </button>
            );
          })}
        </div>

        {motifRows.length > 0 ? (
          <>
            <h2 className="mt-10 text-title font-semibold text-studio-fg">
              {tPuzzle(locale, "puzzle.dashboard.motifsTitle")}
            </h2>
            <p className="mt-1 text-body text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.motifsSubtitle")}</p>
            <div className="mt-4 overflow-hidden rounded-xl border border-studio-border bg-studio-chrome">
              <table className="w-full text-body">
                <thead>
                  <tr className="text-left text-caption uppercase tracking-wide text-studio-muted">
                    <th scope="col" className="px-4 py-2 font-medium">
                      {tPuzzle(locale, "puzzle.dashboard.themesTitle")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium tabular-nums">
                      {tPuzzle(locale, "puzzle.dashboard.motifs.attempts")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium tabular-nums">
                      {tPuzzle(locale, "puzzle.dashboard.motifs.successRate")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium tabular-nums">
                      {tPuzzle(locale, "puzzle.dashboard.motifs.avgTime")}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      <span className="sr-only">{tPuzzle(locale, "puzzle.dashboard.motifs.trendFlat")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-studio-border">
                  {motifRows.map((row) => (
                    <tr key={row.theme}>
                      <td className="px-4 py-2 font-semibold text-studio-fg">
                        {tPuzzle(locale, THEME_LABEL_KEYS[row.theme])}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-studio-muted">
                        {formatInteger(locale, row.attempts)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-studio-fg">
                        {formatInteger(locale, row.successPct)}%
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-studio-muted">
                        {row.avgSeconds === null ? "—" : `${row.avgSeconds.toFixed(1)}s`}
                      </td>
                      <td
                        className="px-4 py-2 text-right"
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
            </div>
            <section aria-labelledby="weakest-motif-heading" className="mt-4 rounded-xl border border-studio-border bg-studio-chrome p-5">
              <h3 id="weakest-motif-heading" className="text-lg font-semibold text-studio-fg">
                {tPuzzle(locale, "puzzle.dashboard.weakest.title")}
              </h3>
              {weakest ? (
                <Button
                  className="mt-3"
                  variant="primary"
                  onClick={() => router.push(`/puzzles/play?mode=rated&theme=${weakest}`)}
                >
                  {tPuzzle(locale, "puzzle.dashboard.weakest.action", {
                    theme: tPuzzle(locale, THEME_LABEL_KEYS[weakest]),
                  })}
                </Button>
              ) : (
                <p className="mt-3 text-body text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.weakest.empty")}</p>
              )}
            </section>
          </>
        ) : null}

        <h2 className="mt-10 text-title font-semibold text-studio-fg">
          {tPuzzle(locale, "puzzle.dashboard.recentTitle")}
        </h2>
        {progress && progress.history.length === 0 ? (
          <p className="mt-3 text-body text-studio-muted">{tPuzzle(locale, "puzzle.dashboard.recentEmpty")}</p>
        ) : null}
        {progress && progress.history.length > 0 ? (
          <ul className="mt-3 divide-y divide-studio-border overflow-hidden rounded-xl border border-studio-border bg-studio-chrome">
            {progress.history.map((entry, index) => {
              const puzzle = puzzles.find((item) => item.id === entry.id);
              const themes = puzzle?.themes
                .slice(0, 2)
                .map((item) => tPuzzle(locale, THEME_LABEL_KEYS[item]))
                .join(" · ");
              return (
                <li key={`${entry.id}-${entry.at}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="text-body text-studio-fg">
                      {entry.success
                        ? tPuzzle(locale, "puzzle.dashboard.history.solved")
                        : tPuzzle(locale, "puzzle.dashboard.history.missed")}
                      {puzzle ? ` · ${formatInteger(locale, puzzle.rating)}` : ""}
                    </div>
                    <div className="text-caption text-studio-muted">
                      {tPuzzle(locale, MODE_KEYS[entry.mode satisfies PuzzleMode])}
                      {themes ? ` · ${themes}` : ""}
                    </div>
                  </div>
                  <div
                    className={`text-body font-medium tabular-nums ${
                      entry.delta > 0 ? "text-studio-success" : entry.delta < 0 ? "text-studio-warning-fg" : "text-studio-muted"
                    }`}
                  >
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta === 0 ? "—" : entry.delta}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        <p className="mt-8 text-center text-caption text-studio-faint">
          {tPuzzle(locale, "puzzle.dashboard.credit")}
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-studio-border bg-studio-chrome px-4 py-3">
      <dt className="text-caption uppercase tracking-wide text-studio-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-studio-fg">{value}</dd>
    </div>
  );
}

function ModeCard({
  title,
  detail,
  body,
  action,
  onClick,
}: {
  title: string;
  detail: string;
  body: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-studio-border bg-studio-chrome p-5">
      <h2 className="text-lg font-semibold text-studio-fg">{title}</h2>
      <p className="mt-1 text-caption text-studio-accent-text">{detail}</p>
      <p className="mt-3 flex-1 text-body text-studio-muted">{body}</p>
      <Button className="mt-4 self-start" onClick={onClick}>
        {action}
      </Button>
    </section>
  );
}
