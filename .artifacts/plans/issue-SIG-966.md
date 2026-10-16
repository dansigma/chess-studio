# SIG-966 — Game Review: keep partial results and resume after cancel or engine failure

## Goal

A cancelled or engine-failed Game Review keeps the positions already scored and lets the
user resume from where it stopped instead of re-scoring from zero. After a Deep review
cancelled at ~50%, the panel offers "Resume review 24/48", resuming scores only the
remaining positions (verified: no `analyze` calls for the first half), ETA reflects the new
run's pace, and editing the game discards the partial. Done = `npm test`, `npm run lint`,
`npx tsc --noEmit` all green plus the live resume check below.

## Scope

**In:**
- `ReviewInput.resume` + `partial` payload on `cancelled`/`failed` outcomes (`review-engine.ts`).
- One fresh-search retry per position before counting a miss.
- Hook partial state keyed by `cacheKey`, resume vs discard, new-run-pace ETA, read-only
  tier preview (`useGameReview.ts`).
- Panel buttons "Resume review D/T" / "Review again" + EN/PT-BR strings
  (`ReviewPanel.tsx`, `review-strings.ts` + test).
- Resume-equivalence and partial-payload tests (`review-engine.test.ts`).

**Out (per issue):** persisting partials across reloads (memory-only; SIG-965 persistence
covers finished reviews only), parallel analysis, optional live tier preview beyond a
read-only graded prefix (req. 5 stays minimal — see Phase 3).

**Considered and rejected:**
- Persisting partials to IndexedDB: explicitly out of scope; adds schema/migration questions
  for data that is cheap to reproduce via resume.
- Incremental `moveWeights` per position: weights are a whole-line volatility function;
  resumed runs re-derive weights/rows from the full score array after completion, exactly
  like a fresh run. Preview grading reuses the same pure functions on the scored prefix.
- Retry inside `lease-engine.ts`: `MAX_RESTARTS` already covers cut-short searches *within*
  one `analyze`; the new retry is one extra `analyze(fresh:true)` at the `runReview` level
  when it resolves null. Lease/cancelled semantics untouched.

## Phase 1 — Engine: resume input, partial output, one retry

File: `chess-studio/src/chess/review-engine.ts`.

- Add to `ReviewInput`: `resume?: Array<PositionScore | null>` (position-indexed, same
  length as `fens`; entries with `depth` mismatching the preset depth are rescored).
  Mismatched-length `resume` is ignored defensively (treated as fresh).
- Change `ReviewOutcome` to
  `{ status: "done"; rows } | { status: "cancelled"; partial } | { status: "failed"; partial }`
  where `partial: Array<PositionScore | null>` is position-indexed (holes = unscored).
- Scoring loop: for each index, if `resume[index]` is present and depth-matches, reuse it
  with **no engine call**; else `analyze(fen, { depth, lines: REVIEW_LINES, timeoutMs:
  POSITION_TIMEOUT_MS, fresh: true, legalMoves })`, and on `null` do exactly one more
  `analyze` with the same options before counting a miss. `misses >=
  MAX_CONSECUTIVE_MISSES` → `failed` (unchanged threshold); `cancelled()` checks stay where
  they are, now returning `{ status: "cancelled", partial: scores-so-far }`.
- Grading section (book flags, `dividePhases`, `moveWeights`, sacrifice recheck) unchanged
  and still runs only on the `done` path with the complete score array.
- `onProgress`: `done` remains the absolute position index, `elapsedMs` the current run's
  elapsed — so a resumed run's ETA is naturally paced by the new run (hook passes it
  through; see Phase 2).

Tests (`src/chess/review-engine.test.ts`, existing `fakeEngine`/`flat` helpers):
- Cancel returns `partial` with the scores collected before cancel (extend the existing
  "cancelling stops the engine calls" test: assert `partial.length === total`, first entry
  scored, rest null).
- `failed` returns `partial` (dead-engine script: assert partial present).
- Resume-equivalence: full run rows `deepEqual` resumed run rows (resume = partial from a
  cancelled run at ~half; assert `engine.log` contains no call for already-scored FENs).
- Retry: script returning null once then a value for the same FEN still yields `done`
  with that position scored (miss counter not incremented).
- Depth mismatch: resume entry with stale `depth` is rescored.

Verify: `npm test -- src/chess/review-engine.test.ts` (repo script resolves TS via
`scripts/test-resolve.mjs`; run from `chess-studio/`).

## Phase 2 — Hook: partial state, resume/discard, ETA, preview

File: `chess-studio/src/studio/review/useGameReview.ts`.

- Keep `partial: Array<PositionScore | null> | null` in a ref keyed by `cacheKey`
  (same key that already covers fens+ucis+preset+engineBuild: line/preset/engine change
  discards it — the key-change branch that resets `IDLE_PROGRESS` also clears the ref;
  tree edits that change the line miss the key, satisfying "edit game discards partial").
- On `cancelled`/`failed` outcomes, store `outcome.partial` in the ref (do **not** touch
  `setCachedReview`/`persistReview` — partials never persist). Keep existing
  `cancelled`/`failed` flags and progress as-is.
- Expose: `resumable: boolean` (partial has ≥1 scored entry and no `rows`),
  `partialDone/total` counts, `resume()` (sets `running` with mode resume; passes
  `resume: ref.current` into `runReview`; `onProgress` passes engine values straight
  through so `estimateRemainingMs` reflects new-run pace), and keep `start()` as
  destructive fresh start (clears the partial ref). Cancel during a resumed run keeps the
  merged partial (ref updated from the new outcome).
- Read-only preview: derive preview rows by running the existing pure grading path over
  the scored prefix only (positions where before+after both scored); do **not** run the
  sacrifice recheck (no engine calls outside a run) and do **not** set cache/persisted
  state. Return as `previewRows: ReviewMoveRow[] | null` (same shape as `rows`, mapped
  through `getNodeAt` like `rows`).
- `stopped`/lease cleanup and `lineRef` handling unchanged.

Tests: hook has no dedicated test file; cover via engine tests (Phase 1) + a lightweight
`useGameReview` render test only if the existing suite shows a hook-test pattern worth
following — otherwise verify manually (Phase 4 live check). Do not invent a new test
harness grain.

## Phase 3 — Panel + strings: Resume button, preview, copy

Files: `chess-studio/src/studio/ReviewPanel.tsx`, `src/chess/review-strings.ts`,
`src/chess/review-strings.test.ts`.

- Strings follow the file's existing grain: `REVIEW_STRING_KEYS` entries + EN/PT-BR table
  rows + whole-sentence template functions (never concatenation):
  - `panel.resumeReview`: "Resume review" / "Retomar análise" — rendered with done/total
    via a template `reviewResumeText(locale, { done, total })` (same shape as
    `reviewProgressText`).
  - Reuse `panel.reviewAgain` ("Review again" / "Analisar novamente") as the destructive
    fresh-start affordance next to it.
- Panel, when `resumable && !running`: primary button "Resume review D/T" (`resume()`),
  secondary/link "Review again" (`start()`, discards partial); failed/cancelled helper
  text keeps existing `reviewFailedText`/`reviewCancelledText` (done/total already shown).
  While a resumed run is `running`, progress bar + ETA render unchanged (values already
  absolute done/total + new-run elapsed).
- Preview: when `previewRows` (and no `rows`), render the existing `ReviewReportCard`
  read-only (no `onSelectMoment` play affordance change — report display only) with a
  small note that the review is incomplete (new string `panel.partialNote`: "Partial
  review — resume to complete." / "Análise parcial — retome para concluir.").
- Cancelled-with-rows case (`cancelled && rows`) keeps current behavior.

Tests: extend `review-strings.test.ts` with the two new templates (EN + PT-BR), mirroring
the existing `reviewCancelledText` assertions.

## Phase 4 — Verification

- `npm test` (full suite, from `chess-studio/`) — new + existing review tests green.
- `npm run lint`, `npx tsc --noEmit` — zero errors.
- Live check (needs engine): start a Deep review on a ~48-position game, cancel at ~50%,
  assert panel shows "Resume review 24/48" + partial report preview, resume, assert no
  re-scoring of the first half (engine call log / network-quiet) and a completed report
  identical in shape to a fresh run. Edit the game (add/remove a move) → partial gone.
- Confirm no changes to `lease-engine.ts`, `review-cache.ts`, `review-store.ts`,
  persistence behavior, or `MAX_CONSECUTIVE_MISSES`.

## Risks

- **Preview grading divergence:** prefix-graded tiers could differ from final full-line
  weights (volatility is whole-line). Mitigation: preview is explicitly labelled partial
  and read-only; final run re-grades everything from the full array.
- **Stale-depth resume entries:** preset change alters `cacheKey`, so cross-depth resume
  shouldn't normally occur; the depth check is belt-and-braces. If it triggers
  unexpectedly, the symptom is extra engine calls, never wrong scores.
- **ETA jump on resume:** first seconds of a resumed run have tiny `elapsedMs`; the panel
  already shows "estimating…" until measurable — acceptable, no special-casing.
- **`failed` partial with trailing holes:** preview grades only the fully-scored prefix;
  trailing nulls are skipped by the existing `!before || !after → continue` guard.

## Assumptions

- Triage reading confirmed against current code (fb19bf1): `runReview` returns bare
  `cancelled`/`failed` (`review-engine.ts:172-186`); hook resets to `IDLE_PROGRESS` on
  key change (`useGameReview.ts:100-109`); no `resume`/`partial` references exist.
- `PositionScore` (incl. optional `depth`) is the resume unit; depth-mismatch → rescore.
- Same-`cacheKey` reuse is sufficient invalidation (fens+ucis+preset+engineBuild+schema).
- `start()` = destructive fresh start; no confirmation dialog (matches current UX grain).
- One retry = one extra `analyze(fresh:true)` at `runReview` level, not a lease change.
- `reviewCancelledText`/`reviewFailedText` copy unchanged; new strings follow
  `review-strings.ts` table+template pattern with EN/PT-BR only (file has no other locales).
- Req. 5 (live tier preview) is satisfied minimally by the read-only partial report; a
  richer live-tier UI is deferred.

## Open questions

- None blocking. Copy above follows existing EN/PT-BR voice; product can wordsmith the
  two new strings at review time.
