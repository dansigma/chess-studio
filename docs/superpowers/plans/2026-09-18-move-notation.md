# Move Notation Implementation Plan

> **For agentic workers:** Implement inline in this session. Do not commit unless the user asks.

**Goal:** Localize displayed SAN (including Portuguese) without changing stored PGN.

**Architecture:** `formatSan` maps English piece letters. Settings `moveNotation` like `pieceSet`. Notation / Engine / Explorer call it at render time.

## Global Constraints

- English UI chrome (menu labels)
- Tree SAN stays English
- No git commit unless asked

---

### Task 1: Mapper + settings

**Files:**
- Create: `src/chess/move-notation.ts`
- Modify: `src/store/studio-store.ts`

### Task 2: Menu + surfaces

**Files:**
- Modify: `src/studio/MenuBar.tsx`
- Modify: `src/studio/NotationPanel.tsx`
- Modify: `src/studio/EnginePanel.tsx`
- Modify: `src/studio/ExplorerPanel.tsx`
- Modify: `src/studio/PlayerExplorerPanel.tsx`

### Task 3: Verify

- `npx tsc --noEmit`
- Browser: View → Portuguese shows `C` for knights in Notation; English restores `N`; PGN copy still has `N`
