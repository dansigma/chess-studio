// SIG-1226: the DEPLOYED local opening book. Written by
// scripts/opening-book/build-book.mjs / union-books.mjs --app-manifest; `version` is part of the
// review cache key, `file` is the versioned object under /book/ (R2 key book/<file>). The app
// reads only those two; `sources` documents what the file was merged from.
export const OPENING_BOOK_MANIFEST = {
  "version": 3,
  "format": 1,
  "file": "opening-book-v3.bin.gz",
  "profile": "union",
  "builtAt": "2026-11-06T22:03:11.092Z",
  "months": [
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10"
  ],
  "games": 8040148,
  "gamesRead": 550790821,
  "duplicates": 64137,
  "maxPly": 40,
  "positions": 91377,
  "moves": 217225,
  "bytes": 1169113,
  "gzipBytes": 992735,
  "sha256": "7433491dca1da1d443cc204c54246f720b52e0b0b83422d9c5b2860c0a528e41",
  "licenses": [
    "Lichess open database (CC0 1.0)",
    "AJ-OTB (public domain, games only); Lumbra Lichess Broadcast (CC BY-SA 4.0)",
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
      "uniqueMoves": 98207
    },
    {
      "version": 3,
      "format": 1,
      "file": "opening-book-v3.bin.gz",
      "profile": "masters",
      "builtAt": "2026-11-06T00:51:25.818Z",
      "months": [],
      "files": [
        "AJ-OTB-PGN-000.pgn",
        "AJ-OTB-PGN-001.pgn",
        "LumbrasGigabase_OTB_LichessBroadcastDB.pgn"
      ],
      "games": 3005690,
      "gamesRead": 5546566,
      "duplicates": 60878,
      "inputs": [
        {
          "file": "AJ-OTB-PGN-000.pgn",
          "read": 4540263,
          "kept": 2793216,
          "duplicates": 9910
        },
        {
          "file": "AJ-OTB-PGN-001.pgn",
          "read": 868015,
          "kept": 190401,
          "duplicates": 32514
        },
        {
          "file": "LumbrasGigabase_OTB_LichessBroadcastDB.pgn",
          "read": 138288,
          "kept": 22073,
          "duplicates": 18454
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
      "positions": 52626,
      "moves": 116246,
      "bytes": 663456,
      "gzipBytes": 568851,
      "sha256": "64d7f447c326c065bbc65a3873fb7663ef5714410a5b6ad8ae88079b192952fa",
      "license": "AJ-OTB (public domain, games only); Lumbra Lichess Broadcast (CC BY-SA 4.0)",
      "attribution": "Includes games from Ajedrez Data (ajedrezdata.com) and Lumbra's GigaBase, Lichess Broadcast subset (lumbrasgigabase.com), CC BY-SA 4.0",
      "uniqueMoves": 40982
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
      "uniqueMoves": 2386
    }
  ]
} as const;
