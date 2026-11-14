// SIG-1334: how much of an opponent's line the user's own repertoire answers.
// Pure data layer over the SIG-1040 deviation engine (`findDeviation`); no UI.
// The repertoire used is always the user's tree of the color OPPOSITE to the
// opponent's side (opponent as White -> the user's Black repertoire).
import { numberSanLine } from "@/src/chess/pgn-clean.ts";
import { importSans } from "@/src/chess/pgn.ts";
import {
  deviationLabel,
  findDeviation,
  type DeviationEvent,
  type RepertoireOption,
} from "@/src/chess/repertoire-deviation.ts";
import { flattenMainLine, type GameTree } from "@/src/chess/tree.ts";
import { deviationForGame } from "@/src/lib/my-games/deviation-for-game.ts";
import { aggregateDeviations, type AggregatedDeviation, type DeviationGroupEvent } from "@/src/lib/my-games/stats.ts";
import type { PlayerGame } from "@/src/lib/player-types.ts";

export type PrepSide = "white" | "black";

export function oppositeSide(color: PrepSide): PrepSide {
  return color === "white" ? "black" : "white";
}

/** A point on the line where the repertoire and the line part ways. */
export type CoveragePoint = {
  /** 1-based ply over the line's SAN path. */
  ply: number;
  /** SAN of the line's move at `ply`. */
  san: string;
  /** Move reference in the "7…Nf6" / "7. Nf6" style. */
  label: string;
  /** Position before the move — the board the repertoire answers. */
  fen: string;
  /** The repertoire's alternatives at `fen` (empty when it has none). */
  repertoireMoves: RepertoireOption[];
};

export type LineCoverage =
  /** Every opponent move to the end of the line is answered. */
  | { status: "covered" }
  /**
   * The repertoire answers up to `ply`, then stops: `line_ended` (the
   * repertoire has no moves from there) or `user_deviation` (the line's own
   * user-side move is not the repertoire move).
   */
  | ({ status: "partial"; reason: "line_ended" | "user_deviation" } & CoveragePoint)
  /** The opponent plays a move the repertoire has no answer to. */
  | ({ status: "gap" } & CoveragePoint)
  /** The user has no repertoire marked for the needed color. */
  | { status: "no_repertoire" };

function pointFromEvent(event: Exclude<DeviationEvent, { kind: "none" }>): CoveragePoint {
  return {
    ply: event.ply,
    san: event.playedSan,
    label: deviationLabel(event),
    fen: event.fen,
    repertoireMoves: event.repertoireMoves,
  };
}

/**
 * Coverage of one opponent line. `path` is the SAN sequence from the start
 * position; `opponentColor` is the side the opponent plays in it;
 * `repertoireTree` is the user's repertoire of the OPPOSITE color (null when
 * the user has none -> `no_repertoire`). An empty or fully illegal path has
 * nothing to disagree with and reads as covered; an illegal move truncates the
 * line there (same as `importSans`).
 */
export function lineCoverage(args: {
  path: string[];
  opponentColor: PrepSide;
  repertoireTree: GameTree | null;
}): LineCoverage {
  const { path, opponentColor, repertoireTree } = args;
  if (!repertoireTree) {
    return { status: "no_repertoire" };
  }
  const game = importSans(path).tree;
  const event = findDeviation({
    repertoire: repertoireTree,
    game,
    userColor: oppositeSide(opponentColor),
  });
  switch (event.kind) {
    case "none":
      return { status: "covered" };
    case "opponent_gap":
      return { status: "gap", ...pointFromEvent(event) };
    case "line_ended":
      return { status: "partial", reason: "line_ended", ...pointFromEvent(event) };
    case "user_deviation":
      return { status: "partial", reason: "user_deviation", ...pointFromEvent(event) };
    case "never_entered": {
      // The repertoire does not even contain the start position, so nothing is
      // answered: report a gap at the opponent's first move. White moves on
      // odd plies, Black on even ones.
      const firstOpponentPly = opponentColor === "white" ? 1 : 2;
      const line = flattenMainLine(game);
      const move = line[firstOpponentPly - 1];
      if (!move) {
        // Opponent as Black with only White's move in the line: no opponent
        // move to point at, so the repertoire simply stops at the start.
        return { status: "partial", reason: "line_ended", ...pointFromEvent(event) };
      }
      const fen = firstOpponentPly === 1 ? game.startFen : (line[firstOpponentPly - 2]?.fen ?? game.startFen);
      const point = pointFromEvent({
        kind: "opponent_gap",
        ply: firstOpponentPly,
        fen,
        playedUci: move.uci,
        playedSan: move.san,
        repertoireMoves: [],
      });
      return { status: "gap", ...point };
    }
  }
}

/**
 * The opponent's most frequent gaps against the user's repertoires. `games`
 * are the OPPONENT's games (`game.color` is the opponent's side), so each is
 * checked against the user's repertoire of the inverted color. Only
 * `opponent_gap` events are kept; groups come most frequent first (count desc,
 * then most recent, then position key) with each group's `recentEvent` /
 * `gameIds` as the example. The group `color` is the opponent's side — the one
 * that played the gap move.
 *
 * `deviationsForRecentGames` cannot be reused: it passes `game.color` as the
 * repertoire owner's side.
 */
export function opponentGaps(
  games: readonly PlayerGame[],
  trees: { white: GameTree | null; black: GameTree | null },
): AggregatedDeviation[] {
  const events: DeviationGroupEvent[] = [];
  for (const game of games) {
    const userColor = oppositeSide(game.color);
    const event = deviationForGame({
      pgn: game.pgn ?? pgnFromMoves(game.moves),
      color: userColor,
      repertoireTree: trees[userColor],
    });
    if (!event || event.kind !== "opponent_gap") {
      continue;
    }
    events.push({ event, gameId: game.rowId ?? game.id, playedAt: game.playedAt, color: game.color });
  }
  return aggregateDeviations(events);
}

/** `deviationForGame` reads PGN only; a moves-only game ("e4 e5 Nf3") is
 * numbered into movetext-only PGN so the opponent's games from the explorer
 * sources count too. */
function pgnFromMoves(moves: string | undefined): string | undefined {
  const text = moves?.trim();
  return text ? `${numberSanLine(text)} *` : undefined;
}
