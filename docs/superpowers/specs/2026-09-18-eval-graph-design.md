# Eval Graph

Date: 2026-09-18  
Status: approved (dock tab + FEN cache + background walk)

## Goal

View → Open Panel → Eval Graph plots White-up evaluation along the **current variation** (root → end of that line). Click a ply to seek. The live engine on the active board is unchanged.

## In scope

- Dock panel `Eval Graph`, default as an **inactive tab in the Engine group**
- Open Panel entry
- SVG chart (no chart library), Studio tokens, original palette
- In-memory eval cache keyed by FEN (first 4 fields)
- Second Stockfish instance while the panel is mounted: sequential walk, MultiPV 1, depth `min(12, engineDepth)`
- Live Engine writes the same cache for the active FEN
- Click ply → `goPath`; hover shows SAN + eval
- Current ply marker

## Out of scope

- Persisting evals (no Supabase column, not in `studio-clone-settings`)
- Walking every branch / the whole tree
- Changing PV hover overlay or the Engine panel search
- ChessMonitor chart artwork
- PGN `[%eval]` import (nice later; walk covers it)

## Behavior

### Line

`variationPoints(tree, path)`: start position, then each node on `path`, then `children[0]` until that variation ends.

### Cache

`evalByFen[fenKey] = { pawns, label, depth }`. Deeper result wins. Mate uses the existing `scoreNumber` / `formatScore` (White-positive). Chart Y clamps to ±5 pawns like the eval bar.

### Walk

Starts when Eval Graph is mounted and Setup Board is closed. Skips FENs already at walk depth. Changing variation or board identity restarts the walk. Unmount disposes the second engine.

### Empty

No moves yet: one start-position point (filled when analyzed). Copy: “Make a move to plot the line.”

## Constraints

- English Studio chrome
- Engine analyzes the **active** board tree; graph follows that board
- No git commit unless asked
