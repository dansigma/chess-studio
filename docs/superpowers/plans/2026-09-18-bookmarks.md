# Player Bookmarks Implementation Plan

> **For agentic workers:** Implement inline in this session. Do not commit unless the user asks.

**Goal:** Favorite Lichess / Chess.com / studio-book players from Search, list them in the Bookmarks activity, persist locally and optionally on the self-hosted Supabase.

**Architecture:** Mirror Files. A small `player-bookmarks` module owns parse/persist. Zustand holds the list. The Bookmark activity icon is no longer a stub. Stars call `togglePlayerBookmark`. StudioShell hydrates remote rows on login.

**Tech Stack:** Next.js App Router, zustand, Supabase JS (publishable key in the browser), Postgres RLS.

## Global Constraints

- English UI copy
- No ChessMonitor assets
- No git commit unless asked
- Secrets only in `.env.local`
- Guest works with empty or unreachable cloud

---

### Task 1: Persistence module + schema

**Files:**
- Create: `src/lib/player-bookmarks.ts`
- Create: `supabase/migrations/20260918120000_player_bookmarks.sql`
- Modify: `src/lib/supabase/database.types.ts`

Exports: `PlayerBookmark`, `bookmarkKey`, `loadLocalBookmarks`, `saveLocalBookmarks`, `upsertBookmark`, `removeBookmark`, `mergeBookmarks`, `persistRemoteBookmark`, `deleteRemoteBookmark`, `loadRemoteBookmarks`.

### Task 2: Store + activity chrome

**Files:**
- Modify: `src/store/studio-store.ts` (`ActivityView` includes `"bookmarks"`)
- Modify: `src/studio/ActivityBar.tsx`
- Modify: `src/studio/StudioShell.tsx`

### Task 3: Sidebars and stars

**Files:**
- Create: `src/studio/PlayerHitRow.tsx`
- Create: `src/studio/BookmarksSidebar.tsx`
- Modify: `src/studio/SearchSidebar.tsx`
- Modify: `src/studio/PlayerExplorerPanel.tsx`

### Task 4: Self-hosted env

**Files:**
- Create: `.env.local` (gitignored)
- Modify: `.env.example` (placeholders only)

Map `SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`, publishable → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, secret → `SUPABASE_SECRET_KEY`, JWKS → `SUPABASE_JWKS_URL`.

### Task 5: Verify

- `npx tsc --noEmit`
- Browser: empty state, star from Search, list, open explorer, reload, unstar, W/B chips
