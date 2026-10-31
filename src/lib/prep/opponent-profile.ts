// SIG-1100: pure opponent opening profile (Insights 3/4).
// Maps the opponent's last public games onto the SIG-1048 per-color
// opening-tree builder, plus top-3 most-played first moves as White and
// replies to 1.e4/1.d4 as Black. No throws, no I/O, deterministic.
import { buildOpeningTree, type OpeningNode } from "@/src/lib/my-games/opening-tree";
import type { PlayerGame } from "@/src/lib/player-types";
import { sanMovesFromPgn } from "@/src/chess/pgn-clean";

export type MostPlayedMove = { san: string; games: number };

export type OpponentProfile = {
  gamesAnalyzed: number;
  white: OpeningNode;
  black: OpeningNode;
  mostPlayed: { white: MostPlayedMove[]; black: MostPlayedMove[] };
};

const MAX_PLY = 10;
const MOST_PLAYED_LIMIT = 3;

function sansFor(game: PlayerGame): string[] {
  // Loaders always set space-separated `moves` when moves exist (lichess builds
  // it from NDJSON, chesscom from the cleaned PGN); fall back to parsing `pgn`.
  const line = game.moves?.trim();
  if (line) {
    return line.split(/\s+/).filter(Boolean);
  }
  if (game.pgn?.trim()) {
    return sanMovesFromPgn(game.pgn);
  }
  return [];
}

function topMoves(counts: Map<string, number>): MostPlayedMove[] {
  return [...counts.entries()]
    .map(([san, games]) => ({ san, games }))
    .sort((a, b) =>
      b.games !== a.games ? b.games - a.games : a.san < b.san ? -1 : a.san > b.san ? 1 : 0,
    )
    .slice(0, MOST_PLAYED_LIMIT);
}

export function buildOpponentProfile(
  games: readonly PlayerGame[],
  now: number = Date.now(),
): OpponentProfile {
  const inputs = games.map((game) => ({
    sans: sansFor(game),
    color: game.color,
    result: game.playerResult,
    playedAt: game.playedAt,
    // Opponent games carry no accuracy for the tree.
    accuracy: null as number | null,
    timeClass: game.timeClass ?? null,
    rated: game.rated ?? null,
  }));
  const withMoves = inputs.filter((game) => game.sans.length > 0);
  const white = buildOpeningTree(withMoves, { color: "white", maxPly: MAX_PLY, now });
  const black = buildOpeningTree(withMoves, { color: "black", maxPly: MAX_PLY, now });
  const whiteFirst = new Map<string, number>();
  const blackReplies = new Map<string, number>();
  for (const game of withMoves) {
    const first = game.sans[0];
    if (!first) {
      continue;
    }
    if (game.color === "white") {
      whiteFirst.set(first, (whiteFirst.get(first) ?? 0) + 1);
    } else if ((first === "e4" || first === "d4") && game.sans[1]) {
      const reply = game.sans[1] as string;
      blackReplies.set(reply, (blackReplies.get(reply) ?? 0) + 1);
    }
  }
  return {
    gamesAnalyzed: games.length,
    white,
    black,
    mostPlayed: { white: topMoves(whiteFirst), black: topMoves(blackReplies) },
  };
}
