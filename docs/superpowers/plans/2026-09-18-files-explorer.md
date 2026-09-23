# Files → Explorer Implementation Plan

> **For agentic workers:** Implement inline in this session. Do not commit unless the user asks.

**Goal:** Personal Files databases appear in Databases and drive Ultra Database / Ultra Games from an in-memory mainline index.

**Architecture:** Extend `ExplorerSource` with `file:${id}`. A `files-explorer` module indexes each `FileDatabase` by normalized FEN. StudioShell skips `/api/explorer` for file sources. Deleting the selected DB resets to masters.

**Tech Stack:** Next.js App Router, zustand, chess.js / existing `importPgn` trees.

## Global Constraints

- English UI copy
- No ChessMonitor assets or Ultra 10.8M data
- No git commit unless asked
- Guest works without Supabase
- Mainline only; no `game_positions` table

---

### Task 1: Source type + index module

**Files:**
- Modify: `src/lib/explorer-types.ts`
- Create: `src/lib/files-explorer.ts`
- Modify: `app/api/explorer/route.ts` (`isSource` stays masters|lichess)

Exports: `CloudExplorerSource`, `fileExplorerSource`, `fileDatabaseId`, `isCloudExplorerSource`, `explorerSourceTitle`, `lookupFilesExplorer`.

### Task 2: Store + explorer fetch

**Files:**
- Modify: `src/store/studio-store.ts` (`deleteFileDatabase` fallback)
- Modify: `src/studio/StudioShell.tsx` (file source → local lookup)

### Task 3: Databases sidebar + panel labels

**Files:**
- Modify: `src/studio/DatabasesSidebar.tsx`
- Modify: `src/studio/ExplorerPanel.tsx`
- Modify: `src/studio/GamesPanel.tsx`

### Task 4: Verify

- `npx tsc --noEmit`
- Browser: import a small PGN in Files, select it in Databases, check start position moves/games, play a move, open a game, delete the DB (source returns to Ultra)
