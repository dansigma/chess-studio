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

The rule is the SIG-1225 rule, shared in code (`BOOK_RULE` in `src/chess/opening-theory.ts`): from the
position before the move, the position has at least 100 games, and the move has at least 20 games and at
least 3% of the position's games. Source games: both players rated 2300 or more, blitz/rapid/classical by
`TimeControl` (base + 40 x increment seconds: under 30 ultraBullet, 180 bullet, 480 blitz, 1500 rapid, else
classical), standard chess, not aborted, at least 10 moves. The first 40 plies of each game are counted.

The review cache key contains `OPENING_BOOK_MANIFEST.version` (`src/chess/opening-book-manifest.ts`), so
reviews made with another book are recomputed once.

## Binary format

Spec comment in `src/chess/opening-book-format.ts`. Header of 16 bytes (magic `XDOB`, format version, ply
cap, key count, entry count), then one group per position sorted by unsigned 64-bit key: the key as a LEB128
delta from the previous key, a move count (u8), and the moves as u16 codes (from | to << 6 | promotion << 12).
Position keys are the app's position hash (`src/chess/zobrist.ts`, from the FEN placement, side, castling and
en passant fields). The file is shipped gzip-compressed. Lookup is an exact binary search (no Bloom filter).
Around 9 bytes per (position, move) pair.

## Runbook: build one month (on your own machine/server)

Needs: Node 22+, `zstd`, `git clone` of this repo with `npm ci`, about 35 GB of free disk for one downloaded
month (the dump is streamed and decompressed on the fly, never written to disk), 2 GB of RAM.

```bash
# 1. Download (the month list is at https://database.lichess.org/#standard_games; check the checksum if shown)
curl -C - -O https://database.lichess.org/standard/lichess_db_standard_rated_2024-01.pgn.zst

# 2. Quick trial on the first 20,000 qualifying games (a few minutes, tiny output, only to check the setup)
zstd -dc lichess_db_standard_rated_2024-01.pgn.zst | \
  node scripts/opening-book/build-book.mjs - --out-dir out-trial --version 2 --months 2024-01 --max-games 20000

# 3. Full month. --app-manifest rewrites src/chess/opening-book-manifest.ts for this build.
node scripts/opening-book/build-book.mjs lichess_db_standard_rated_2024-01.pgn.zst \
  --out-dir out --version 2 --app-manifest src/chess/opening-book-manifest.ts
# (several months: list several files; they are merged. --max-map-entries and --tmp-dir bound RAM and
#  choose where spilled partial counts go.)
```

The command prints the manifest and stats as JSON: games kept, positions, moves, bytes, gzip bytes, seconds,
peak RSS. Record them in the PR.

Expected cost for one real month (extrapolated from the synthetic benchmark below, **not measured on a real
dump**): 90-100 million games; reading and filtering on headers runs at roughly 150 MB/s, so the stream
(a few hundred GB decompressed) takes 30-60 minutes; replaying the games that pass the filter (a few hundred
thousand, about 3 ms each) adds 10-20 minutes. RAM is bounded by `--max-map-entries` (default 3,000,000, about
1 GB at roughly 300 bytes per entry; lower it for a smaller machine, the rest spills to temp files). Expected
size: a few hundred thousand theory moves at about 9 bytes each, so 2-4 MB gzipped. If the file is larger than
about 10 MB, lower `--max-ply` or raise the thresholds (the thresholds are `BOOK_RULE`, shared with the
explorer book: bump `BOOK_RULE.version` too).

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

Expect the same book length on most games. Differences are expected where the explorer's 2200-2500 rating
band and the local "both 2300+" filter disagree on a borderline move.

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
