# Game Preview Mode Implementation Plan

> **For agentic workers:** Implement inline in this session. Do not commit unless the user asks.

**Goal:** Toggle a reusable preview board for listed games without clobbering analysis.

**Architecture:** `BoardSession.preview` plus `openListedGame` in the store. Game lists call that instead of `importPgnText` / `importPlayerGame`. Seek uses `mainlinePathForFen`.

**Tech Stack:** Zustand, existing PGN import, Open Boards sidebar.

## Global Constraints

- English UI chrome
- No new Supabase column
- Engine stays on the active board tree; PV hover overlay unchanged
- No git commit unless asked

---

### Task 1: Seek helper + settings + openListedGame

**Files:**

- Modify: `src/chess/tree.ts` — `fenKey`, `mainlinePathForFen`
- Modify: `src/store/studio-store.ts` — `preview`, `gamePreviewEnabled`, `toggleGamePreview`, `pinPreviewBoard`, `openListedGame`

### Task 2: Menu + lists + Open Boards

**Files:**

- Modify: `src/studio/MenuBar.tsx`
- Modify: `src/studio/GamesPanel.tsx`
- Modify: `src/studio/PlayerGamesPanel.tsx`
- Modify: `src/store/studio-store.ts` (`openFileGame`)
- Modify: `src/studio/BoardsSidebar.tsx`

### Task 3: Verify

- `npx tsc --noEmit`
- Browser: with mode on, open a game from Ultra Games; analysis board remains; Open Boards shows ` · preview`; second game reuses that tab at the current FEN; double-click pins; mode off opens a new tab
