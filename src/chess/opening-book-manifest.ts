// SIG-1226: the DEPLOYED local opening book. Replace this file with the output
// of `scripts/opening-book/build-book.mjs ... --app-manifest src/chess/opening-book-manifest.ts`
// after a real build (see docs/opening-book.md). `version` is part of the review
// cache key and `file` is the versioned object served at /book/<file> (R2 key
// book/<file>). Until the real book is uploaded the app gets a 404 for it and
// falls back to the Lichess explorer book (SIG-1225).
export const OPENING_BOOK_MANIFEST = {
  version: 1,
  format: 1,
  file: "opening-book-v1.bin.gz",
  builtAt: null,
  months: [],
  games: 0,
  minElo: 2300,
  speeds: ["blitz", "rapid", "classical"],
  maxPly: 40,
  thresholds: { minPositionGames: 100, minMoveGames: 20, minMoveShare: 0.03 },
  positions: 0,
  moves: 0,
  bytes: 0,
  gzipBytes: 0,
  sha256: null,
} as const;
