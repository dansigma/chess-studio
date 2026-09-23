# Share a board

Date: 2026-09-22  
Status: approved

## Goal

File → Share board copies a link. Opening the link starts a studio board on that position.

## In scope

- The link is this site’s `/studio` address plus the current FEN, including an unapplied Setup Board draft
- A guest can open it. Nothing is stored
- A FEN chess.js rejects is ignored, and the studio opens on the starting position
- File → Share board opens a dialog that shows the link. Copy link puts it on the clipboard.

## Out of scope

- The moves of the current game. Copy PGN and Export PGN already carry those
- Repertoire and training
