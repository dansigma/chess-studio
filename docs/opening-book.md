# Local opening book (SIG-1226)

Game Review marks opening theory ("Book") from a **local book** built offline from the Lichess open
database (CC0, https://database.lichess.org). The file is not in git: it lives in the R2 bucket next to the
full engine builds and is served by `app/book/[...path]/route.ts`. The Lichess explorer book (SIG-1225,
`POST /api/explorer/book`) stays as the fallback.

## How it is used

1. First review in a session: the browser fetches `/book/<file>` once (lazy, never for users who do not
   review), inflates it (`DecompressionStream`), and keeps the decoded book in memory.
2. `resolveBook` (`src/studio/review/resolve-book.ts`) walks the game through the local book. The book ends at
   the first move that is not theory, for either side, and never resumes on a transposition.
3. The explorer route is asked only if the file is not there within 3 s (the download goes on in the
   background and the next review uses it) or the game is still in book at the last ply the file covers
   (40). If the explorer then fails, the local result is kept.
4. If neither works, the review scores every position and shows "Opening book unavailable".

The rule is shared in code with the explorer book (`BOOK_RULE` in `src/chess/opening-theory.ts`, version 2): from
the position before the move, the position has at least 100 games, and the move has at least 20 games and at
least **1%** of the position's games (it was 3% in version 1; at 3% the local book stopped early in sidelines,
e.g. the King's Gambit at 2.f4). The masters and correspondence sources add a fourth condition: at least 5
distinct players made the move (see "Sources and profiles").

The review cache key contains `OPENING_BOOK_MANIFEST.version` (`src/chess/opening-book-manifest.ts`), so
reviews made with another book are recomputed once.

## Binary format

Spec comment in `src/chess/opening-book-format.ts`. Header of 16 bytes (magic `XDOB`, format version, ply
cap, key count, entry count), then one group per position sorted by unsigned 64-bit key: the key as a LEB128
delta from the previous key, a move count (u8), and the moves as u16 codes (from | to << 6 | promotion << 12).
Position keys are the app's position hash (`src/chess/zobrist.ts`, from the FEN placement, side, castling and
en passant fields). The file is shipped gzip-compressed. Lookup is an exact binary search (no Bloom filter).
Around 9 bytes per (position, move) pair.

## Sources and profiles (`build-book.mjs --profile`)

| | `lichess` (default) | `masters` | `correspondence` |
|---|---|---|---|
| Input | Lichess dumps, `.pgn.zst` / stdin | plain `.pgn` (ChessBase exports, Ajedrez Data AJ-OTB) | plain `.pgn` (Ajedrez Data AJ-CORR: ICCF, IECG, LSS, server daily) |
| Elo | both >= 2300 (`--min-elo`) | both present and >= 2100, FIDE (`--min-elo`); missing Elo: skipped | both present and >= 2300, ICCF/server scale (`--min-elo`); missing: skipped |
| Speed | blitz, rapid, classical by TimeControl | no filter, no TimeControl needed | only correspondence: a TimeControl of a day or more, or ICCF/IECG/LSS/server/daily/correspondence in Site or Event; a clock under a day, or no evidence at all, is skipped (`--assume-correspondence` trusts a collection known to be all correspondence) |
| Online games | n/a | skipped when Site or Event names lichess, chess.com, chess24, playchess, FICS, ICC, "online", "internet" (`ONLINE_PATTERN` in `profiles.mjs`), and when `[Source]` is `LichessEliteDatabase` (`EXCLUDED_SOURCES`). Lichess broadcast games (OTB tournaments relayed by Lichess) are kept: `[Source] LichessBroadcast`, or a `lichess.org/broadcast` URL in Site/Event (`BROADCAST_SOURCES`, `BROADCAST_URL_PATTERN`) | not applicable |
| Length / result | at least 10 moves | at least 10 moves, no `*` | at least 10 moves, no `*` |
| De-duplication | no | yes | yes |
| Distinct players | no | 5 (`--min-players`) | 5 |

All profiles: standard chess from the initial position only (a `FEN`/`SetUp` header or a variant is skipped),
the first 40 plies counted, `BOOK_RULE` thresholds.

**Distinct players.** A move is theory only if at least 5 different players made it from that position: White
for white-to-move positions, Black otherwise. Names are normalized to surname + first initial, lowercase and
without accents, so "Carlsen, Magnus", "Carlsen, M", "Carlsen,M." and "Magnus Carlsen" are one player
(`players.mjs`). A name without a comma uses its last token as the surname ("Loek van Wely" becomes
"wely, l"; write it "van Wely, Loek" for the right identity). An unknown name (`?`, empty, "Unknown") is one
"unknown" identity that never counts as a player. This keeps one player's pet line out of the book however many
games they played.

**De-duplication.** A game is a duplicate of an earlier one when normalized White, normalized Black, Date, Round
(when present) and the first 40 moves (SAN, ignoring check and annotation marks) are the same; unknown names are left out of the identity (Date, Round and
moves still apply). The first copy is kept; duplicates are reported in the output and the manifest. Several
input files given to one run are de-duplicated together.

## Runbook: build one month (on your own machine/server)

Needs: Node 22+, `zstd`, `git clone` of this repo with `npm ci`, about 35 GB of free disk for one downloaded
month (the dump is streamed and decompressed on the fly, never written to disk), 2 GB of RAM.

**Always feed the build by piping `zstd -dc` into the script (`-` reads stdin). It works the same on every
OS.** On Windows run the whole pipe inside `cmd /c "..."` (PowerShell would re-encode the text stream).
Giving the script a `.pgn.zst` file makes it spawn zstd itself; that works too, but if zstd (or anything feeding
stdin) dies, only the pipe form leaves the failure visible in your shell, so prefer the pipe.

A decompressor that exits non-zero, is killed, or cannot start now FAILS the build (SIG-1227): the script
waits for it, prints its exit code and stderr (for example "No space left on device"), and writes no book, no
manifest and does not rewrite `--app-manifest`. If stdin ends in the middle of a game it warns. Two guards
against a silently short input: with `--months` (or month names in the file names) the script warns when it
read under 10% of the 90 million games a Lichess month has, and `--min-games-read N` turns "fewer than N games
read" into an error with no output.

```bash
# 1. Download (the month list is at https://database.lichess.org/#standard_games; check the checksum if shown)
curl -C - -O https://database.lichess.org/standard/lichess_db_standard_rated_2024-01.pgn.zst

# 2. Quick trial on the first 20,000 qualifying games (a few minutes, tiny output, only to check the setup)
zstd -dc lichess_db_standard_rated_2024-01.pgn.zst | \
  node scripts/opening-book/build-book.mjs - --out-dir out-trial --version 2 --months 2024-01 --max-games 20000

# 3. Full month. --app-manifest rewrites src/chess/opening-book-manifest.ts for this build.
zstd -dc lichess_db_standard_rated_2024-01.pgn.zst | \
  node scripts/opening-book/build-book.mjs - --out-dir out --version 2 --months 2024-01 \
  --min-games-read 70000000 --app-manifest src/chess/opening-book-manifest.ts
# (several months: `zstd -dc a.zst b.zst c.zst | node ... -` concatenates them; --max-map-entries and
#  --tmp-dir bound RAM and choose where spilled partial counts go.)
```

The command prints the manifest and stats as JSON: games kept, positions, moves, bytes, gzip bytes, seconds,
peak RSS. Record them in the PR.

Real data point (book v2, built by hand from the 2026-09 and 2026-10 dumps): 185,012,090 games read (about
92 million per month), 1,641,943 passed the filters (0.9%), 24,949 positions, 56,818 moves, 324,714 bytes raw,
269,451 gzipped. Cost is dominated by (a) reading the stream, roughly 150 MB/s in the synthetic benchmark below,
and (b) replaying the games that pass the header filters, about 3 ms per game on one core. RAM is bounded by
`--max-map-entries` (default 3,000,000, about 1 GB at roughly 300 bytes per entry; lower it for a smaller
machine, the rest spills to temp files). If the file is ever larger than about 10 MB, lower `--max-ply` or
raise the thresholds (`BOOK_RULE`, shared with the explorer book: bump `BOOK_RULE.version` too).

Synthetic benchmark (this repo, `generate-synthetic-pgn.mjs --games 50000`, 58 MB): 11,070 games pass the
filter, 147 positions, 195 moves, 1.7 KB gzipped, 36 s, 232 MiB peak RSS; skimming all 50,000 games with
nothing kept takes 0.4 s (96 MiB). With `--max-map-entries 20000` (23 spills) the output is byte-identical.

### Verify

```bash
node scripts/opening-book/inspect-book.mjs out/opening-book-v2.bin.gz            # counts
# 20 real games, local vs explorer (needs the app running with a LICHESS_TOKEN):
node scripts/opening-book/inspect-book.mjs out/opening-book-v2.bin.gz --pgn games.pgn \
  --explorer http://localhost:3000/api/explorer/book --max-games 20
```

The explorer route caps its walk by time and answers `partial: true` when it ran out. The comparison therefore
asks again (up to `--retries 5` times, `--retry-delay 2000` ms apart) until the answer is complete, prints the
retries used per game, and never compares a partial answer: a game that stays partial or unavailable is shown
as such and left out of the "identical on X of Y" summary.

Expect the same book length on most games. Differences are expected where the explorer's 2200-2500 rating
band and the local source filters disagree on a borderline move.

### Upload and deploy

The object key is `book/<file>` in the engine bucket. Files are versioned and immutable: never overwrite a
version, upload a new one.

```bash
npx wrangler r2 object put chess-studio-engine/book/opening-book-v2.bin.gz \
  --file out/opening-book-v2.bin.gz --content-type application/octet-stream --remote
# (--remote: wrangler 4 writes to a local simulator without it)
git add src/chess/opening-book-manifest.ts && git commit -m "chore(book): opening book v2"
```

Deploy after the upload. Check:

```bash
curl -sI https://<host>/book/opening-book-v2.bin.gz   # 200, cache-control: public, max-age=31536000, immutable, content-length = gzipBytes
```

Then open a review with the network tab: one `/book/opening-book-v2.bin.gz` request (none on the second
review or after a reload: browser cache), and no `/api/explorer/book` request for games that leave theory
before ply 40.

Rollback: restore the previous `opening-book-manifest.ts` and deploy; old files stay in R2.

## Runbook: book v3 (Lichess + masters + correspondence), SIG-1229

Book v3 is the union of three separately built books, so each source keeps its own filters, thresholds and
stats. The app is unchanged: it reads one file, and the binary format is the same. Build each part into its own
folder with `--version 3`, then merge.

Version 2 matched the explorer's book length exactly on 6 of 20 real games (mean 7.3 plies against 10.5): the
3% move share and thin volume in niche lines were the two causes. v3 uses the 1% share (`BOOK_RULE` version 2),
six months of Lichess, and over-the-board and correspondence databases for the lines Lichess barely covers.

Machine: Node 22+, `zstd`, 7-Zip for the Ajedrez Data archives, 16 GB RAM is comfortable (see the estimates
below), and tens of GB of temp disk (`--tmp-dir`) for the masters part.

### A. Lichess, 6 months (2026-05 to 2026-10)

```bash
for m in 05 06 07 08 09 10; do
  curl -C - -O https://database.lichess.org/standard/lichess_db_standard_rated_2026-$m.pgn.zst
done
# Mac/Linux:
zstd -dc lichess_db_standard_rated_2026-0{5,6,7,8,9}.pgn.zst lichess_db_standard_rated_2026-10.pgn.zst | \
  node scripts/opening-book/build-book.mjs - --profile lichess --out-dir out-lichess --version 3 \
  --months 2026-05,2026-06,2026-07,2026-08,2026-09,2026-10 --min-games-read 450000000
```

Windows (cmd, one line, the pipe stays inside `cmd /c`):

```bat
cmd /c "zstd -dc lichess_db_standard_rated_2026-05.pgn.zst lichess_db_standard_rated_2026-06.pgn.zst lichess_db_standard_rated_2026-07.pgn.zst lichess_db_standard_rated_2026-08.pgn.zst lichess_db_standard_rated_2026-09.pgn.zst lichess_db_standard_rated_2026-10.pgn.zst | node scripts\opening-book\build-book.mjs - --profile lichess --out-dir out-lichess --version 3 --months 2026-05,2026-06,2026-07,2026-08,2026-09,2026-10 --min-games-read 450000000"
```

`--min-games-read 450000000` is about 80% of the 6 x 92 million games v2 saw per month: a build whose
decompressor stopped early now fails instead of writing a small book (that is how a 59,367-game book once got
written). Lichess games have unique ids, so there is no de-duplication and no player rule in this part. Expect
three times the work of the two-month v2 run.

### B. Masters (over the board)

Inputs, and only these three (see "Licenses and attribution"): the Chess-Results collection (about 10 million
games exported from ChessBase as PGN, **UTF-8**), Ajedrez Data AJ-OTB, and Lumbra's **"OTB Lichess Broadcast"**
PGN (lumbrasgigabase.com, CC BY-SA 4.0). **Do not use Lumbra's full GigaBase / "OTB Complete" files: that
database is CC BY-NC 4.0 (non-commercial) and Xadrez Digital is commercial.** The Ajedrez Data files are 7-Zip
archives: extract them first, the script reads plain PGN.

```bash
7z x AJ-OTB.7z -oaj-otb          # Windows: 7z.exe x AJ-OTB.7z -oaj-otb
node scripts/opening-book/build-book.mjs chess-results.pgn aj-otb/AJ-OTB.pgn lumbra/LumbraLichessBroadcast.pgn \
  --profile masters --out-dir out-masters --version 3 --tmp-dir /big/disk/tmp --min-games-read 9000000 \
  --license "Chess-Results export; AJ-OTB (public domain, games only); Lumbra Lichess Broadcast (CC BY-SA 4.0)" \
  --attribution "Includes games from Lumbra's GigaBase, Lichess Broadcast subset (lumbrasgigabase.com), CC BY-SA 4.0"
```

`--license` and `--attribution` are free-text strings stored in the build's manifest (and shown per source in the
union manifest, with a de-duplicated `licenses` list at the top level), so the terms travel with the file.

All files of one run are de-duplicated together, so list every masters file in the same command (a game that is
in two collections is counted once, even with the names written differently). The collections overlap
heavily, which is exactly what this handles; the output and the manifest (`inputs`) report, per input file, the
games read, kept and duplicates. Order matters only for that report: a game is credited to the first file that
has it, so list the collection you trust most first.

Lumbra's games carry a `[Source "..."]` tag (the full database has Britbase, ChessNostalgia, ChessOK,
Chessopolis, Convekta, LichessBroadcast, LichessEliteDatabase, LumbrasGigaBase, PGNMentor, TWIC; the Broadcast
file you are allowed to use should only contain `LichessBroadcast`). The script still handles the others so a
mixed file is safe against online play: `LichessEliteDatabase` is online
Lichess play, already covered by part A, so it is dropped (counted as `online`). It does NOT check licenses:
never pass the full database. `LichessBroadcast` games are
over-the-board tournaments relayed through Lichess and are kept, even though their Site or Event may contain
lichess.org; the same goes for any game with a `lichess.org/broadcast` URL in Site or Event. The excluded and
kept sources are constants next to the online-site list in `scripts/opening-book/profiles.mjs`. Set `--min-games-read` to about
90% of the number of games you know are in the files (set it from the files you actually pass). Defaults: both Elos present and at least 2100
(`--min-elo`), at least 5 distinct players per move (`--min-players`), online games skipped. The output prints
the number of duplicates and the games rejected per reason (`elo`, `noElo`, `online`, `result`, `variant`).

### C. Correspondence

Input: Ajedrez Data AJ-CORR (ICCF, IECG, LSS, server daily games), extracted from its 7-Zip archive.

```bash
node scripts/opening-book/build-book.mjs aj-corr/AJ-CORR.pgn \
  --profile correspondence --out-dir out-corr --version 3 --min-games-read 1000000
```

The Elo bar is 2300 on the ICCF/server scale (not FIDE; override with `--min-elo`). Games are kept as
correspondence only on evidence (a TimeControl of a day or more, or ICCF/IECG/LSS/server/daily/correspondence in
Site or Event). If the output shows most games rejected as `notCorrespondence` for a collection you know is all
correspondence, add `--assume-correspondence`: it drops the evidence requirement but still skips live clocks.
Same de-duplication, game-length and 5-distinct-players rules as masters; its stats are reported separately.

### D. Union

```bash
node scripts/opening-book/union-books.mjs out-lichess/opening-book-v3.bin.gz out-masters/opening-book-v3.bin.gz \
  out-corr/opening-book-v3.bin.gz --out-dir out --version 3 --app-manifest src/chess/opening-book-manifest.ts
```

A (position, move) pair is in the result if it is theory in any input. Each input's manifest must sit next to
its book (the build writes both). `out/opening-book-v3.manifest.json` and the app manifest list every source
under `sources` with its profile, files, games kept, duplicates, thresholds and the number of moves only that
source contributed. Check the sizes in the printed JSON (target: gzipped file under about 10 MB).

### E. Upload, manifest PR, comparison

1. Upload `out/opening-book-v3.bin.gz` exactly as in "Upload and deploy" above (key `book/opening-book-v3.bin.gz`).
2. Commit the generated `src/chess/opening-book-manifest.ts` (version 3) in a PR and deploy after the upload.
   The review cache key changes once with it, which is expected: reviews recompute with the new book.
3. Compare with the explorer on the same 20 real games as for v2:
   `node scripts/opening-book/inspect-book.mjs out/opening-book-v3.bin.gz --pgn games.pgn --explorer <url> --max-games 20`
   (partial explorer answers are retried, see "Verify"), and record the exact / earlier / further counts and the
   mean book length against v2 (6/20 exact, 7.3 plies against 10.5).

### Monthly update (manual for now)

Lumbra publishes weekly and monthly updates; only the **Lichess Broadcast** PGN may be used (CC BY-SA 4.0), never
the full database. To refresh the masters part and ship a new book:

1. Re-download Lumbra's "OTB Lichess Broadcast" PGN from lumbrasgigabase.com (and/or add any new masters source
   whose license allows commercial use, for example a newer Chess-Results export; do not add TWIC-derived or
   other third-party files from the full Lumbra DB) and extract it (plain PGN, UTF-8).
2. Keep the masters inputs together in one folder and put the new or replaced file last. The cross-source
   de-duplication drops what earlier files already supplied, so overlapping months are harmless.
3. Rebuild masters with the full list of inputs and a new version (the other parts are rebuilt only when their
   sources changed; keep their `out-lichess` / `out-corr` folders, with `--version N` matching):
   `node scripts/opening-book/build-book.mjs <all masters files> --profile masters --out-dir out-masters --version 4 ...`
4. Rebuild the Lichess and correspondence parts with `--version 4` too if their inputs changed, or copy their
   book and manifest to files named `opening-book-v4.*` in their folders (the union reads books by path and
   takes the version from `--version`, not from the inputs).
5. Union: `node scripts/opening-book/union-books.mjs out-lichess/opening-book-v4.bin.gz out-masters/opening-book-v4.bin.gz out-corr/opening-book-v4.bin.gz --out-dir out --version 4 --app-manifest src/chess/opening-book-manifest.ts`.
6. Upload `out/opening-book-v4.bin.gz` (never overwrite an older version), commit the manifest in a PR, deploy,
   and run the comparison from step E. Bumping the version changes the review cache key, so reviews recompute once.

An automated routine for this is a separate issue.

### Estimates for the masters build (extrapolated from synthetic runs, not measured on real masters files)

Assumes up to about 15 million input games across the three inputs (Chess-Results about 10 million; AJ-OTB and
the Lumbra Broadcast subset the rest), overlapping.

- **Time:** about 3 ms per game that is replayed (up to 40 plies), single core. De-duplication runs before the
  replay on a hash of the players, Date, Round and the SAN moves, so an overlapping game costs only a hash.
  Say 10 to 12 million unique games, of which perhaps half pass the Elo, result and online filters: 5 to 6
  million replays, so roughly 3 to 5 hours. Reading and hashing the 15 million games adds tens of minutes and
  the final merge about as much.
- **RAM:** de-duplication holds one 64-bit hash per game seen: 9 bytes per slot at most half full, so about
  300 MB for 15 million games (the table doubles; the old one is alive for a moment). The counts map is capped by
  `--max-map-entries` (default 3,000,000), about 300 bytes per entry, and masters/correspondence also keep up to
  5 player hashes per move entry, about 1.3 GB at the default. Total: roughly 2 GB. With 8 GB or less pass
  `--max-map-entries 1500000` (more spills, slower, same output). 
- **Disk:** every spill writes up to 3,000,000 records of 35 bytes (about 105 MB). A masters run spills tens of
  times: plan 3 to 6 GB under `--tmp-dir`; it is removed when the run ends or fails.
- Spilled and in-memory builds produce byte-identical files (tested).

## Licenses and attribution

The published book is derived from these sources; keep this list and the `license` / `attribution` fields of the
manifests in step with what was actually used.

| Source | License | What it requires |
|---|---|---|
| Lichess open database (database.lichess.org) | CC0 | nothing |
| Lumbra's GigaBase, **Lichess Broadcast subset** ("OTB Lichess Broadcast" PGN) | CC BY-SA 4.0 | attribution, and the derived book must be offered under CC BY-SA 4.0 |
| Ajedrez Data (AJ-OTB, AJ-CORR) | the games are stated to be public domain (no comments) | nothing |
| Chess-Results collection | as exported by its owner | confirm before publishing |

- **Lumbra's full GigaBase is not an input.** Its main database is CC BY-NC 4.0 (non-commercial) and Xadrez
  Digital is commercial. It could only be used with a commercial license from business@lumbrasgigabase.com.
  Do not add the full database, its "OTB Complete" file, or the Source tags it carries (TWIC, Britbase, ...)
  to any build.
- Because the masters part includes the Broadcast subset, the **union** (the book served to users) is a derived
  work under CC BY-SA 4.0: show the attribution where the book is credited (for example the About or credits
  page, or the repository notice) and offer the derived book under CC BY-SA 4.0 (a link to the
  `/book/opening-book-vN.bin.gz` file, whose license is stated alongside it).
- The build records the terms: pass `--license "..."` and `--attribution "..."` to `build-book.mjs`; they are
  copied into each build's manifest, and the union manifest keeps them per source and lists the distinct
  licenses in `licenses`.

## Local development

`public/book/opening-book-fixture-v1.bin.gz` is a tiny book built from synthetic games (do not trust its
content; it exists for tests and offline development). Use it with
`NEXT_PUBLIC_OPENING_BOOK_FILE=opening-book-fixture-v1.bin.gz npm run dev`. Regenerate it with:

```bash
node scripts/opening-book/generate-synthetic-pgn.mjs --games 50000 --seed 1226 > synthetic.pgn
node scripts/opening-book/build-book.mjs synthetic.pgn --out-dir out --version 1 --months 2024-01 \
  --build-date 2024-02-01T00:00:00.000Z
cp out/opening-book-v1.bin.gz public/book/opening-book-fixture-v1.bin.gz
```

Without a book file (the e2e build, a fresh checkout) the fetch returns 404 and the explorer fallback runs.
