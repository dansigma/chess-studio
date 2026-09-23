# Print

Date: 2026-09-22  
Status: approved

## Goal

File → Print opens a page with the current board and the game notation, then starts the browser print dialog.

## In scope

- The board image already used by Copy board image (theme, orientation, coordinates, last-move highlight, arrows, square marks)
- Notation for the whole game, including variations, comments, and glyphs, in the selected move notation
- The current move is marked
- Heading is the board title
- The print dialog shows only that sheet. The studio chrome stays out of the print, because printing the live page drops the board colors and leaves the pieces on white.

## Out of scope

- The evaluation bar and the rest of the studio chrome
- Share, repertoire, and training
