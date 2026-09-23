# Edit + View chrome

Date: 2026-09-18  
Status: approved (approach A)

## Goal

Turn the remaining disabled Edit/View menu items into working Studio actions, matching ChessMonitor behavior without copying assets or branding.

## In scope

- Insert null move
- Text before move (Ctrl+Shift+A)
- Clear arrows & highlights
- View → Open Panel
- View → Board Theme submenu with color palettes

## Out of scope

- Piece Set, Color Scheme, Move Notation, Game Preview Mode
- Remote engines, Ultra 10.8M database, Bookmarks
- Texture/image piece or board sets from ChessMonitor

## Null move

- Menu: Edit → Insert null move
- Creates a tree node with SAN `--`, UCI `0000`, empty `from`/`to`
- FEN only flips the side to move, clears en passant, increments halfmove (and fullmove after Black)
- Does not call `chess.move`
- PGN export writes `--`; import accepts `--` and `Z0`
- No last-move square highlight on that node
- Engine analyzes the resulting FEN
- Disabled only while Setup Board is open

## Text before move

- Edit → Text before move, shortcut Ctrl+Shift+A
- Reuses the notation comment editor; writes `TreeNode.commentBefore`
- Disabled at the starting position (no current move)
- Ctrl+A remains text after / start comment

## Clear arrows & highlights

- Clears `marks` on the current node, or `startMarks` at the root
- Disabled when there are no marks at the current path
- Right-click drawing on the board is unchanged

## Open Panel

- View → Open Panel submenu: Board, Notation, Engine, Ultra Database, Ultra Games
- If the dock panel exists, activate it
- If the user closed it, recreate it in the default layout position
- `StudioDock` registers the dockview API on ready; Reset View still remounts the full layout

## Board themes

- View → Board Theme submenu with a check on the current theme
- IDs: `studio` (default), `grey`, `brown`, `green`, `blue`, `purple`, `newspaper`, `wood`, `grass`, `ice`
- Color-only hex palettes in a shared module used by Board and Setup Board
- Persist via existing `settings.boardTheme` (localStorage + `user_settings.board_theme` string)

## Constraints

- Portuguese UI copy is not required; keep English Studio chrome like ChessMonitor
- Do not copy ChessMonitor artwork
- Guest mode must keep working without Supabase
