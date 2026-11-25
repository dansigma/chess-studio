import type { ReactNode } from "react";
import { tLive } from "@/src/i18n/live-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { findStandingRow, formatScore } from "@/src/lib/live/standings";
import type { LivePlayer } from "@/src/lib/live/types";
import { HoverCard } from "../ui/HoverCard";
import type { PlayerOutcome } from "../ui/PlayerCell";
import { shortPlayerName } from "./live-games-filter";
import { useTourStandings } from "./use-tour-standings";

/** GM stands out (solid accent); the other high titles get the soft accent; the rest a neutral pill. */
export function titleTone(title: string): "strong" | "accent" | "neutral" {
  const t = title.toUpperCase();
  if (t === "GM") {
    return "strong";
  }
  if (t === "IM" || t === "WGM") {
    return "accent";
  }
  return "neutral";
}

const TITLE_CLASSES: Record<ReturnType<typeof titleTone>, string> = {
  strong: "bg-studio-accent text-studio-accent-fg",
  accent: "bg-studio-accent-soft text-studio-accent-text",
  neutral: "bg-studio-hover-strong text-studio-fg-secondary",
};

export function TitleBadge({ title }: { title: string }) {
  return (
    <span
      className={`inline-flex h-4 shrink-0 items-center rounded px-1 text-[10px] font-bold leading-none tracking-wide ${TITLE_CLASSES[titleTone(title)]}`}
      data-live-title={title}
    >
      {title}
    </span>
  );
}

function FedChip({ fed }: { fed: string }) {
  return (
    <span className="shrink-0 rounded border border-studio-border px-1 text-[10px] font-medium uppercase leading-[14px] tracking-wide text-studio-muted">
      {fed}
    </span>
  );
}

type Player = Pick<LivePlayer, "name" | "title" | "rating" | "fed" | "fideId">;

const englishOrdinals = new Intl.PluralRules("en", { type: "ordinal" });
const ordinalSuffixes = { one: "st", two: "nd", few: "rd", other: "th", zero: "th", many: "th" };

function PlayerStanding({ player, tourId, locale }: {
  player: Player;
  tourId: string | null;
  locale: SiteLocale;
}) {
  const { rows, status } = useTourStandings(tourId);
  // Keep showing the previous standings while a refresh is in flight.
  const candidate = rows.length ? findStandingRow(rows, player) : undefined;
  // A fallback by name must be unique and cannot override a conflicting FIDE ID.
  const row = candidate && (
    (player.fideId != null && candidate.fideId === player.fideId) ||
    ((player.fideId == null || candidate.fideId == null) &&
      !rows.some((other) => other !== candidate && other.name === candidate.name))
  ) ? candidate : undefined;
  const title = row ? row.title ?? player.title : null;
  const rating = row?.rating ?? player.rating;
  const fed = row?.fed ?? player.fed;
  return (
    <>
      <div className="flex items-start gap-1.5">
        {title ? <TitleBadge title={title} /> : null}
        <span className="min-w-0 break-words font-semibold">{player.name}</span>
      </div>
      {rating != null || fed ? (
        <div className="mt-1 flex items-center gap-2 text-caption text-studio-muted tabular-nums">
          {rating != null ? <span>{rating}</span> : null}
          {fed ? <FedChip fed={fed} /> : null}
        </div>
      ) : null}
      {row ? (
        <div className="mt-2 border-t border-studio-border pt-2">
          <div>{tLive(locale, "live.player.place", {
            rank: locale === "en" ? `${row.rank}${ordinalSuffixes[englishOrdinals.select(row.rank)]}` : row.rank,
          })}</div>
          <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-caption tabular-nums">
            <dt className="text-studio-muted">{tLive(locale, "live.player.score")}</dt>
            <dd className="text-right font-semibold">{formatScore(row.score, locale)} / {row.played}</dd>
            {row.performance !== null ? (
              <>
                <dt className="text-studio-muted">{tLive(locale, "live.standings.performance")}</dt>
                <dd className="text-right">{row.performance}</dd>
              </>
            ) : null}
            {row.ratingDiff !== null ? (
              <>
                <dt className="text-studio-muted">{tLive(locale, "live.standings.diff")}</dt>
                <dd className="text-right">{row.ratingDiff > 0 ? "+" : ""}{row.ratingDiff}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : (
        <p className="mt-2 text-caption text-studio-muted">
          {tLive(locale, status === "loading" && !rows.length ? "live.standings.loading" : "live.player.scoreUnavailable")}
        </p>
      )}
    </>
  );
}

/**
 * A player in Live. `stacked` (games table): title + name on the first line, rating, federation and
 * `extra` (the clock on narrow screens) on the second, so the name gets the full cell width.
 * `inline` (board cards): everything on one line, the name truncating first.
 * The winner is bold and the loser muted, as in `PlayerCell`; `emphasis` bolds a followed row.
 */
export function LivePlayerCell({
  player,
  tourId,
  locale,
  hideFederation = false,
  outcome,
  emphasis = false,
  layout = "stacked",
  align = "start",
  extra,
  shortName = false,
}: {
  player: Player;
  tourId: string | null;
  locale: SiteLocale;
  hideFederation?: boolean;
  outcome: PlayerOutcome;
  emphasis?: boolean;
  layout?: "stacked" | "inline";
  align?: "start" | "end";
  extra?: ReactNode;
  /** Games table: "Surname, Firstname" as "F. Surname"; the full name stays in the tooltip. */
  shortName?: boolean;
}) {
  const tone =
    outcome === "won" ? "font-semibold text-studio-fg" : outcome === "lost" ? "text-studio-muted" : "text-studio-fg";
  const weight = emphasis || outcome === "won" ? "font-semibold" : "font-medium";
  const justify = align === "end" ? "justify-end" : "";
  const name = (
    <HoverCard
      className={`min-w-0 truncate rounded-sm focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-studio-accent ${tone} ${weight}`}
      content={<PlayerStanding player={player} tourId={tourId} locale={locale} />}
    >
      {shortName ? shortPlayerName(player.name) : player.name}
    </HoverCard>
  );
  const rating =
    player.rating != null ? (
      <span className="shrink-0 tabular-nums text-studio-fg-secondary">{player.rating}</span>
    ) : null;

  if (layout === "inline") {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-dense">
        {player.title ? <TitleBadge title={player.title} /> : null}
        {name}
        {rating ? <span className="shrink-0 text-caption">{rating}</span> : null}
        {!hideFederation && player.fed ? <FedChip fed={player.fed} /> : null}
      </span>
    );
  }
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${align === "end" ? "items-end text-right" : ""}`}>
      <span className={`flex w-full min-w-0 items-center gap-1.5 text-dense ${justify}`}>
        {player.title ? <TitleBadge title={player.title} /> : null}
        {name}
      </span>
      {rating || (!hideFederation && player.fed) || extra ? (
        <span className={`flex w-full min-w-0 items-center gap-1.5 text-caption leading-none ${justify}`}>
          {rating}
          {!hideFederation && player.fed ? <FedChip fed={player.fed} /> : null}
          {extra}
        </span>
      ) : null}
    </span>
  );
}
