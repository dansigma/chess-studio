// SIG-1225: what counts as opening theory ("Textbook") in Game Review.
//
// Source: the Lichess games explorer (/lichess) restricted to strong players
// and slower time controls. A move is theory when, from the position before it:
//   1. the position has at least `minPositionGames` games, and
//   2. the played move has at least `minMoveGames` games AND at least
//      `minMoveShare` of the position's games.
// The book ends at the first move that fails, for either side; nothing after it
// is book, even if the game transposes back into known positions.

export const BOOK_RULE = {
  /** Explorer filters (kept in one place; also part of the server cache key). */
  ratings: [2200, 2500],
  speeds: ["blitz", "rapid", "classical"],
  /** Bump when the rule or the filters change: part of the review cache key. */
  version: 1,
  minPositionGames: 100,
  minMoveGames: 20,
  /** Fraction of the position's games (0.03 = 3%). */
  minMoveShare: 0.03,
  /** Longest line the book route accepts. */
  maxPlies: 120,
} as const;

/** Query suffix for the explorer request (also names the shared cache entries). */
export function bookFilterQuery(): string {
  return `&ratings=${BOOK_RULE.ratings.join(",")}&speeds=${BOOK_RULE.speeds.join(",")}`;
}

/** `explorer_cache.source` value for book lookups; never collides with masters/lichess entries. */
export function bookCacheSource(): string {
  return `lichess-book-v${BOOK_RULE.version}-${BOOK_RULE.ratings.join("-")}-${BOOK_RULE.speeds.join("-")}`;
}

export type BookPosition = {
  /** Games in the filtered database from this position. */
  total: number;
  moves: Array<{ uci: string; games: number }>;
};

/** True when `playedUci` is theory from `position` under BOOK_RULE. */
export function isTheoryMove(position: BookPosition, playedUci: string): boolean {
  if (position.total < BOOK_RULE.minPositionGames) {
    return false;
  }
  const move = position.moves.find((entry) => entry.uci === playedUci);
  if (!move) {
    return false;
  }
  return move.games >= BOOK_RULE.minMoveGames && move.games >= BOOK_RULE.minMoveShare * position.total;
}

/**
 * SIG-1226: how the local book is built from the Lichess open database (CC0).
 * The theory thresholds are BOOK_RULE's, unchanged; only the game filter differs
 * from the explorer (both players >= minElo instead of a rating band).
 */
export const LOCAL_BOOK_BUILD = {
  /** Both players must be rated at least this. */
  minElo: 2300,
  speeds: ["blitz", "rapid", "classical"],
  /** Games shorter than this many full moves are skipped. */
  minGameMoves: 10,
  /** Plies counted per game: theory is stored for positions at ply 0..maxPly-1. */
  maxPly: 40,
} as const;
