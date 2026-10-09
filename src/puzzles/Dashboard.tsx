"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown } from "lucide-react";
import { CourseChrome } from "@/src/courses/CourseChrome";
import { Button } from "@/src/studio/ui/Button";
import { dailyPuzzle, dateKey, levelFromXp, type CompiledPuzzle } from "./engine";
import { loadPuzzleCatalog } from "./puzzle-client";
import { hydratePuzzleProgress, progressSource } from "./progress";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { THEME_CARDS, THEME_LABELS, type PuzzleMode, type PuzzleProgress } from "./types";

const MODE_LABELS: Record<PuzzleMode, string> = {
  rated: "Rated",
  streak: "Streak",
  rush: "Rush",
  daily: "Daily",
};

export function PuzzleDashboard() {
  const router = useRouter();
  const [progress, setProgress] = useState<PuzzleProgress | null>(null);
  const [puzzles, setPuzzles] = useState<CompiledPuzzle[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
        setLoadError(null);
      } catch (error) {
        console.error("Failed to load puzzle progress.", error);
        if (!cancel) {
          setLoadError("Could not load your puzzle progress.");
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

  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold text-studio-fg">Puzzles</h1>
            <p className="mt-2 max-w-2xl text-body text-studio-muted">
              Find the best move. Rated training, a daily puzzle, a streak that ends on the first miss, and a 3-minute rush with three misses.
            </p>
          </div>
          <div className="rounded-xl border border-studio-border bg-studio-chrome px-5 py-4">
            <div className="text-caption uppercase tracking-wide text-studio-muted">Your rating</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-studio-fg">{progress?.rating ?? "—"}</div>
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
              Start training
            </Button>
            {progress ? (
              <p className="mt-2 text-caption text-studio-muted">
                {source === "account" ? "Saved to your account" : "Saved in this browser"}
              </p>
            ) : null}
            {loadError ? <p className="mt-3 text-body text-studio-warning-fg">{loadError}</p> : null}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Solved" value={progress ? String(progress.solved) : "—"} />
          <Stat label="Accuracy" value={accuracy === null ? "—" : `${accuracy}%`} />
          <Stat label="Streak" value={progress ? String(progress.streak) : "—"} />
          <Stat label="Best streak" value={progress ? String(progress.bestStreak) : "—"} />
        </dl>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <ModeCard
            title="Daily puzzle"
            detail={
              daily
                ? `${playedToday ? "Solved today" : "Today"} · ${daily.rating}`
                : "One puzzle, same for everyone today"
            }
            body="A single position for the day. It does not change your rating."
            action={playedToday ? "Review" : "Play"}
            onClick={() => router.push("/puzzles/play?mode=daily")}
          />
          <ModeCard
            title="Streak"
            detail={progress ? `Best ${progress.bestStreak}` : "Survive as long as you can"}
            body="Puzzles get harder after each solve. The run ends on the first miss."
            action="Start streak"
            onClick={() => router.push("/puzzles/play?mode=streak")}
          />
          <ModeCard
            title="Rush"
            detail={progress ? `Best ${progress.rushBest}` : "3:00"}
            body="Three minutes. Score as many as you can. Three misses, or the clock, ends the run."
            action="Start rush"
            onClick={() => router.push("/puzzles/play?mode=rush")}
          />
        </div>

        <h2 className="mt-10 text-title font-semibold text-studio-fg">Themes</h2>
        <p className="mt-1 text-body text-studio-muted">Train one motif. These puzzles still count toward your rating.</p>
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
                  <span className="font-semibold text-studio-fg">{theme.label}</span>
                  <span className="text-caption tabular-nums text-studio-faint">{count}</span>
                </div>
                <p className="mt-1 text-body text-studio-muted">{theme.blurb}</p>
              </button>
            );
          })}
        </div>

        <h2 className="mt-10 text-title font-semibold text-studio-fg">Recent</h2>
        {progress && progress.history.length === 0 ? (
          <p className="mt-3 text-body text-studio-muted">No puzzles played yet.</p>
        ) : null}
        {progress && progress.history.length > 0 ? (
          <ul className="mt-3 divide-y divide-studio-border overflow-hidden rounded-xl border border-studio-border bg-studio-chrome">
            {progress.history.map((entry, index) => {
              const puzzle = puzzles.find((item) => item.id === entry.id);
              const themes = puzzle?.themes.slice(0, 2).map((item) => THEME_LABELS[item]).join(" · ");
              return (
                <li key={`${entry.id}-${entry.at}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="text-body text-studio-fg">
                      {entry.success ? "Solved" : "Missed"}
                      {puzzle ? ` · ${puzzle.rating}` : ""}
                    </div>
                    <div className="text-caption text-studio-muted">
                      {MODE_LABELS[entry.mode]}
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
      </main>
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
