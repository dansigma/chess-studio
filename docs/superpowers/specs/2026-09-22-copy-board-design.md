# Copy FEN and board image

Date: 2026-09-22  
Status: approved

## Goal

File → Copy FEN puts the position on screen on the clipboard. File → Copy board image puts that board on the clipboard as a PNG. The same two actions are on the board’s right-click menu.

## In scope

- Current position, including an unapplied Setup Board draft
- PNG of the board only: theme, orientation, coordinates when they are on, last-move highlight, arrows, and square marks
- Status text after each action
- If the browser refuses an image on the clipboard, download `board.png` instead

## Out of scope

- The evaluation bar, the notation panel, and the rest of the studio
- Sound, print, share, repertoire, and training
- A new database column

## Behavior

The mounted board publishes its FEN. Copy FEN uses that, or the active board’s FEN when nothing is published. Copy board image snapshots the element marked `data-board-image`.
