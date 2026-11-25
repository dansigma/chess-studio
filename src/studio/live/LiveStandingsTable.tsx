import type { SiteLocale } from "@/src/i18n/locale";
import { tLive } from "@/src/i18n/live-strings";
import type { BroadcastRoundSummary, BroadcastStandingRow } from "@/src/lib/live/types";
import { TitleBadge } from "./LivePlayerCell";

function formatScore(score: number, locale: SiteLocale): string {
  if (score % 1 === 0.5) {
    return `${Math.floor(score) || ""}½`;
  }
  return score.toLocaleString(locale);
}

export function LiveStandingsTable({
  rows, status, rounds, standingsUrl, locale,
}: {
  rows: readonly BroadcastStandingRow[];
  status: "idle" | "loading" | "ready" | "error";
  rounds: readonly BroadcastRoundSummary[] | undefined;
  standingsUrl?: string;
  locale: SiteLocale;
}) {
  const finished = rounds?.filter((round) => round.finished).length ?? 0;
  const beforeFirstRound = rounds && !rounds.some((round) => round.ongoing || round.finished) &&
    !rows.some((row) => row.played > 0);
  const hasPerformance = rows.some((row) => row.performance !== null);
  const hasDiff = rows.some((row) => row.ratingDiff !== null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-studio-border-subtle px-3 py-2 text-caption">
        {rounds ? <span className="font-medium text-studio-fg">
          {tLive(locale, "live.standings.progress", { finished, total: rounds.length })}
        </span> : null}
        {standingsUrl ? (
          <a href={standingsUrl} target="_blank" rel="noopener noreferrer" className="text-studio-accent-text underline">
            {tLive(locale, "live.standings.link")}
          </a>
        ) : null}
      </header>
      {beforeFirstRound || !rows.length ? (
        <p role="status" className="p-4 text-sm text-studio-muted">
          {tLive(locale, beforeFirstRound || status === "ready" ? "live.standings.empty"
            : status === "error" ? "live.standings.error" : "live.standings.loading")}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto" tabIndex={0} role="region" aria-label={tLive(locale, "live.standings.label")}>
          <table aria-label={tLive(locale, "live.standings.label")} className="w-full text-left text-dense text-studio-fg tabular-nums [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5">
            <thead className="sticky top-0 bg-studio-panel text-caption text-studio-muted">
              <tr>
                <th scope="col">{tLive(locale, "live.standings.rank")}</th>
                <th scope="col">{tLive(locale, "live.standings.player")}</th>
                <th scope="col" className="text-right">{tLive(locale, "live.standings.points")}</th>
                <th scope="col" className="text-right">{tLive(locale, "live.standings.played")}</th>
                {hasPerformance ? <th scope="col" className="text-right">{tLive(locale, "live.standings.performance")}</th> : null}
                {hasDiff ? <th scope="col" className="text-right">{tLive(locale, "live.standings.diff")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.fideId ?? row.name}:${index}`} className="border-b border-studio-border-subtle">
                  <td className="text-studio-muted">{row.rank}</td>
                  <td className="min-w-24">
                    <div className="flex flex-wrap items-center gap-1">
                      {row.title ? <TitleBadge title={row.title} /> : null}
                      <span>{row.name}</span>
                    </div>
                    <div className="flex gap-2 text-caption text-studio-muted">
                      {row.rating !== null ? <span>{row.rating}</span> : null}
                      {row.fed ? <span>{row.fed}</span> : null}
                    </div>
                  </td>
                  <td className="text-right font-semibold">{formatScore(row.score, locale)}</td>
                  <td className="text-right">{row.played}</td>
                  {hasPerformance ? <td className="text-right">{row.performance ?? "–"}</td> : null}
                  {hasDiff ? <td className="text-right">{row.ratingDiff !== null ? `${row.ratingDiff > 0 ? "+" : ""}${row.ratingDiff}` : "–"}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
