# Changelog

## Unreleased

### Fixes

- Starting a review right after cancelling another one could leave the engine stuck, with each position
  waiting out its timeout. The engine client now waits for a stopped search to report before starting the
  next one. If the engine does stop answering, the review stops after a few positions with a message instead
  of grinding through every timeout.

### Game Review explanations (SIG-961)

- New "Why?" block in the Review panel for the move the board is on. It opens by default for Brilliant, Miss,
  Mistake and Blunder and stays collapsed for the rest. Every sentence is backed by the position facts (threats,
  pins, hanging pieces, mates, sacrifices); when nothing can be proven it shows only the engine's view.
- Hovering a sentence highlights the squares involved on the board (transient, never saved to the game);
  sentences about the position before the move briefly show that position.
- The engine's best line is shown as clickable moves and opens as a variation.
- Explanations follow the site language (English / Português do Brasil); fresh installs seed it from the
  browser language until the user picks one (SIG-971).

### Game Review (SIG-960)

- **Accuracy values shift slightly.** Player accuracy is now the average of a volatility-weighted mean and a
  harmonic mean (move accuracies floored at 10 in the harmonic part) instead of the plain harmonic mean.
  Per-phase accuracy uses the same model, so figures differ slightly from earlier reviews.
- Every position is analysed with 3 engine lines. New depth presets next to "Review game": Fast (10),
  Standard (12, default) and Deep (16).
- Forced moves (one legal reply) get a `forced` label, are listed apart from the tiers and are excluded from
  accuracy, average loss and tier counts.
- Finished reviews are cached in memory per line, depth preset and engine build, so switching panels or
  re-opening the same line is instant. They are also persisted in IndexedDB (SIG-965), so a reload,
  a new tab or a deploy no longer discards minutes of analysis; saved reviews show a "Saved review"
  hint and can be cleared via Settings → Game Review.
- Progress bar with an estimated time and a Cancel button; cancelling keeps the progress made so far.
- Each position is searched from a clean engine hash, so a review is not affected by Show threat or by
  restarted searches.
- **"Great" is assigned far more often.** With three lines always available, a best move that beats the
  second-best line by more than 10 win-chance points is now marked Great; before, that needed the extra
  two-line pass that only ran for sacrifices. Compared on Standard depth against the old pipeline (Morphy's
  Opera Game and Kasparov–Topalov 1999): Great went from 0 to 6 of 33 moves and from 0 to 24 of 87 moves, taken
  mostly from Perfect. A few other moves also change tier (Perfect vs Very good) because searching 3 lines gives
  slightly different depth-12 scores than searching 1.
