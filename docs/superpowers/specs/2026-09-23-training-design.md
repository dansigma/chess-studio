# Training

Date: 2026-09-23  
Status: approved

## Goal

Train the repertoire open on the active board, starting from the position already on the board. You find every stored move, for White and for Black. A move that is not stored is refused and is not added to the tree.

## In scope

- **Train** and **Stop** on the Repertoire panel
- Train remembers the current path as the session start and turns training on
- While training is on, the repertoire move list is hidden
- A board move is accepted only when its UCI is one of the moves `repertoireMoves` lists at the current position
- An accepted move follows that existing line. It does not create a node
- A refused move leaves the board where it is. Status: “Not in the repertoire.”
- When no stored moves remain, status: “Line complete.” The board stays on that position
- Train again returns to the session start
- Stop turns training off and leaves the board where it is. The session start is forgotten
- Forward, a notation move click, a repertoire row click, an explorer move, an engine line played onto the board, and a null move do nothing while training is on
- Back steps one move and stays in training
- Switching boards or opening a PGN turns training off
- An unapplied Setup Board draft is ignored, same as the Repertoire panel
- View → Panels still opens the Repertoire tab. Training does not add a dock tab

## Move check

A pure function takes the tree, the current path, and a UCI.

- If `repertoireMoves` is empty, the result is complete
- If the UCI matches a listed move, the result is that move’s path
- Otherwise the result is refused

The accepted path is one `repertoireMoves` already returned, so the node is already in the tree. If that path is no longer in the tree, the result is refused.

The store applies an accepted path with the existing path navigation. It does not call the function that adds a move. A refused move does not change the path.

## Session state

Training state lives in the studio store and is not saved:

- training on or off
- the session start path, or nothing when training is off

Train stores the current path and turns training on. Train again, while training is on, sets the path back to that start and clears the status. Stop turns training off and clears the start.

Opening a PGN onto the board, or changing the active board, turns training off.

## Out of scope

- The app playing a reply
- Showing the stored moves after a miss
- A score, a streak, or a timer
- Training any file other than the active board
- Adding, deleting, or saving moves from training

## Tests

A pure function covers:

- A stored UCI returns that move’s path
- An unknown UCI is refused
- A stored Black move is accepted the same way as a stored White move
- When several moves are stored, each of them is accepted
- No stored moves is complete
- The tree is unchanged by the check
