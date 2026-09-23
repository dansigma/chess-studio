# Repertoire panel

Date: 2026-09-22  
Status: approved

## Goal

A Repertoire tab lists the next moves stored in the PGN open on the active board, at the position on that board. The same position reached by another move order contributes its next moves too. Saving stays in Files.

## In scope

- Dock tab **Repertoire** (`repertoire`), in the same group as Notation
- The active board’s tree, including a board that has not been saved yet
- At the current tree position, every distinct next move that leaves that position anywhere in the PGN
- The same move is one row. Row order is mainline first, then the rest of the tree
- A click stays on the current line when that move is already the next move there. Otherwise the click jumps to the other move order and plays the move
- Each row is the move itself, in the selected move notation, with no move number. The same move can occur at different ply numbers
- Empty position: “No moves stored here.”
- View → Panels can open the tab again
- A saved dock layout gains the tab beside Notation. The rest of that layout stays
- On a fresh layout the tab is present and Notation stays selected

## Position match

Two positions match when the first four FEN fields match: piece placement, side to move, castling, and en passant. Halfmove clock and fullmove number do not split them.

The panel follows the tree position. An unapplied Setup Board draft is ignored until it is applied.

## List and click

Walk the tree mainline-first. Whenever a node’s position matches, take that node’s children. The starting position is the root, and its children are the first moves. Keep the first occurrence of each move. If the current line already has that move as its next move, the click uses that line and the row stays where it was.

A click sets the active board’s path to that move. If that path is no longer in the tree, the click does nothing.

Playing a move on the board still adds it to the tree. The panel updates from that tree. The panel does not add, delete, or save moves.

## Out of scope

- Training
- A repertoire list separate from Files
- Moves from any file other than the active board
- Comments, glyphs, or evals on the rows

## Tests

A pure function covers:

- Two move orders into one position, with different next moves: both moves are listed
- The same next move via two orders: one row, and the click path is the current line
- A move that exists only on the other order: the click path is that order
- A position that differs only by move number still matches
- A different piece placement is excluded
