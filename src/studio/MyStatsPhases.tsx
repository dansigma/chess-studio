"use client";

// SIG-1303: "Mistakes by phase" body of the My Stats overview. One stacked
// bar per phase (segments = the four mistake tiers, semantic tier colours),
// all bars on a shared scale so phases compare by length. Every count stays
// as text in a labelled 2x2 cell (tier swatch = legend) with its per-game
// average; narrow dock friendly (no fixed widths beyond the bar).
import { phaseName, tierName } from "@/src/chess/review-strings";
import type { GamePhase } from "@/src/chess/phases";
import { formatDecimal1, formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tMyGames } from "@/src/i18n/my-games-strings";
import type { MistakeTier } from "@/src/lib/my-games/review-queue";
import type { MistakesPerGame } from "@/src/lib/my-games/stats";

const PHASES: readonly GamePhase[] = ["opening", "middlegame", "endgame"];
const TIERS: readonly MistakeTier[] = ["inaccuracy", "mistake", "miss", "blunder"];

// Tier colour tokens (dark + light variants live in app/globals.css).
const TIER_COLOR: Record<MistakeTier, string> = {
  inaccuracy: "var(--studio-tier-inaccuracy)",
  mistake: "var(--studio-tier-mistake)",
  miss: "var(--studio-tier-miss)",
  blunder: "var(--studio-tier-blunder)",
};

export function MyStatsPhases({ locale, stats }: { locale: SiteLocale; stats: MistakesPerGame }) {
  const { totals, perGame, reviewedGames } = stats;
  const phaseSum = (phase: GamePhase) => TIERS.reduce((sum, tier) => sum + totals[phase][tier], 0);
  const max = Math.max(1, ...PHASES.map(phaseSum));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-studio-faint" data-testid="mystats-phases-basis">
        {tMyGames(locale, reviewedGames === 1 ? "myGames.statsPhaseBasis.one" : "myGames.statsPhaseBasis.other", {
          count: reviewedGames,
        })}
      </p>
      {PHASES.map((phase) => (
        <div key={phase}>
          <h3 className="mb-1 flex items-baseline justify-between gap-2 text-caption text-studio-faint">
            <span>{phaseName(locale, phase)}</span>
            <span className="tabular-nums">{formatInteger(locale, phaseSum(phase))}</span>
          </h3>
          <div className="flex h-2 overflow-hidden rounded bg-studio-hover" aria-hidden="true">
            {TIERS.map((tier) => (
              <div
                key={tier}
                data-testid={`phase-bar-${phase}-${tier}`}
                className="h-full"
                style={{ width: `${(100 * totals[phase][tier]) / max}%`, backgroundColor: TIER_COLOR[tier] }}
              />
            ))}
          </div>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
            {TIERS.map((tier) => (
              <div key={tier} className="flex min-w-0 flex-col">
                <dt className="flex items-center gap-1.5 text-dense text-studio-muted">
                  <span
                    aria-hidden="true"
                    data-testid={`phase-swatch-${phase}-${tier}`}
                    className="inline-block size-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: TIER_COLOR[tier] }}
                  />
                  <span className="truncate">{tierName(locale, tier)}</span>
                </dt>
                <dd className="pl-3.5 text-dense tabular-nums text-studio-muted">
                  {formatInteger(locale, totals[phase][tier])}
                  {reviewedGames > 0
                    ? ` · ${tMyGames(locale, "myGames.statsPerGame", { value: formatDecimal1(locale, perGame[phase][tier]) })}`
                    : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
