# SIG-1096 — Plan: save mistake exercises + SRS state on review finish

## Goal

When a game review finishes, the user's mistakes become persistent, scheduled
exercises: `extractMistakeExercises` output is merged into a per-user map of
`{ exercise, srs }` kept in a new `mistake_exercises` Supabase row (account)
with a browser-local copy for guests, following the exact repertoire/puzzle
progress pattern. The review flow itself is untouched on failure (log-only).
Done means: migration applied cleanly, store module + tests green, hook seam
wired to board orientation, `ReviewPanel` passing it, types + contract test
extended, and the full verification suite passing.

## Scope

In:
- `supabase/migrations/20261021230000_mistake_exercises.sql` (new table,
  RLS, grants, size check — copy of the repertoire/puzzle migrations).
- `src/lib/mistake-exercises-store.ts` (new) + `src/lib/mistake-exercises-store.test.ts`
  (new): `StoredExercise`, `hydrateExercises`, `saveExercises`,
  `mergeNewExercises`, `recordAttempt`, `dueExercises`, normalize/owner
  helpers, modeled on `src/lib/repertoire-progress.ts`.
- `src/lib/local-cache.ts`: `MISTAKE_EXERCISES_KEY` +
  `MISTAKE_EXERCISES_OWNER_KEY`, appended to `USER_LOCAL_CACHE_KEYS`.
- `src/studio/review/useGameReview.ts`: `captureMistakes(...)` after
  `persistReview` in the fresh-run completion branch only; `[exercises]`
  prefix, never throws.
- `src/studio/ReviewPanel.tsx`: pass `board.orientation` → `userSide`
  (`"white"`→`"w"`, `"black"`→`"b"`) and current user id into the hook.
- `src/lib/supabase/database.types.ts`: `mistake_exercises` table rows.
- `src/lib/supabase/rls-contract.test.ts`: new `describe` for the migration
  (same shape as the sig-1088/1090/1042 blocks).
- Store hydration call site (boards slice or equivalent, where
  `hydrateRepertoireProgress` is called with `get().user?.id`) so exercises
  hydrate on account change like repertoire progress does.

Out (per issue):
- Practice mode (SIG-1097), explanations/motif stats (SIG-1098), merging a
  guest's exercises into a new account.

## Phases

### Phase 1 — Migration + types + contract test
Changes:
- New `supabase/migrations/20261021230000_mistake_exercises.sql`, copied
  from `20261013120000_repertoire_progress.sql` with table/policy/constraint
  names swapped to `mistake_exercises*`:
  `user_id uuid PK → auth.users cascade`, `data jsonb default '{}'`,
  `updated_at`, own-row select/insert/update policies using
  `(select auth.uid())`, `grant select, insert, update … to authenticated`,
  `check (pg_column_size(data) < 262144)`.
- `database.types.ts`: add `mistake_exercises` Row/Insert/Update block
  mirroring `repertoire_progress`.
- `rls-contract.test.ts`: new `describe("sig-1096 mistake_exercises
  migration")` asserting table creation, RLS enable, the three own-row
  policies, wrapped auth checks (no bare `auth.uid()`), authenticated-only
  grants, and the size constraint.
Tests: the new contract-test block itself.
Verify: `node --experimental-test-module-mocks --import
./scripts/test-resolve.mjs --test "src/lib/supabase/rls-contract.test.ts"`.
Considered alternative: reusing `repertoire_progress` table with a
namespaced key — rejected: issue decides one row per user per feature (do
not reopen), and separate tables keep the 256 KB cap independent.

### Phase 2 — Store module + local keys + unit tests
Changes:
- `local-cache.ts`: add `MISTAKE_EXERCISES_KEY = "xd-mistake-exercises"`,
  `MISTAKE_EXERCISES_OWNER_KEY`, append both to `USER_LOCAL_CACHE_KEYS`.
- New `src/lib/mistake-exercises-store.ts` modeled on
  `repertoire-progress.ts` (module-level account user id + on-account flag,
  owner read/write/isOwned, normalize, local read/write, hydrate, save):
  - `type StoredExercise = { exercise: MistakeExercise; srs: SpacedRepetitionItem | null }`;
    map type `Record<string, StoredExercise>`.
  - `normalizeExercises(raw)`: drop non-object entries, keep `exercise`
    fields as-is (trust SIG-1041 shape), normalize `srs` with the same
    clamps as `normalizeRepertoireProgress` (or null).
  - `mergeNewExercises(existing, incoming, max = 300)`: new keys added with
    `srs: null`; existing keys keep their schedule (never overwritten,
    even if the new exercise payload differs). Over cap: first evict
    entries with `srs` and `intervalDays >= 21`, oldest `lastReviewedAt`
    first, until at/under cap; then if still over, evict oldest overall
    (by `exercise.createdAt`, falling back to `srs.lastReviewedAt`) until
    at cap. New incoming keys are never eviction candidates ahead of old
    ones — add first, then evict oldest-first across the merged map.
  - `recordAttempt(map, key, correct, now)`: `scheduleReview(entry.srs ??
    undefined, correct, now)`; missing key → return map unchanged.
  - `dueExercises(map, now)`: entries with `srs == null` or `isDue(srs,
    now)`, ordered by `dueDate` with null-srs (never attempted) first.
  - `hydrateExercises(userId)` / `saveExercises(map, userId?)`:
    same flow as repertoire (local-first, upsert on miss, merge + conditional
    upsert on hit, owner marker writes, silent remote failure).
Tests (`src/lib/mistake-exercises-store.test.ts`, window-localStorage shim
as in `repertoire-progress.test.ts`):
- Fixture review with 3 user blunders → 3 stored; re-merge of the same
  extraction adds none (idempotent by key).
- `recordAttempt` correct pushes `dueDate` out vs before; incorrect resets
  interval to 1 day (assert via `scheduleReview` semantics).
- 305-entry merge keeps 300, evicting oldest solved ≥21-day first, then
  oldest overall (construct entries with known `lastReviewedAt`/`intervalDays`).
- Guest path: `hydrateExercises(null)` returns local, no Supabase call.
Verify: `npm test -- src/lib/mistake-exercises-store.test.ts` (via the
package `test` script glob), `npm run lint`, `npx tsc --noEmit`.

### Phase 3 — Review-finish seam (`captureMistakes`)
Changes (`src/studio/review/useGameReview.ts`):
- Extend `Options` with `userSide: "w" | "b"` and `userId: string | null`;
  add to `lineRef` so the completion branch reads the latest values.
- New module-scope `captureMistakes({ fens, rows, userSide, userId })`:
  `extractMistakeExercises({ fens, rows, userSide })` → `hydrate`? No —
  use cached local read + `mergeNewExercises` + `saveExercises` (hydrate
  happens at account-change time; the finish path must not do a remote
  read). Wrap in try/catch, `console.warn("[exercises]", …)` on failure.
- Call it fire-and-forget (`void captureMistakes(…)`) after `persistReview`
  in the `outcome.status === "done"` branch (after `setCore`, before/after
  `setFreshRun` — order irrelevant). Do NOT call it on the IndexedDB-restore
  path (`setCore(prev => prev ?? rows)`) or any cached path.
- `src/studio/ReviewPanel.tsx`: pass `userSide: board.orientation ===
  "white" ? "w" : "b"` and `userId: useStudioStore(s => s.user)?.id ?? null`
  (check actual user selector in `studio-store.ts`; boards slice uses
  `state.user?.id`).
Tests: hook-level test is heavy (engine lease); cover via store tests +
  a pure `captureMistakes` extraction test if exported for testing, plus
  the e2e-adjacent check below. At minimum assert no import cycle
  (`tsc` clean) and lint clean.
Considered alternative: hydrating inside `captureMistakes` (remote read on
every finish) — rejected: extra latency on the completion path and race
with the account-change hydrate; local-read + merge + save is what the
spec describes.
Verify: `npx tsc --noEmit`, `npm run lint`.

### Phase 4 — Full verification
- `npm test` (whole suite; acceptance: no test removed or skipped).
- `npm run lint`.
- `npx tsc --noEmit`.
- `npm run build`.
- `npx playwright test e2e/game-review.spec.ts` (review flow unbroken;
  exercises capture is silent so existing assertions must still pass).
- `supabase start` + apply migrations (or `supabase db reset --local` per
  repo convention) to prove the new migration applies cleanly.
- Acceptance mapping: 3-blunder fixture → 3 exercises / re-run adds none
  (Phase 2 test); recordAttempt due-date directions (Phase 2 test); 305 →
  300 eviction order (Phase 2 test).

## Risks
- The hook currently has no user-id prop; if the store's module-level
  account id isn't hydrated yet at review-finish time (e.g. session
  restored mid-review), `saveExercises` falls back to browser-local with
  the owner marker — safe by design, remote syncs on next hydrate. Check:
  Phase 3 wires the same `user?.id` source the boards slice uses.
- `MistakeExercise` shape drift from SIG-1041: store treats `exercise` as
  opaque except `key`/`createdAt`; normalize is defensive (drops malformed
  entries rather than throwing).
- 256 KB cap with 300 full exercises (each carries `bestPv` + FEN): could
  approach the cap for heavy users; the eviction cap of 300 plus the size
  check mirror the decided spec — if the cap trips, upsert fails silently
  and local remains source of truth; note in handoff if observed.
- E2E fake-review path (`isE2eFakeReviewEnabled`) also triggers capture —
  harmless (local-only in CI, unique lines per test avoid key collision),
  but confirm `game-review.spec.ts` still passes.

## Assumptions
- Remote is dansigma/chess-studio (verified: `git -C chess-studio remote
  get-url origin` → `https://github.com/dansigma/chess-studio.git`).
- SIG-1041 merged and stable (`src/chess/mistake-exercises.ts` read;
  `key = "mx:" + fenKey(fen)` is the map key).
- One row per user, 300-cap with the stated eviction order, no guest→account
  merge, orientation-as-user-side: decided in the issue, not reopened.
- `userSide` mapping white→`"w"`, black→`"b"`; matches `ReviewSide`.
- Capture runs only on fresh `done`, never on cached/IndexedDB restore,
  never for partials; failures log `[exercises]` and never break review.
- Contract-test style follows the existing per-migration `describe` blocks
  (read sig-1088/1090/1042 blocks as template).
- `npm test` = node:test with `scripts/test-resolve.mjs` loader; unit tests
  use the Map-backed `window.localStorage` shim (no real Supabase).

## Open questions
None — all material decisions are taken in the issue; remaining choices
are implementer-level (exact helper decomposition, fixture FENs).
