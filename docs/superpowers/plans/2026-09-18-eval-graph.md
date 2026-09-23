# Eval Graph Implementation Plan

> **For agentic workers:** Implement inline in this session. Do not commit unless the user asks.

**Goal:** Dock Eval Graph for the current variation, filled by a FEN cache and a background Stockfish walk.

**Architecture:** `variationPoints` on the tree. `evalByFen` in the store. `EvalGraphPanel` owns a second `StockfishEngine`. Live `EnginePanel` writes the same cache. SVG area chart; click seeks.

**Tech Stack:** Zustand, existing Stockfish WASM, dockview tab next to Engine.

## Global Constraints

- English UI chrome
- No new Supabase column
- Main engine + PV overlay unchanged
- No git commit unless asked

---

### Task 1: Variation points + cache + panel + dock

**Files:**

- Modify: `src/chess/tree.ts` — `variationPoints`
- Modify: `src/store/studio-store.ts` — `evalByFen`, `putEvalCache`
- Modify: `src/studio/EnginePanel.tsx` — write cache
- Create: `src/studio/EvalGraphPanel.tsx`
- Modify: `src/studio/dock-api.ts`, `src/studio/StudioDock.tsx`

### Task 2: Verify

- `npx tsc --noEmit`
- Browser: Open Panel / Engine tab → Eval Graph; play moves; curve fills; click seeks; Engine still analyzes the current board
