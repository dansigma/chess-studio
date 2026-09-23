# Personal Files databases in Explorer / Games

Date: 2026-09-18  
Status: approved (approach A — in-memory mainline index)

## Goal

A personal PGN library created in Files can be selected in the Databases sidebar. Ultra Database (moves) and Ultra Games then show stats and games from that library at the current board FEN, without calling Lichess.

## In scope

- List each Files database under Ultra / Online in Databases
- Selecting one drives explorer moves + games from that library
- Clicking a game opens its stored PGN on the board (same as Files)
- In-memory index of mainline positions, rebuilt from PGN (not persisted)
- Guest works; no new Supabase tables

## Out of scope

- Chess.com online database
- Explorer filters (A / lightning / flame)
- Ultra 10.8M / copying ChessMonitor data
- Writing `game_positions` to Postgres
- Indexing variations
- Changing the Files sidebar create/import flow

## Model

`databaseSource` is `"masters" | "lichess" | \`file:${databaseId}\``. Cloud sources keep using `/api/explorer`. File sources never hit that route.

Index key: first four FEN fields (piece placement, side to move, castling, en passant), same as the built-in opening book. Walk only `children[0]` of the imported tree (mainline). Cap games listed per position at 50, sorted by year descending.

Unfinished results (`*`) count with draws in W/D/L, matching the sample book.

If the selected Files database is deleted, source falls back to `"masters"`.

## UI

English Studio chrome. Databases search filters personal rows only; Ultra and Online always stay visible. Explorer / Games titles use the database name. Empty or unknown position: existing `No games for this position.`

## Constraints

- Do not copy ChessMonitor artwork or private DBs
- Engine analysis stays on the real tree FEN
- No git commit unless asked
