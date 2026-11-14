"use client";

// SIG-1344: "Where they leave your repertoire" — the dossier's summary of how
// much of the player's opening list the user's opposite-colour repertoire
// answers, followed by the player's most frequent gap moves. "Prepare line"
// opens the position before the gap move, oriented to the user's side.
import { useMemo } from "react";
import { formatInteger } from "@/src/i18n/format";
import { tLibrary } from "@/src/i18n/library-strings";
import { repertoireLabel } from "@/src/lib/my-games/deviation-for-game";
import type { AggregatedDeviation } from "@/src/lib/my-games/stats";
import type { PlayerGame } from "@/src/lib/player-types";
import { dossierOpenings } from "@/src/lib/prep/dossier-openings";
import { sanMovesForGame } from "@/src/lib/prep/game-sans";
import { lineCoverage, opponentGaps, oppositeSide } from "@/src/lib/prep/repertoire-coverage";
import { useStudioStore } from "@/src/store/studio-store";
import { prepareLine } from "./prepare-line";

export type DossierRepertoireGapsProps = {
  games: PlayerGame[];
  opponentColor: "white" | "black";
  /**
   * SIG-1344 review: the cards' "min games" filter. The summary must count the
   * same openings the cards above show, so the filter is applied here too.
   */
  minGames?: number;
};

/** The gap list keeps at most this many moves, most frequent first. */
const MAX_GAPS = 10;

type GapRow = {
  key: string;
  /** "7…Nf6" style reference of the player's move. */
  label: string;
  /** How many of the player's games played that move. */
  count: number;
  /** SAN path to the position before the move. */
  path: string[];
};

/** Game id grain used by `opponentGaps` (`rowId` wins over the external `id`). */
function gameKey(game: PlayerGame): string {
  return game.rowId ?? game.id;
}

/**
 * SAN moves leading to the position before a gap's move. The aggregate keeps
 * the position and ply but not the source line, so the prefix comes from a
 * game of the group whose move at that ply is the gap example (all games of a
 * group share the position). An empty prefix means a gap on move one: the
 * start position.
 */
function gapPrefix(group: AggregatedDeviation, games: readonly PlayerGame[]): string[] {
  const ply = group.recentEvent.ply;
  const played = group.recentEvent.playedSan;
  const ids = new Set(group.gameIds);
  const members = games.filter((game) => ids.has(gameKey(game)));
  for (const game of members) {
    const sans = sanMovesForGame(game);
    if (sans[ply - 1] === played) {
      return sans.slice(0, ply - 1);
    }
  }
  const fallback = members[0];
  return fallback ? sanMovesForGame(fallback).slice(0, ply - 1) : [];
}

export function DossierRepertoireGaps({ games, opponentColor, minGames = 1 }: DossierRepertoireGapsProps) {
  const locale = useStudioStore((state) => state.settings.locale);
  const whiteTree = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "white")?.tree ?? null);
  const blackTree = useStudioStore((state) => state.boards.find((b) => b.repertoireColor === "black")?.tree ?? null);
  // The section follows the selected side, exactly like the opening cards.
  const repertoireColor = oppositeSide(opponentColor);
  const repertoireTree = repertoireColor === "white" ? whiteTree : blackTree;

  const sideGames = useMemo(
    () => games.filter((game) => game.color === opponentColor),
    [games, opponentColor],
  );
  const rows = useMemo(
    () => dossierOpenings(sideGames, opponentColor, { minGames }),
    [sideGames, opponentColor, minGames],
  );
  const coverage = useMemo(
    () => rows.map((row) => lineCoverage({ path: row.line, opponentColor, repertoireTree })),
    [rows, opponentColor, repertoireTree],
  );
  const gaps = useMemo(() => {
    const rowsByMove: GapRow[] = [];
    for (const group of opponentGaps(sideGames, { white: whiteTree, black: blackTree })) {
      const path = gapPrefix(group, sideGames);
      // A position group may hold several moves: each is its own gap row with
      // the player's games that actually played it.
      for (const move of group.playedMoves) {
        rowsByMove.push({
          key: `${group.key}|${move.san}`,
          label: repertoireLabel(group.recentEvent.fen, move.san),
          count: move.count,
          path,
        });
      }
    }
    // Stable sort: equal counts keep `opponentGaps`' order (recency, key).
    rowsByMove.sort((a, b) => b.count - a.count);
    return rowsByMove.slice(0, MAX_GAPS);
  }, [sideGames, whiteTree, blackTree]);

  // No openings for this side: the openings area already explains the empty
  // state, so the coverage section has nothing to cross.
  if (rows.length === 0) {
    return null;
  }

  const colorName = tLibrary(locale, repertoireColor === "white" ? "library.chip.white" : "library.chip.black");

  return (
    <section
      aria-labelledby="dossier-repertoire-gaps"
      data-testid="dossier-repertoire-gaps"
      className="flex min-w-0 flex-col gap-1"
    >
      <h4 id="dossier-repertoire-gaps" className="text-caption font-semibold text-studio-muted">
        {tLibrary(locale, "library.dossier.gaps.title")}
      </h4>
      {repertoireTree === null ? (
        <p data-testid="dossier-repertoire-gaps-no-repertoire" className="text-dense text-studio-faint">
          {tLibrary(locale, "library.dossier.gaps.noRepertoire", { color: colorName })}
        </p>
      ) : (
        <>
          <p data-testid="dossier-repertoire-gaps-summary" className="text-caption tabular-nums text-studio-faint">
            {tLibrary(
              locale,
              rows.length === 1 ? "library.dossier.gaps.summary.one" : "library.dossier.gaps.summary.other",
              {
                covered: formatInteger(locale, coverage.filter((result) => result.status === "covered").length),
                total: formatInteger(locale, rows.length),
              },
            )}
          </p>
          {gaps.length === 0 ? (
            <p data-testid="dossier-repertoire-gaps-empty" className="text-dense text-studio-faint">
              {tLibrary(locale, "library.dossier.gaps.empty")}
            </p>
          ) : (
            <ul className="flex min-w-0 flex-col" data-testid="dossier-repertoire-gaps-list">
              {gaps.map((gapRow) => (
                <li
                  key={gapRow.key}
                  data-testid="dossier-repertoire-gap"
                  data-count={gapRow.count}
                  className="flex min-w-0 items-baseline justify-between gap-2 border-t border-studio-border-subtle py-1"
                >
                  <span className="min-w-0 flex-1 truncate text-dense text-studio-fg" title={gapRow.label}>
                    {gapRow.label}
                  </span>
                  <span className="shrink-0 text-caption tabular-nums text-studio-faint">
                    {tLibrary(
                      locale,
                      gapRow.count === 1 ? "library.dossier.gaps.count.one" : "library.dossier.gaps.count.other",
                      { count: formatInteger(locale, gapRow.count) },
                    )}
                  </span>
                  <button
                    type="button"
                    data-testid="dossier-repertoire-gap-prepare"
                    onClick={() => prepareLine(gapRow.path, opponentColor)}
                    className="shrink-0 text-caption font-medium text-studio-accent-text hover:underline"
                  >
                    {tLibrary(locale, "library.dossier.prepareLine")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
