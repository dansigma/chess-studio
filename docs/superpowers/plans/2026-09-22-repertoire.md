# Repertoire panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Repertoire dock tab that lists the next moves in the active board’s PGN at the current position, including other move orders.

**Architecture:** `repertoireMoves(tree, path)` walks the tree mainline-first, matches positions with `fenKey`, and returns one row per UCI. The panel renders that list and calls `goPath` only when the path still exists. The dock seeds the tab beside Notation and adds it to saved layouts without resetting them.

**Tech Stack:** Next.js, React, Zustand, dockview, chess.js, node:test via `npx tsx`.

## Global Constraints

- A repertoire is the PGN on the active board, including an unsaved board
- Position match is the first four FEN fields
- One row per move; click prefers the current line
- Rows are the move only, in the selected move notation, with no move number
- Empty copy is “No moves stored here.”
- The panel does not add, delete, or save moves
- Training, other files, comments, glyphs, and evals are out of scope
- Do not commit unless asked

---

### Task 1: repertoireMoves

**Files:**
- Create: `src/chess/repertoire.ts`
- Test: `src/chess/repertoire.test.ts`

**Interfaces:**
- Produces: `repertoireMoves(tree: GameTree, path: Path): RepertoireMove[]` where `RepertoireMove` is `{ uci: string; san: string; path: Path }`

- [ ] Write failing tests for two replies, a duplicate that prefers the current line, a move that exists only on the other order, a move-number difference, and a different piece placement
- [ ] Run `npx tsx --tsconfig tsconfig.json --test src/chess/repertoire.test.ts` and confirm failure
- [ ] Implement `repertoireMoves`
- [ ] Re-run the test and confirm pass

### Task 2: Repertoire panel and dock tab

**Files:**
- Create: `src/studio/RepertoirePanel.tsx`
- Modify: `src/studio/StudioDock.tsx`
- Modify: `src/studio/dock-api.ts`
- Modify: `src/studio/dock-layout.ts`

- [ ] Render the moves for the active board, or “No moves stored here.”
- [ ] Click calls `goPath` when `getNodeAt` finds the path
- [ ] Seed `repertoire` inactive beside Notation
- [ ] Add the tab to an existing layout when it is missing
- [ ] Include it in `STUDIO_PANELS`, `StudioPanelId`, and View → Open Panel

### Task 3: Browser check

- [ ] Open `/studio`, confirm the Repertoire tab lists a move played on the board and shows the empty line after that move
