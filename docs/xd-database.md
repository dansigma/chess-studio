# Xadrez Digital database (SIG-1448)

"Base Xadrez Digital" is our own game database and opening tree: over-the-board games where both players
are rated 2100 or more, including OTB tournaments relayed by Lichess. It is built offline from the monthly
PGN release (see `src/lib/legal/credits.ts` for the sources and licenses) into static files that the app
reads from R2 with range requests. The source collection is not named in the UI, file names or identifiers.

- Builder: `scripts/xd-database/build.mjs` (SIG-1449)
- Formats and reader: `src/lib/xd-database/format.ts`, `src/lib/xd-database/reader.ts`
- Checks and queries: `scripts/xd-database/inspect.mjs`
- API (SIG-1450), Studio source (SIG-1451), monthly runbook (SIG-1452): to follow

## What a build contains

| File | Content | Lookup |
|---|---|---|
| `games.bin` + `games.idx` | Every kept game: headers and SAN moves, 256 games per deflate-raw block | game id → one range read |
| `tree.bin` + `tree.idx` | Every position up to ply 50 (move 25) reached by at least 2 games: total games; per next move white wins, draws, black wins, average rating and last year; the ids of the 50 strongest games | position key → one range read (pages of ~16 KB) |
| `players.bin` + `players.idx` | Player directory sorted by search key (lowercase, no accents): name, FIDE id, game count, years | name prefix → one or a few range reads |
| `player-games.bin` | Each player's game ids, newest first | one range read per page of games |
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

## Build

Needs Node 22.18+ (TypeScript imports), `npm ci`, 7-Zip, and for the full release about 8 cores, 32 GB of RAM and
about 30 GB of free disk on top of the PGN (temp records are about 20 bytes per position, 4.2 GB for the
2026-11 release, deleted at the end).

```bash
7z x LumbrasGigabase_OTB_Complete.7z          # one .pgn file (12.3 GB for 2026-11)
node scripts/xd-database/build.mjs LumbrasGigabase_OTB_Complete.pgn \
  --out-dir out --tmp-dir tmp --version 1 --workers 7 --release 2026-11-11 --min-games-read 13000000 \
  > out/build-v1.json 2> out/build-v1.log
```

Output goes to `out/v<version>/`. Progress is logged to stderr every 30 seconds; the manifest is printed to
stdout and written to `out/v<version>/manifest.json`. A build that reads fewer than `--min-games-read` games
fails without output.

The main thread reads and filters the PGN and writes the game store and player data; `--workers` threads replay
the games with chess.js (the slow part, about 130 µs per ply; a memo skips chess.js for repeated opening moves)
and write position records into `2^--bucket-bits` bucket files by key range. Each bucket is then sorted and folded
into tree pages by a worker, and the parts are concatenated in key order. The output does not depend on the
number of workers (the tests check it byte for byte).

### Check

```bash
node scripts/xd-database/inspect.mjs out/v1                     # stats, file sizes and checksums, start position
node scripts/xd-database/inspect.mjs out/v1 --check 5000        # replays 5000 stored games against the tree
node scripts/xd-database/inspect.mjs out/v1 --fen "<FEN>"       # one position
node scripts/xd-database/inspect.mjs out/v1 --game 123          # one game
node scripts/xd-database/inspect.mjs out/v1 --player carlsen    # player search
```

`--check` must end with `0 errors`.

## Measured builds

| Release | Games read | Kept | Duplicates | Positions | Files | Time | Peak RSS | Machine |
|---|---|---|---|---|---|---|---|---|
| 2026-11-11 (v1) | _filled by the first full build_ | | | | | | | 8 vCPU, 31 GB |
