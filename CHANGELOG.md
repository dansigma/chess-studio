# Changelog

## Unreleased

### Game Review (SIG-960)

- **Accuracy values shift slightly.** Player accuracy is now the average of a volatility-weighted mean and a
  harmonic mean (move accuracies floored at 10 in the harmonic part) instead of the plain harmonic mean.
  Per-phase accuracy uses the same model, so figures differ slightly from earlier reviews.
- Every position is analysed with 3 engine lines. New depth presets next to "Review game": Fast (10),
  Standard (12, default) and Deep (16).
- Forced moves (one legal reply) get a `forced` label, are listed apart from the tiers and are excluded from
  accuracy, average loss and tier counts.
- Finished reviews are cached in memory per line, depth preset and engine build, so switching panels or
  re-opening the same line is instant.
- Progress bar with an estimated time and a Cancel button; cancelling keeps the progress made so far.
- Each position is searched from a clean engine hash, so a review is not affected by Show threat or by
  restarted searches.
- **"Great" is assigned far more often.** With three lines always available, a best move that beats the
  second-best line by more than 10 win-chance points is now marked Great; before, that needed the extra
  two-line pass that only ran for sacrifices. Compared on Standard depth against the old pipeline (Morphy's
  Opera Game and Kasparov–Topalov 1999): Great went from 0 to 6 of 33 moves and from 0 to 24 of 87 moves, taken
  mostly from Perfect. A few other moves also change tier (Perfect vs Very good) because searching 3 lines gives
  slightly different depth-12 scores than searching 1.
