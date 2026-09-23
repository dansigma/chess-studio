# Player bookmarks

Date: 2026-09-18  
Status: approved (approach A)

## Goal

Turn the stub Bookmark activity into a ChessMonitor-style list of favorite players. Search and the player explorer can star/unstar. Guests keep the list in this browser. Signed-in users also sync to the self-hosted Supabase project.

## In scope

- Activity bar Bookmarks sidebar
- Empty state: `No bookmarked players yet`
- Star toggle on Search hits and on the player explorer header
- Click / W / B open the existing player explorer
- `localStorage` key `studio-clone-bookmarks`
- Table `player_bookmarks` with RLS, merged on login

## Out of scope

- FIDE ID search
- Bookmark folders
- Saving a FEN or board path
- ChessMonitor branding or assets

## Model

A bookmark is a `PlayerHit` plus `bookmarkedAt`. Unique key: `source` + lowercase `username`.

Guest writes always succeed locally. Remote upsert/delete runs in the background when `user` is set. Remote failure does not roll back local state.

Login merge is a union by key. If the same player exists locally and remotely, keep the earlier `bookmarkedAt`.

## UI

English Studio chrome. Bookmarks sidebar uses the same `w-64` / `#1e1f22` shell as Search, without a search box. No folder tree.

## Constraints

- Do not commit secrets. Self-hosted URL and publishable key live in `.env.local` (gitignored). The secret key is server-only (`SUPABASE_SECRET_KEY`), never `NEXT_PUBLIC_`.
- Do not copy ChessMonitor artwork.
- Guest mode must keep working without a reachable Supabase.
