// SIG-1226: the DEPLOYED local opening book. Written by
// scripts/opening-book/build-book.mjs --app-manifest; `version` is part of the review
// cache key, `file` is the versioned object under /book/ (R2 key book/<file>).
export const OPENING_BOOK_MANIFEST = {
  "version": 2,
  "format": 1,
  "file": "opening-book-v2.bin.gz",
  "builtAt": "2026-11-05T09:17:48.123Z",
  "months": [
    "2026-09",
    "2026-10"
  ],
  "games": 1641943,
  "gamesRead": 185012090,
  "minElo": 2300,
  "speeds": [
    "blitz",
    "rapid",
    "classical"
  ],
  "maxPly": 40,
  "thresholds": {
    "minPositionGames": 100,
    "minMoveGames": 20,
    "minMoveShare": 0.03
  },
  "positions": 24949,
  "moves": 56818,
  "bytes": 324714,
  "gzipBytes": 269451,
  "sha256": "1bd9021eee4e8e3dfb7023565a3e67e59186829cc8473b1d31487b054189b189"
} as const;
