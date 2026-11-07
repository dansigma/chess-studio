// SIG-1226: the DEPLOYED local opening book. Written by
// scripts/opening-book/build-book.mjs / union-books.mjs --app-manifest; `version` is part of the
// review cache key, `file` is the versioned object under /book/ (R2 key book/<file>). The app
// reads only those two; `sources` documents what the file was merged from.
export const OPENING_BOOK_MANIFEST = {
  "version": 4,
  "format": 1,
  "file": "opening-book-v4.bin.gz",
  "profile": "union",
  "builtAt": "2026-11-07T11:23:21.130Z",
  "months": [
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10"
  ],
  "games": 9138680,
  "gamesRead": 558495592,
  "duplicates": 33998,
  "maxPly": 40,
  "positions": 103009,
  "moves": 242625,
  "bytes": 1311247,
  "gzipBytes": 1117408,
  "sha256": "e5c2c579dce6babb63a1360542b7ba13a6102ee79fc6975f43dea0f5f3168924",
  "licenses": [
    "Lichess open database (CC0 1.0)",
    "Lumbra's GigaBase (CC BY-NC 4.0)",
    "Ajedrez Data AJ-CORR (games stated as public domain, no annotations)"
  ],
  "sources": [
    {
      "version": 3,
      "format": 1,
      "file": "opening-book-v3.bin.gz",
      "profile": "lichess",
      "builtAt": "2026-11-06T22:02:56.079Z",
      "months": [
        "2026-05",
        "2026-06",
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10"
      ],
      "files": [],
      "games": 4716289,
      "gamesRead": 543583779,
      "duplicates": 0,
      "inputs": [
        {
          "file": "stdin",
          "read": 543583779,
          "kept": 4716289,
          "duplicates": 0
        }
      ],
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
        "minMoveShare": 0.01
      },
      "positions": 70973,
      "moves": 172000,
      "bytes": 918802,
      "gzipBytes": 771738,
      "sha256": "ee2aadc9a9d95e263bf065476e78fc0159aa684f8acd6bc437f5a42ee0f46573",
      "license": "Lichess open database (CC0 1.0)",
      "attribution": "Lichess open database, database.lichess.org, CC0 1.0",
      "uniqueMoves": 84283
    },
    {
      "version": 4,
      "format": 1,
      "file": "opening-book-v4.bin.gz",
      "profile": "masters",
      "builtAt": "2026-11-07T09:18:03.724Z",
      "months": [],
      "files": [
        "LumbrasGigabase_OTB_Complete.pgn"
      ],
      "games": 4104222,
      "gamesRead": 13251337,
      "duplicates": 30739,
      "inputs": [
        {
          "file": "LumbrasGigabase_OTB_Complete.pgn",
          "read": 13251337,
          "kept": 4104222,
          "duplicates": 30739
        }
      ],
      "minElo": 2100,
      "maxPly": 40,
      "thresholds": {
        "minPositionGames": 100,
        "minMoveGames": 20,
        "minMoveShare": 0.01,
        "minDistinctPlayers": 5
      },
      "positions": 71854,
      "moves": 157918,
      "bytes": 897480,
      "gzipBytes": 774716,
      "sha256": "8bb1572fb8cf076ca18dc71c151127b952e436f47e38a549ff6b03d55c914acf",
      "license": "Lumbra's GigaBase (CC BY-NC 4.0)",
      "attribution": "Includes games from Lumbra's GigaBase (lumbrasgigabase.com), CC BY-NC 4.0",
      "uniqueMoves": 66382
    },
    {
      "version": 3,
      "format": 1,
      "file": "opening-book-v3.bin.gz",
      "profile": "correspondence",
      "builtAt": "2026-11-05T21:40:59.896Z",
      "months": [],
      "files": [
        "AJ-CORR-PGN-000.pgn",
        "AJ-CORR-PGN-001.pgn"
      ],
      "games": 318169,
      "gamesRead": 1660476,
      "duplicates": 3259,
      "inputs": [
        {
          "file": "AJ-CORR-PGN-000.pgn",
          "read": 1591998,
          "kept": 293009,
          "duplicates": 3252
        },
        {
          "file": "AJ-CORR-PGN-001.pgn",
          "read": 68478,
          "kept": 25160,
          "duplicates": 7
        }
      ],
      "minElo": 2300,
      "maxPly": 40,
      "thresholds": {
        "minPositionGames": 100,
        "minMoveGames": 20,
        "minMoveShare": 0.01,
        "minDistinctPlayers": 5
      },
      "positions": 8586,
      "moves": 14603,
      "bytes": 104489,
      "gzipBytes": 91053,
      "sha256": "199b55faf43850c70ea019a7f899ca330414d0939a786c6a97a2cdd305b82858",
      "license": "Ajedrez Data AJ-CORR (games stated as public domain, no annotations)",
      "attribution": "Correspondence games from Ajedrez Data (ajedrezdata.com)",
      "uniqueMoves": 358
    }
  ]
} as const;
