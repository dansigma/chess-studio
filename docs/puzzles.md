# Puzzles

## Data source

The trainer serves puzzles from `public.puzzles` (migration
`supabase/migrations/20261021250000_puzzles.sql`), a ~60,000 puzzle subset of
the Lichess puzzle database (CC0). Without that table, the API falls back to
the built-in catalog (about 641 puzzles, custom ids, no Lichess game link).

SIG-1243: if the table is empty, `queryPuzzleTable` returns `null` for every
caller (signed in or not) and logs one `[puzzles] ... looks empty/unloaded`
warning. An empty table never shows "you solved everything here"; that message
only appears when the window has puzzles and the signed-in user has seen all of
them. In the empty-table fallback the built-in catalog is served without the
account seen ledger; the client still sends its local seen ids as `exclude`,
so repeats are limited but possible.

## Production load runbook

The table is loaded manually and offline. Run this once per environment.

1. Download `lichess_db_puzzle.csv.zst` from <https://database.lichess.org/#puzzles>.
2. Decompress it to a file:

   ```sh
   zstd -d lichess_db_puzzle.csv.zst -o lichess_db_puzzle.csv
   ```

   Windows pitfall: do not pipe `zstd -dc` into the next command from
   PowerShell or cmd. Those shells re-encode and corrupt binary or large text
   pipes. Decompress to a file first, as above.

3. Build the subset (balanced by rating band and theme, deterministic):

   ```sh
   node scripts/lichess-puzzles/build-subset.mjs lichess_db_puzzle.csv puzzles-subset.csv
   ```

   Optional flags: `--size 60000` and `--seed 1042` (the defaults). The output
   header is `id,fen,moves,rating,themes,popularity,nb_plays`.

4. Load it in psql against the target database:

   ```sql
   \copy public.puzzles(id,fen,moves,rating,themes,popularity,nb_plays) from 'puzzles-subset.csv' csv header
   ```

5. Verify. It should return about 60000:

   ```sql
   select count(*) from public.puzzles;
   ```

The column list above matches the migration and the script's `OUTPUT_HEADER`.
The load keeps Lichess ids, which enables the "From a Lichess game" link. If
rerunning on a non-empty table, `\copy` fails on duplicate ids; truncate first
(`truncate public.puzzles;`) if you intend to replace the subset.
