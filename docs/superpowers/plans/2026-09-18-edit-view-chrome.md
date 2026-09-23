# Edit + View Chrome Implementation Plan

> **For agentic workers:** Implement inline in this session. No commits unless the user asks.

**Goal:** Enable Insert null move, text before move, clear marks, Open Panel, and board theme palettes.

**Architecture:** Chess helpers for null-move FEN and shared theme palettes; thin store actions; MenuBar submenus; dockview API registry so closed panels can be reopened.

**Tech Stack:** Next.js App Router client components, zustand, chess.js, dockview-react, react-chessboard.

## Global Constraints

- English Studio chrome; no ChessMonitor assets
- Guest mode without Supabase
- Piece Set / Color Scheme / Move Notation stay disabled
- Do not commit unless asked

## Files

- Create: `src/chess/null-move.ts`, `src/chess/board-themes.ts`, `src/studio/dock-api.ts`
- Modify: `src/chess/tree.ts`, `src/chess/pgn.ts`, `src/store/studio-store.ts`, `src/studio/MenuBar.tsx`, `src/studio/StudioDock.tsx`, `src/studio/StudioShell.tsx`, `src/studio/NotationPanel.tsx`, `src/studio/BoardPanel.tsx`, `src/studio/SetupBoardPanel.tsx`

### Task 1: Null move + commentBefore in chess layer

- [x] `applyNullMoveFen`, PGN `--`/`Z0`, `setNodeCommentBefore`, skip last-move highlight

### Task 2: Store actions

- [x] `insertNullMove`, `setMoveCommentBefore`, `clearBoardMarks`, expanded `BoardTheme`

### Task 3: Dock Open Panel + menus + themes UI

- [x] Register dock API, submenus, comment-before editor, Ctrl+Shift+A
