"use client";

// SIG-1345: the user's own numbers on a dossier opening card, in the same
// sequence of moves and with the opposite colour (the player is White, so the
// user's games are Black). "Train" sits here so both line-2 actions stay
// together. The summary drops its word labels on a narrow dossier (container
// query) but keeps every value; the full sentence remains the tooltip.
import { formatInteger, pluralCategory } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tLibrary, type LibraryStringKey } from "@/src/i18n/library-strings";
import { tMyGames } from "@/src/i18n/my-games-strings";
import type { DossierOpeningRow } from "@/src/lib/prep/dossier-openings";
import { ownLineStats, type OwnLineStats } from "@/src/lib/prep/own-line-stats";
import { useStudioStore } from "@/src/store/studio-store";
import { trainLine } from "./prepare-line";
import { useMyGamesForDossier } from "./use-my-games-for-dossier";

export type DossierOpeningMineProps = {
  row: DossierOpeningRow;
  opponentColor: "white" | "black";
};

/**
 * Labels only exist when the dossier itself is wide enough. The 900px
 * threshold keeps the two-column dossier (cards around half the width) on the
 * compact form, where the full sentence would truncate the values.
 */
const LABEL_CLASS = "hidden @min-[900px]:inline";

function pluralKey(base: string, locale: SiteLocale, count: number): LibraryStringKey {
  return `${base}.${pluralCategory(locale, count) === "one" ? "one" : "other"}` as LibraryStringKey;
}

function OwnLineSummary({
  stats,
  myColor,
  locale,
}: {
  stats: OwnLineStats;
  myColor: "white" | "black";
  locale: SiteLocale;
}) {
  const colorLabel = tMyGames(locale, myColor === "white" ? "myGames.statsWhite" : "myGames.statsBlack");
  const tooltip = tLibrary(locale, "library.dossier.ownLine.tooltip", { color: colorLabel });
  const gamesLabel = tLibrary(locale, pluralKey("library.dossier.ownLine.games", locale, stats.games));
  const accuracyLabel = tLibrary(locale, "library.dossier.ownLine.accuracy");
  const mistakesLabel = tLibrary(
    locale,
    pluralKey("library.dossier.ownLine.mistakes", locale, stats.openingMistakes ?? 0),
  );
  return (
    <span
      data-testid="dossier-own-line"
      title={tooltip}
      className="min-w-0 truncate text-caption tabular-nums text-studio-muted"
    >
      <span data-testid="dossier-own-line-label" className={LABEL_CLASS}>
        {tLibrary(locale, "library.dossier.ownLine.prefix")}
      </span>
      {formatInteger(locale, stats.games)}
      <span data-testid="dossier-own-line-label" className={LABEL_CLASS}>
        {" "}
        {gamesLabel}
      </span>
      {" · "}
      {formatInteger(locale, stats.scorePct)}%
      {stats.avgAccuracy === null ? null : (
        <>
          {" · "}
          <span data-testid="dossier-own-line-label" className={LABEL_CLASS}>
            {accuracyLabel}{" "}
          </span>
          {formatInteger(locale, Math.round(stats.avgAccuracy))}
        </>
      )}
      {stats.openingMistakes === null ? null : (
        <>
          {" · "}
          {formatInteger(locale, stats.openingMistakes)}
          <span data-testid="dossier-own-line-label" className={LABEL_CLASS}>
            {" "}
            {mistakesLabel}
          </span>
        </>
      )}
    </span>
  );
}

export function DossierOpeningMine(props: DossierOpeningMineProps) {
  const { row, opponentColor } = props;
  const locale = useStudioStore((state) => state.settings.locale);
  const myGames = useMyGamesForDossier();
  // The player's colour is the opponent's; the user played the other side.
  const myColor: "white" | "black" = opponentColor === "white" ? "black" : "white";
  const stats = myGames.status === "ready" ? ownLineStats(myGames.games, row.line, myColor) : null;
  const colorLabel = tMyGames(locale, myColor === "white" ? "myGames.statsWhite" : "myGames.statsBlack");
  const tooltip = tLibrary(locale, "library.dossier.ownLine.tooltip", { color: colorLabel });

  return (
    <div className="flex min-w-0 items-center gap-1">
      {myGames.status !== "ready" ? null : stats ? (
        <OwnLineSummary stats={stats} myColor={myColor} locale={locale} />
      ) : (
        <span
          data-testid="dossier-own-line-none"
          title={tooltip}
          className="min-w-0 truncate text-caption text-studio-faint"
        >
          {tLibrary(locale, "library.dossier.ownLine.none")}
        </span>
      )}
      <button
        type="button"
        data-testid="dossier-opening-train"
        disabled={row.line.length === 0}
        onClick={(event) => {
          event.stopPropagation();
          trainLine(row.line, opponentColor);
        }}
        className="shrink-0 rounded px-1.5 py-0.5 text-caption font-medium text-studio-accent-text hover:bg-studio-hover disabled:cursor-default disabled:text-studio-disabled"
      >
        {tLibrary(locale, "library.dossier.trainLine")}
      </button>
    </div>
  );
}
