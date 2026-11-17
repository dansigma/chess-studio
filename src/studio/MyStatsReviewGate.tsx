"use client";

// SIG-1385: the <3-reviewed-games gate. One component for every spot that
// used to show the bare "review at least 3 games" sentence: progress toward
// the minimum plus a button that opens the Game Review dock panel (the same
// `openStudioPanel` path the View menu / sidebar use).
import { tMyGames } from "@/src/i18n/my-games-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { MY_STATS_MIN_REVIEWED } from "@/src/lib/my-games/stats";
import { openStudioPanel } from "./dock-api";

export function MyStatsReviewGate({ locale, reviewed }: { locale: SiteLocale; reviewed: number }) {
  const done = Math.min(reviewed, MY_STATS_MIN_REVIEWED);
  const progress = tMyGames(locale, "myGames.statsGateProgress", {
    done: done,
    total: MY_STATS_MIN_REVIEWED,
  });
  return (
    <div role="status" data-testid="mystats-review-gate" className="flex flex-col items-start gap-2">
      <p className="text-dense text-studio-muted">{progress}</p>
      <div
        role="progressbar"
        aria-label={progress}
        aria-valuemin={0}
        aria-valuemax={MY_STATS_MIN_REVIEWED}
        aria-valuenow={done}
        className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-studio-hover"
      >
        <div
          className="h-full rounded-full bg-studio-accent"
          style={{ width: `${(done / MY_STATS_MIN_REVIEWED) * 100}%` }}
        />
      </div>
      <button
        type="button"
        onClick={() => openStudioPanel("review")}
        className="rounded bg-studio-hover px-2 py-0.5 text-caption font-medium text-studio-accent-text hover:bg-studio-hover-strong"
      >
        {tMyGames(locale, "myGames.statsReviewCta")}
      </button>
    </div>
  );
}
