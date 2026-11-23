# Xadrez Digital database (SIG-1448)

"Base Xadrez Digital" is our own game database and opening tree: over-the-board games where both players
are rated 2100 or more, including OTB tournaments relayed by Lichess. It is built offline from the monthly
PGN release (see `src/lib/legal/credits.ts` for the sources and licenses) into static files that the app
reads from R2 with range requests. The source collection is not named in the UI, file names or identifiers.

- Builder: `scripts/xd-database/build.mjs` (SIG-1449)
- Formats and reader: `src/lib/xd-database/format.ts`, `src/lib/xd-database/reader.ts`
- Checks and queries: `scripts/xd-database/inspect.mjs`
- API: `app/api/xd-database/` (SIG-1450)
- Studio source (SIG-1451): to follow
- [Monthly update runbook](#monthly-update-runbook) (SIG-1452)

## What a build contains

| File | Content | Lookup |
|---|---|---|
| `games.bin` + `games.idx` | Every kept game: headers and SAN moves, 256 games per deflate-raw block | game id → one range read |
| `tree.bin` + `tree.idx` | Every position up to ply 50 (move 25) reached by at least 2 games: total games; per next move white wins, draws, black wins, average rating and last year; the ids of the 50 strongest games | position key → one range read (pages of ~16 KB) |
| `position-games.bin` | Every game at every kept position, in top-game order. Each 12-byte entry stores game id, both ratings, year and result | position byte offset and entry cursor → one bounded range read |
| `players.bin` + `players.idx` | Player directory sorted by search key (lowercase, no accents): name, FIDE id, game count, years | name prefix → one or a few range reads |
| `player-games.bin` | Each player's game ids, newest first, with bit 31 indicating Black | one range read per page of games |
| `manifest.json` | Rules, stats, sizes and SHA-256 of every file | |

The `.idx` files are small (the tree index is about 16 bytes per 16 KB page) and are meant to stay cached in the
Worker. Position keys are the app's position hash (`bookKey`), so a FEN from the board finds its entry
(`treeKeyOfFen` normalizes it through chess.js first).

### Rules

- **Filter:** the masters profile of the opening book (`scripts/opening-book/profiles.mjs`): both ratings present and
  >= 2100 (`--min-elo`), standard chess from the initial position, no online games (Site/Event naming a server,
  `[Source "LichessEliteDatabase"]`), a decided result (`1-0`, `0-1`, `1/2-1/2`). Lichess broadcast games are
  kept: `[Source]` `LichessBroadcast` or `LichessBroadcastAPI`, or a lichess.org/broadcast URL.
- **De-duplication:** same rule as the opening book (normalized players, Date, Round, first 40 moves).
- **Tree:** the first 50 plies of each game (`--max-ply`). A position counts each game once, even if the game
  repeats it. Positions reached by fewer than 2 games (`--min-games`) are left out: the move that leads there is
  still listed in its parent, with its count and result.
- **Top games:** per position, the 50 games (`--top-games`) with the highest average rating, then the newest.
- **Players:** a player is their FIDE id when the game has one, otherwise the normalized name ("surname, f").
  A name-only spelling whose normalized name belongs to exactly one FIDE id is merged into it. The newest spelling
  is the display name.

## API

All paths below are under `/api/xd-database`. The manifest in
`src/lib/xd-database/manifest.ts` sets the immutable R2 release prefix and the
edge cache version. The API reads format v2.

| Path | Response |
|---|---|
| `tree?fen=` | `{ opening, total, moves }`, with UCI, white wins, draws, black wins, average rating and last year per move |
| `games?fen=&cursor=` | `{ games, nextCursor }` in strongest-first order, 20 headers per page |
| `game/:id` | PGN with the stored tags and numbered SAN |
| `players?q=` | `{ players }`, matching a case- and accent-insensitive name prefix |
| `players/:id/games?cursor=` | `{ games, nextCursor }` in newest-first order, 20 headers per page |

For position games, use the optional `player` directory id, `color=white|black`
(with `player`), `minRating` and `maxRating` (rounded game-average Elo),
`minYear` and `maxYear`, and `result=1-0|1/2-1/2|0-1`. Bounds are inclusive.
Follow `nextCursor` until it is null. A filtered page can return fewer than 20
games while still having a continuation cursor. Player ids and cursors apply to
the current release. Positions absent from the tree return empty lists.

## Build

Needs Node 22.18+ (TypeScript imports), `npm ci`, 7-Zip, and for the full release about 8 cores, 32 GB of RAM and
about 10 GB of free disk on top of the PGN. Format v2 uses 24-byte temporary
records (about 5 GB for the 2026-11 release). Expect about 115 million
entries × 12 bytes, or 1.4 GB, for `position-games.bin` in addition to the game,
tree and player files.

```bash
7z x otb.7z          # one .pgn file (12.3 GB for 2026-11)
NODE_OPTIONS=--max-old-space-size=12288 node scripts/xd-database/build.mjs otb.pgn \
  --out-dir out --tmp-dir tmp --version 2 --workers 7 --release 2026-11-11 --min-games-read 13000000 \
  > out/build-v2.json 2> out/build-v2.log
```

Output goes to `out/v<version>/`. Progress is logged to stderr every 30 seconds; the manifest is printed to
stdout and written to `out/v<version>/manifest.json`. A build that reads fewer than `--min-games-read` games
fails without output.

The main thread reads and filters the PGN and writes the game store and player data; `--workers` threads replay
the games with chess.js (the slow part, about 130 µs per ply; a memo skips chess.js for repeated opening moves)
and write position records into `2^--bucket-bits` bucket files by key range. Each bucket is then sorted and folded
into tree pages and postings by a worker. Once the sizes of the posting parts are
known, workers set the absolute posting offsets and compress the tree pages.
The parts are concatenated in key order. The output does not depend on the
number of workers (the tests check it byte for byte).

### Check

```bash
node scripts/xd-database/inspect.mjs out/v2                     # stats, file sizes and checksums, start position
node scripts/xd-database/inspect.mjs out/v2 --check 5000        # replays 5000 stored games against the tree
node scripts/xd-database/inspect.mjs out/v2 --fen "<FEN>"       # one position
node scripts/xd-database/inspect.mjs out/v2 --game 123          # one game
node scripts/xd-database/inspect.mjs out/v2 --player carlsen    # player search
```

`--check` must end with `0 errors`. It verifies the position-game ranges, top ids,
and the membership and metadata of replayed games at the positions they reach.

## Measured builds

| Release | Games read | Kept | Duplicates | Positions | Files | Time | Peak RSS | Machine |
|---|---|---|---|---|---|---|---|---|
| 2026-11-11 (v1) | 13,450,696 | 4,282,119 | 32,337 | 11,327,266 | 1.1 GB | 57 min | 5.3 GiB | 8 vCPU (QEMU), 31 GB |

v1 details: rejected 5,820,944 under 2100, 3,234,119 without a rating, 81,177 online; 0 games with an illegal
move in the first 50 plies. 207,501,315 position records (4.1 GB of temp files), of which 92,162,934 positions had
a single game and were left out. 16,324,498 moves, 87,049 players. Files: `games.bin` 694 MB (2.04 GB raw),
`tree.bin` 367 MB (26,728 pages; `tree.idx` 428 KB), `player-games.bin` 34 MB, `players.bin` 2.2 MB, `games.idx`
134 KB. Phase 1 (read and replay) took 56 min with 7 workers at 100% CPU; phase 2 (tree) about 2 min.
`--check 3000`: 145,036 positions, 0 errors.

Known limit: a spelling without a comma and without a FIDE id ("Carlsen Magnus") normalizes to "magnus, c" and
stays a separate player. Most games carry a FIDE id, so this affects few games.

## Monthly update (runbook)

### Download and build

Download the matching monthly **OTB Complete** and **Lichess Broadcast** archives from the release site
listed in `src/lib/legal/credits.ts`. From the repository root, set the archive and PGN paths to the actual
filenames and use the release's date. Set `previous` to the currently deployed version and `version` to a
new, unused version number. Use Node 22.18+, 7-Zip, and a Linux build machine with 8 vCPU, 32 GB RAM, and
about 10 GB of free disk in addition to the archives and extracted PGNs. Allow about an hour (see Measured builds).

```bash
set -euo pipefail
previous=1
version=2
release=YYYY-MM-DD
otb_archive=/path/to/otb-complete.7z
broadcast_archive=/path/to/lichess-broadcast.7z
otb_pgn=inputs/otb/otb-complete.pgn
broadcast_pgn=inputs/broadcast/lichess-broadcast.pgn

npm ci
mkdir -p out
sha256sum "$otb_archive" "$broadcast_archive" | tee "out/release-v${version}.sha256"
# When the publisher provides SHA-256 digests, verify against them before extracting.
# sha256sum -c /path/to/published.sha256

7z x "$otb_archive" -oinputs/otb
7z x "$broadcast_archive" -oinputs/broadcast
NODE_OPTIONS=--max-old-space-size=12288 node scripts/xd-database/build.mjs "$otb_pgn" "$broadcast_pgn" \
  --out-dir out --tmp-dir "tmp-v${version}" --version "$version" --workers 7 \
  --release "$release" --min-games-read 13000000 \
  > "out/build-v${version}.json" 2> "out/build-v${version}.log"
```

Keep the recorded SHA-256 digests with the build manifest and log. The checksummed archives can be verified
again with `sha256sum -c "out/release-v${version}.sha256"`.

### Validate and publish to R2

Have the deployed build available locally as `out/v<previous>`. Run both checks and proceed only if
`inspect` ends with `0 errors` and the comparison exits successfully.

```bash
node scripts/xd-database/inspect.mjs "out/v${version}" --check 5000
node scripts/xd-database/compare.mjs "out/v${previous}" "out/v${version}" --sample 200
```

Upload the version to the `chess-studio-xd` bucket (binding `XD_DATABASE`, location hint ENAM) under `xd-database/v<version>/` with
`scripts/xd-database/upload.sh`. It uses the R2 S3 API through the AWS CLI (multipart, so files over Wrangler's
300 MiB limit such as `games.bin` work), needs an R2 API token with Object Read & Write on the bucket, sends only
the files listed in `manifest.json` (refusing a manifest of another version), checks each upload's size, and
sends `manifest.json` last: a prefix that has a manifest is complete.

```bash
export XD_R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID=<r2 access key id> AWS_SECRET_ACCESS_KEY=<r2 secret access key>
scripts/xd-database/upload.sh "out/v${version}" "$version"
```

### Deploy and smoke test

After every size matches, bump the active version in `src/lib/xd-database/manifest.ts`. Open a PR with
the release date, archive digests, and validation results. Merge and deploy, then query production.

```bash
api=https://xadrez.digital/api/xd-database
start='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
curl -fsS -G "$api/tree" --data-urlencode "fen=$start"
curl -fsS -G "$api/games" --data-urlencode "fen=$start"
curl -fsS "$api/game/0"
```

Confirm the tree has the expected start-position total, the position games query returns a non-empty page,
and game 0 returns headers and moves.

### Rollback and retention

To roll back, revert the active version in `src/lib/xd-database/manifest.ts`, deploy, and repeat the
smoke test. Old versions stay in R2 for rollback.

After a successful deploy and smoke test, retain the latest three versions. In the R2 dashboard, list the
keys for each older version and check that the prefix is inactive. Delete each object in that prefix,
including its manifest, then verify the prefix is empty.

```bash
stale=1  # Example only. Confirm this version is inactive and older than the three retained versions.
aws s3 rm "s3://chess-studio-xd/xd-database/v${stale}/" --recursive --endpoint-url "$XD_R2_ENDPOINT"
```

A scheduled automatic monthly build can follow as a separate issue.
