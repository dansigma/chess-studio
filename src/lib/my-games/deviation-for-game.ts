// SIG-1093: per-game deviation lookup + sentence builders for the My Games
// badges and the Review-panel line. Pure reads over the SIG-1040 deviation
// events; interpolated sentences are whole-sentence templates from
// `repertoire-strings.ts` so EN/PT-BR grammar stays in the string tables.
import { deviationLabel, findDeviation, type DeviationEvent } from "@/src/chess/repertoire-deviation.ts";
import { importPgn } from "@/src/chess/pgn.ts";
import { tRepertoire } from "@/src/i18n/repertoire-strings.ts";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import type { GameTree } from "@/src/chess/tree.ts";
import type { BoardOrientation } from "@/src/store/slices/types.ts";

/** Null when there is nothing to show: no repertoire marked for the side,
// no PGN, or an empty/unparseable PGN. `importPgn` fails closed to an empty
// tree, so the children guard treats that as "no badge" too. */
export function deviationForGame(args: {
  pgn: string | null | undefined;
  color: BoardOrientation;
  repertoireTree: GameTree | null;
}): DeviationEvent | null {
  const { pgn, color, repertoireTree } = args;
  if (!repertoireTree || !pgn?.trim()) {
    return null;
  }
  const game = importPgn(pgn).tree;
  if (game.children.length === 0) {
    return null;
  }
  return findDeviation({ repertoire: repertoireTree, game, userColor: color });
}

/** Move reference for a repertoire SAN at the deviation position — the same
 * "7…Nf6" grain as `deviationLabel` (which only formats the played move). */
function repertoireLabel(fen: string, san: string): string {
  const parts = fen.split(" ");
  const side = parts[1] === "b" ? "b" : "w";
  const fullmove = Number(parts[5]) || 1;
  return side === "w" ? `${fullmove}. ${san}` : `${fullmove}…${san}`;
}

/** Badge text for a sidebar row; null = no badge (`none` and
 * `never_entered` render nothing). */
export function deviationBadgeText(locale: SiteLocale, event: DeviationEvent | null): string | null {
  if (!event || event.kind === "none" || event.kind === "never_entered") {
    return null;
  }
  if (event.kind === "line_ended") {
    return tRepertoire(locale, "repertoire.deviation.lineEnded");
  }
  const move = deviationLabel(event);
  return tRepertoire(
    locale,
    event.kind === "user_deviation" ? "repertoire.deviation.leftBadge" : "repertoire.deviation.gapBadge",
    { move },
  );
}

/** Review-panel line for the active board; null = render nothing (only
 * `user_deviation` and `opponent_gap` produce a line). */
export function deviationReviewText(locale: SiteLocale, event: DeviationEvent | null): string | null {
  if (!event || event.kind === "none" || event.kind === "never_entered" || event.kind === "line_ended") {
    return null;
  }
  const played = deviationLabel(event);
  if (event.kind === "opponent_gap") {
    return tRepertoire(locale, "repertoire.deviation.reviewGap", { played });
  }
  const first = event.repertoireMoves[0];
  if (!first) {
    // Defensive: user_deviation always carries moves, but never render a
    // dangling template.
    return null;
  }
  const repertoire = repertoireLabel(event.fen, first.san);
  return tRepertoire(locale, "repertoire.deviation.reviewUser", { played, repertoire });
}
