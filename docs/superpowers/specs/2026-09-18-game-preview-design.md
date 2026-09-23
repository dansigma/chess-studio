# Game Preview Mode

Date: 2026-09-18  
Status: approved (reusable preview board tab)

## Goal

View → Game Preview Mode opens listed games on a disposable, reused board tab so browsing Ultra Games / Files / player games does not overwrite the analysis board or spawn a tab per click.

## In scope

- Toggle View → Game Preview Mode (check when on), default **on**
- Click in Ultra Games, Files sidebar games, and player games
- Reuse a single `preview` board while the mode is on; create one if none exists
- Seek the imported mainline to the current analysis / explorer FEN (first 4 FEN fields)
- Double-click an Open Boards row to pin (clear `preview`)
- Persist `gamePreviewEnabled` in `studio-clone-settings` only

## Out of scope

- Color Scheme
- Hover overlay of a game on the analysis board
- New Supabase column
- ChessMonitor tab CSS / branding
- Changing File → Open PGN / clipboard / drag-drop (those still load onto the active board)

## Behavior

### On (default)

Clicking a listed game:

1. Snapshot the seek FEN: explorer FEN when opening from Ultra Games, otherwise the first non-preview board’s current FEN (fallback: active board).
2. Import PGN or SAN line into a tree.
3. Set path with `mainlinePathForFen` (start if the FEN is absent).
4. If a board with `preview === true` exists, replace its tree/path/headers/title, `dirty: false`, keep `preview: true`, activate it.
5. Else append a new board with `preview: true` and activate it.
6. Analysis boards are left untouched.

Lichess Online rows without PGN keep the existing status message; nothing opens.

### Off

Each click appends a new non-preview board and activates it. Turning the toggle off strips `preview` flags; existing tabs stay.

### Pin

Double-click in Open Boards on a preview row sets `preview: false`. The title stays; the UI suffix ` · preview` disappears. Edits on a preview board do not auto-pin; the next listed-game click still replaces that tab.

### Engine

The engine analyzes the **active** board. If the preview tab is active, it analyzes that tree. Engine PV hover remains an overlay (`enginePreview`) and does not write the tree.

## Data

`BoardSession.preview: boolean` (default false).  
`StudioSettings.gamePreviewEnabled: boolean` (default true).  
Not written to `user_settings`.

## Constraints

- English Studio chrome
- Do not copy ChessMonitor artwork
- No git commit unless asked
