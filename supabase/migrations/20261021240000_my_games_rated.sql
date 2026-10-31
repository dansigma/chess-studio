-- SIG-1048: rated flag for imported games (Insights 1/4). The opening-tree
-- filters need to know whether a game was rated; upstream Lichess/Chess.com
-- payloads carry the flag, but `my_games` (SIG-1088) has no column for it.
-- Null means unknown (rows imported before this migration). The sync route
-- (SIG-1088) writes it via `playerGameToRow`; the existing insert policy
-- and selects already cover the new column, so this file adds only it.
alter table public.my_games
  add column if not exists rated boolean;
