# SIG-1052 — Record course enrollments and completions (table plus client hook)

## Goal

Per signed-in user and course, the database records when they first opened it
(`first_opened_at`) and when they finished every lesson (`completed_at` once),
so the admin dashboard and coach area can later answer "students and completions
per course". Done means: a fresh database applies the new migration cleanly,
contract tests pin the table's RLS shape, unit tests pin the pure rule and the
fake-client behavior (duplicate enroll tolerated, completion never repeats,
anonymous users trigger no write), course screens behave exactly as before for
anonymous visitors and seed courses, and `npm test`, `npm run lint`,
`npx tsc --noEmit`, `npm run build` are clean.

## Scope

**In:**
- `supabase/migrations/20261021320000_course_enrollments.sql` (new table +
  RLS + grants) and its `rls-contract.test.ts` block + `database.types.ts`
  entry.
- `src/courses/enrollment.ts` (new: `recordEnrollment`, `recordCompletion`,
  `shouldRecordCompletion`, session `Set` guard) + `enrollment.test.ts`.
- `src/courses/CourseView.tsx` + `src/courses/LessonView.tsx`: one
  `recordEnrollment` call per course per browser session, only when signed in
  and content is accessible.
- `src/courses/store.ts`: one `recordCompletion` call from the save path when
  the course reaches 100%.
- Unit tests must run without a browser or Supabase: fake-client
  (`from().insert()/update()` stubs) + pure-function cases, following the
  `use-course-content.test.ts` grain (node:test + node:assert, no DOM).

**Out:** back-filling enrollments for past activity; any statistics/screens
that consume the data (SIG-1123 onward); gated-content work itself (SIG-1118
half already landed: `20261021290000_course_content_gate.sql`, its contract
block, the `can_access_course.sql` matrix, CI steps, type entries —
untouched); seed/builtin course enrollment; server-side RPC (client writes
directly under own-row RLS, same as `course_progress`).

**Design decisions (assumptions):**
- Direct client writes under own-row RLS (insert own row, update own row) —
  same grain as `course_progress` (`20260928170000_courses.sql:31-36`) and
  `repertoire_progress` (`20261013120000_repertoire_progress.sql:7-12`), not a
  security-definer RPC. `recordEnrollment` inserts one row and swallows the
  unique-violation on retry (two views racing, or a strict-mode double effect,
  converge on one row); `recordCompletion` updates `completed_at` only when it
  is still null (set-once, never clears). Both failure-safe: log with an
  `[enrollment]` prefix, never throw — a stats write must not break studying.
- Client needs `course_id` at the completion call site, but
  `saveVariationProgress(variationId, progress)` today only sees the variation
  id, which has no course link in SQL by design. The completion caller must
  identify the course id client-side by scanning the currently loaded course
  chapters (the variation lives in the loaded `Course`), resolving from the
  in-memory progress cache merged with the just-saved value.
- "Accessible" for the enrollment call: on `CourseView`, the page only renders
  for a published/seed course already loaded, so signed-in is the only gate;
  on `LessonView`, enrollment fires only when content is actually readable —
  seed/local courses (no fetch needed) or `useCourseContent` status `ready`.
  A `locked` lesson (access refused) records nothing.
- Calls live in the views via a `useEffect`-driven helper in `enrollment.ts`
  (module-level `Set<courseId>` reset exported for tests), not in
  `use-courses.ts`, so the hook's contract (progress + publisher flags) stays
  untouched. Seed/builtin courses (no `id` in the DB / `builtin: true`) never
  write — the helper returns early.
- Contract tests follow the existing grain: read the migration file as text
  and assert on its contents (same as the gate block at
  `rls-contract.test.ts:543-614`), instead of spinning a database.
- Type entries in `database.types.ts` are hand-added to match the existing
  hand-maintained style (same as the `course_content` block at lines 343-361).

## Phase 1 — Migration + contract block + types

New `supabase/migrations/20261021320000_course_enrollments.sql` (newest
timestamp keeps it last in apply order, after the hide-chapters migration):

```sql
create table if not exists public.course_enrollments (
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  first_opened_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, course_id)
);
create index if not exists course_enrollments_course_id_idx
  on public.course_enrollments (course_id);
alter table public.course_enrollments enable row level security;
create policy "course_enrollments_select_own" on public.course_enrollments
  for select using ((select auth.uid()) = user_id);
create policy "course_enrollments_insert_own" on public.course_enrollments
  for insert with check ((select auth.uid()) = user_id);
create policy "course_enrollments_update_own" on public.course_enrollments
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update on public.course_enrollments to authenticated;
-- No delete policy: completion history is append-only. No anon grants.
```

Notes: wrapped `(select auth.uid())` (the `sig-861` contract at
`rls-contract.test.ts:12-17` rejects bare `auth.uid()`); `if not exists` on
table/index for re-runnable local apply; no delete policy by design.

Contract block in `src/lib/supabase/rls-contract.test.ts` (new
`describe("sig-1052 course enrollments migration")` after the gate block):
reads the new file; asserts table with `primary key (user_id, course_id)`,
`first_opened_at` default `now()`, nullable `completed_at`, the
`course_id` index, RLS enabled, wrapped own-row select/insert/update policies
named `course_enrollments_*_own`, grants to `authenticated` only (no `anon`,
no `service_role` grant), and no delete policy (fail if
`on public.course_enrollments` + `for delete` appears, and fail if any
cross-user policy shape appears — e.g. a `using (true)` line in this file).

Types: add a `course_enrollments` entry to
`src/lib/supabase/database.types.ts` after `course_content` (Row / Insert /
Update with `user_id`, `course_id`, `first_opened_at`, `completed_at: string
| null`), with a `// SIG-1052:` comment matching the neighboring style.

Prove it: `npm test -- src/lib/supabase/rls-contract.test.ts` green (new
block fails first if the table loses RLS or gains a delete/cross-user
policy), `npx tsc --noEmit` clean, and `supabase start` + `supabase migration
list --local` applies the file on a fresh database (CI `migrations` job
covers the rest once pushed).

## Phase 2 — `src/courses/enrollment.ts` + `enrollment.test.ts`

New module, no React imports (callable from views and `store.ts`), following
the `use-course-content.ts` pure-reducer + fake-shape grain. Supabase client
is the injected `createBrowserSupabase()` return, typed through the same
minimal structural shape the store already uses for ungenerated tables
(`store.ts:272-276`), so no generated-type dependency:

- `shouldRecordCompletion(percent: number, alreadyCompleted: boolean): boolean`
  — pure: `percent >= 100 && !alreadyCompleted`. Covers float edges (99.5,
  100) and the never-clear rule.
- `recordEnrollment(supabase, userId: string | null, courseId: string): Promise<void>`
  — no-op when `userId` is null (anonymous) or the pair was already recorded
  this session (module `Set`, keyed `${userId}:${courseId}`); otherwise
  single-row `insert({ user_id, course_id })`, tolerating the duplicate-key
  error (code `23505`) as success (cross-tab/strict-mode race converges).
  Any other error: `console.warn("[enrollment] ...")`, never throw. Marks
  the pair recorded even on tolerated-duplicate so the session fires once.
- `recordCompletion(supabase, userId: string | null, courseId: string): Promise<void>`
  — no-op when `userId` is null; otherwise `update({ completed_at })`
  `.eq("user_id", userId).eq("course_id", courseId).is("completed_at", null)`
  so an existing timestamp is never overwritten. Errors: warn-only, never
  throw.
- `resetEnrollmentSession(): void` — clears the `Set`; used by tests (and only
  tests) since a browser session is the natural scope.

`src/courses/enrollment.test.ts` (node:test + node:assert, fake client with
call log — no network, no DOM):
- `shouldRecordCompletion`: 100/not-completed → true; 99 → false;
  already-completed → false even at 100; 0/empty-course percent → false.
- `recordEnrollment`: null userId → zero client calls; first call inserts
  exactly one row; second call same session → no second insert; `23505` on
  insert → treated as success, still session-marked; other error → warns
  with `[enrollment]` prefix, does not throw.
- `recordCompletion`: null userId → zero calls; sends the update with the
  `completed_at IS NULL` guard; error → warns, does not throw.

Prove it: `npm test -- src/courses/enrollment.test.ts` green; lint + `tsc`
clean.

## Phase 3 — View wiring (`CourseView`, `LessonView`)

Both views already know `signedIn` (from `useCourseData`) and content
readability; add one fire-once effect each, delegating the session guard to
the module:

- `CourseView`: `useEffect(() => { if (signedIn && !course.builtin && course.id)
  void recordEnrollment(supabase, userId, course.id); }, [...])`. The course
  page only renders for a published/seed course, so no extra accessibility
  check. Needs the user id: extend `useCourseData` to also return the
  `user?.id` it already fetches (additive field, existing consumers
  unaffected), or read it from the same `createBrowserSupabase().auth.getUser()`
  call the hook makes. Prefer the hook extension (one auth read, no extra
  round-trip).
- `LessonView`: same call, additionally gated on readability —
  `course.contentLoaded !== false || content.status === "ready"`. A `locked`
  (or `loading`/`error`) lesson records nothing. Seed/local courses
  (`contentLoaded` undefined) record normally when signed in.

Both effects depend on `[signedIn, course.id]` (+ `content.status` in the
lesson view), fire once per session via the module `Set`, and are safe under
StrictMode double-invoke (second call is a session no-op, and the DB insert
tolerates `23505` anyway). Anonymous visitors and built-in seed courses take
the early-return path — zero client calls, screens render exactly as before.

Prove it: existing suites (`store.test.ts`, `catalog`/`locked-cta`/
`no-public-chapters` tests) still pass — no behavior change for anon/seed;
`npm run lint`, `npx tsc --noEmit` clean. (No new component tests: no DOM
harness in this repo's unit setup; the once-per-session + anon-no-write rules
are pinned at the module level in Phase 2.)

## Phase 4 — Completion wiring (`store.ts` save path)

`saveVariationProgress(variationId, progress)` learns only the variation id,
so the course id must be resolved client-side: after the existing upsert
succeeds (skip on `PROGRESS_BROWSER_ONLY`/error — anonymous and failed saves
record nothing), compute the owning course from the caller's loaded course
chapters plus the merged progress (`coursePercent(course, merged)` already
does exactly this math). Concretely: change the signature to accept the
course context the caller already holds — `saveVariationProgress(variationId,
progress, course: Course)` — with `LessonView.persist` passing
`effectiveCourse`. Inside, after a successful save, if
`shouldRecordCompletion(coursePercent(course, mergedProgress), alreadyCompleted)`
then `void recordCompletion(supabase, accountUserId, course.id)`.
Seed/builtin courses (`builtin: true`) skip. Fire-and-forget (`void`, never
awaited) so lesson-step latency is unchanged; warn-only on failure.

Rejected alternative: resolving the course server-side (RPC or a
variation→course lookup table) — heavier, and the client already holds both
inputs; a client-side scan of the loaded chapters is O(lines) and exact.
Rejected alternative: a DB trigger on `course_progress` — impossible, since
`variation_id` has no course link in SQL by design (the issue's core
constraint).

Prove it: `npm test` full suite green (especially `store.test.ts`,
`progress.test.ts`, `lesson.test.ts`); completion fires at 100% and never
clears, pinned by Phase 2 tests; `npm run build` clean.

## Phase 5 — Full verification

Run in order, all green: `npm test` · `npm run lint` · `npx tsc --noEmit` ·
`npm run build` · fresh-database `supabase start` + `supabase migration list
--local` showing `20261021320000` applied (CI `migrations` job re-runs the
gate matrix + trigger check on push). Confirm `database.types.ts` matches the
table shape and the contract test fails if the migration loses RLS or gains
a delete/cross-user policy (mutate-then-revert check locally, or by reading
the assertions).

## Risks

- **Timestamp ordering with the hide-chapters migration:** the new file
  `20261021320000` must stay the newest; creating it with an older timestamp
  would reorder apply. Mitigated by the exact filename above.
- **`saveVariationProgress` signature change:** it is called from
  `LessonView.persist` (and tests, if any reference it). A new required
  param breaks callers — mitigate by making `course` optional and skipping
  completion when absent (progress save itself unchanged).
- **`useCourseData` extension:** additive `userId` field only; no existing
  consumer is touched. If the executor prefers zero hook changes, fall back
  to a local `auth.getUser()` read inside the views.
- **StrictMode double effects / two tabs:** both converge — session `Set`
  plus `23505` tolerance on insert, `IS NULL` guard on update. No double
  rows, no cleared timestamps.
- **Generated-type drift:** `database.types.ts` is hand-maintained here; the
  new entry must mirror the migration exactly or `tsc`/contract tests catch
  it.

## Assumptions

- Triage understanding verified against current code: no
  `course_enrollments` references in the tree; gate half
  (`20261021290000` migration, `can_access_course.sql` matrix,
  `rls-contract.test.ts:543-614`, CI `migrations` job steps, type entries)
  present — enrollment slice only.
- Issue decisions are final: anonymous never counted; completion = 100%
  learned; `completed_at` set once, never cleared; no backfill; no consumer
  screens in this slice.
- Tests run without Supabase/CI locally (`npm test` only); migration apply
  is verified via `supabase start` if available, else CI on push.
- `supabase/migrations/` has no `20261021320000` file, so no rename conflict.

## Open questions

None — all design forks resolved from codebase conventions above.
