# SIG-1120 — Plan: revoke public read access to `courses.chapters`

## Goal

After this work, no client using the anon/authenticated key can read `courses.chapters` in any way (direct `select chapters`, `select *`), while every other `courses` column remains publicly readable for published rows, the service role still reads `chapters` (authoring/publish flows keep working), and the course catalog, course page, and lesson page render from the safe read path. "Done" is verifiable: a SQL behavior test proves the grant split for both public roles, a source-scan test prevents regression, the contract test pins the migration text, and the full verification suite passes.

## Scope

**In:**
- Switch every public/session-client `from("courses")` read off `chapters` (and off `*`) to a named column list; introduce the `outline`-based read path (`COURSE_SELECT_FIELDS` without `chapters`, `CourseRow`/`toCourse` from outline, `contentLoaded: false` marker) per SIG-1119 requirements §1.
- New gated-content data layer per absorbed SIG-1118 scope (it lives in SIG-1052 now): `outline` backfill, `course_content` table, `course_outline()` helper, sync trigger, `can_access_course()`, `course_content` read policy.
- Column-grant revocation migration, SQL grant behavior test, rls-contract text checks, source-scan regression test, CI wiring.
- `database.types.ts` regeneration/update for new tables/columns.

**Explicitly out:**
- Checkout/subscription/purchase flows (SIG-1121, SIG-1122).
- Any change to row-level policies on `courses` (they stay as-is; only grants change).
- Removing the `chapters` column itself — it stays as the authoring write target and service-role read source.
- Product/copy decisions (tier labels, CTA destinations) beyond what SIG-1119 already specifies.

## Precondition check (do first, blocks everything)

1. Confirm on the branch whether `supabase/migrations/20261021290000_course_content_gate.sql` (or equivalent) and the SIG-1119 app changes (`outline` reads, `use-course-content`, `LockedLesson`, locked CTA) exist. At plan time (2026-10-29) **neither exists**: no `outline` column, no `course_content` table, no `can_access_course` function anywhere in `supabase/`; `COURSE_SELECT_FIELDS` (`src/courses/catalog.ts:158`) still selects `chapters`; SIG-1119 and the SIG-1052 gate portion are both Backlog.
2. If the precondition is still unmet, **do not implement the revocation migration in this branch**. Two options, in preference order:
   - **Option A (preferred): absorb the prerequisites into this branch** — implement Phases 1–2 below (they are exactly the SIG-1119-§1 + SIG-1052-gate scope restated as build steps), then Phase 3. This matches the dependency note that the gate must be implemented before the app switch, and the app switch before the grant revocation.
   - **Option B:** stop and return the branch unmodified with the precondition failure documented (missing gate migration + missing SIG-1119 app switch), so the work can be re-sequenced. Do not leave a half-applied revocation that breaks the current app.

## Phases

### Phase 0 — Column inventory (source of truth for the grant list)
- Enumerate the real `courses` columns by reading, in order: `20260928170000_courses.sql` (base: `id, slug, title, summary, color, chapters, created_by, updated_at`), `20260928200000_course_media.sql` (`cover_url, video_url`), `20260928220000_course_theme.sql` (`theme`), `20261007120000_sig861_rls_indexes_drafts.sql` (`published_at`), `20261021270000_course_status_and_tier.sql` (`status, review_note, access_tier, price_cents, currency, author_display_name`), plus whatever the Phase 1 gate migration adds (`outline`).
- Expected complete list (verify, do not assume): `id, slug, title, summary, color, theme, cover_url, video_url, published_at, status, review_note, access_tier, price_cents, currency, author_display_name, outline, created_by, updated_at` — everything except `chapters`.
- **Test/proof:** the list is written into the migration file itself; any drift is caught by the Phase 4 SQL test (select of every granted column must succeed).

### Phase 1 — Gated-content data layer (absorbed SIG-1052/SIG-1118 scope; skip if already on branch)
New migration `supabase/migrations/20261021290000_course_content_gate.sql` (use this exact timestamp unless it collides; if it collides, use the next free `20261021HHMMSS` slot **before** `20261021300000`):
- `alter table public.courses add column if not exists outline jsonb not null default '[]'`.
- `create table public.course_content (course_id uuid primary key references public.courses on delete cascade, chapters jsonb not null default '[]', updated_at timestamptz not null default now())`; `alter table ... enable row level security`; **no** insert/update/delete policies; `grant select on public.course_content to anon, authenticated`.
- `private.course_outline(chapters jsonb) returns jsonb`, `immutable`, same chapters with each variation reduced to `{id, title}`.
- Backfill: `update public.courses set outline = private.course_outline(chapters)` and insert matching `course_content` rows from `courses.chapters`.
- `after insert or update of chapters` trigger on `courses` keeping `outline` + `course_content` in sync.
- `public.can_access_course(p_course_id uuid) returns boolean`, `security definer`, `stable`, `set search_path = ''`, `grant execute ... to anon, authenticated`. Semantics: true when caller owns the course (`created_by = auth.uid()`), or caller's `profiles.role = 'admin'`, or caller holds a `paid` purchase of that course with status not in (`refunded`, `chargeback`), or the course is `published` and (`access_tier = 'free'`, or `premium` with an active subscription: `status <> 'canceled'` and `current_period_end > now() - interval '3 days'`, or canceled-but-in-period: `current_period_end > now()`). Otherwise false. Free-course buyer transparency: a purchase grants access regardless of later tier changes (no tier check on the purchase path); a refund (`refunded`/`chargeback`) removes it.
- Policy `course_content_select` on `course_content` for `anon, authenticated`: `using (public.can_access_course(course_id))`.
- **Conventions to follow:** `security invoker` + empty `search_path` on triggers (see `courses_sync_published_at` in `20261021270000_course_status_and_tier.sql:66-79`); `(select auth.uid())` wrapping (see `rls-contract.test.ts:13-17`); subscriptions/purchases tables come from SIG-1051 — read their real column names from the branch before writing the function; DB role in `profiles.role` from SIG-1049/SIG-1060.
- **Tests:** new `supabase/tests/can_access_course.sql` (rollback-wrapped, `ON_ERROR_STOP=1`): seeds users/courses of every tier+status, subscriptions, purchases; asserts the full matrix via `set local role` + `set_config('request.jwt.claims', ...)` (anonymous, student, active subscriber, canceled-in-period, expired, buyer, refunded buyer, owner, admin) plus both transparency rules (tier change keeps buyer access; refund removes it). New `rls-contract.test.ts` describe block: RLS on `course_content`, no write policy, function is `security definer` with empty `search_path`, trigger exists. Regenerate/update `src/lib/supabase/database.types.ts`.
- **Verify:** `supabase start`, then `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/can_access_course.sql` (paste output in PR; also run once with the function forced to `true` to prove the test can fail).

### Phase 2 — App reads off `chapters` (SIG-1119 §1; skip files already converted)
- `src/courses/catalog.ts`: `COURSE_SELECT_FIELDS` swaps `chapters` → `outline`; `CourseRow` gains `outline: Json` (drop `chapters`); `toCourse` builds chapters from the outline via `parseChapters` with each variation's `pgn: ""` and sets new optional `Course.contentLoaded: false`. Add `contentLoaded?: boolean` to `src/courses/types.ts` `Course`.
- Public reads that must use the new list (all currently use `COURSE_SELECT_FIELDS`, verified 2026-10-29): `app/courses/(catalog)/page.tsx:37`, `app/courses/[slug]/page.tsx:22`, `app/courses/[slug]/[variationId]/page.tsx:23`, `src/courses/store.ts:176` (`fetchPublishedCourses`) and `:212` (`fetchAuthorCourses` — owner/admin editing reads editable chapters via `course_content`, not `courses.chapters`). `app/courses/[slug]/page.tsx:47` selects `"slug"` only — leave alone.
- Service-role reads in `src/courses/publish.ts` (`gate.admin.from("courses")...`, lines ~257–673) stay untouched — allowlisted in the Phase 5 scan.
- **Tests:** `toCourse` from an outline row (variations get `pgn: ""`, `contentLoaded: false`); seed-course path unaffected (builtin courses bypass Supabase).
- **Verify:** `npm test`, `npx tsc --noEmit`.

### Phase 3 — Revocation migration (the core of SIG-1120; only after Phases 1–2)
New `supabase/migrations/20261021300000_courses_hide_chapters.sql`:
```sql
revoke select on public.courses from anon, authenticated;
grant select (id, slug, title, summary, color, theme, cover_url, video_url, published_at, status, review_note, access_tier, price_cents, currency, author_display_name, outline, created_by, updated_at)
  on public.courses to anon, authenticated;
```
- Build the column list from the Phase 0 inventory (every current column except `chapters`); keep the timestamp `20261021300000` so it sorts after the gate migration.
- Idempotency note: `revoke`/`grant` of a non-existent privilege warns but does not fail; no `if exists` variant is needed. Do **not** touch policies, triggers, or defaults in this file.
- Alternative considered and rejected: row-policy rewrite (e.g. `using (false)` for `chapters`) — not possible per-column in Postgres RLS; column grants are the taken decision, do not reopen.

### Phase 4 — SQL grant behavior test + CI
New `supabase/tests/courses_column_grants.sql` (rollback-wrapped like `supabase/tests/folder_cycles.sql`):
- As `anon` and as `authenticated`: `select chapters from public.courses` must fail with `insufficient_privilege` (assert via `do $$ ... exception when insufficient_privilege` blocks, raising if the select succeeds); `select id, title, outline, <every other granted column> from public.courses` over published rows must succeed.
- Service-role (or table owner) path: `chapters` readable (run as the default psql user without role switching).
- Wire into CI `migrations` job in `.github/workflows/ci.yml` next to the folder-cycles step: another `-v ON_ERROR_STOP=1 -f supabase/tests/courses_column_grants.sql` invocation.
- **Verify:** `supabase start` + both `psql` files; paste the grant-test output in the PR.

### Phase 5 — Contract + source-scan regression tests
- `src/lib/supabase/rls-contract.test.ts`: new describe block reading `20261021300000_courses_hide_chapters.sql`, asserting the `grant select (...)` list contains every public column and does **not** contain `chapters` (token-level check, e.g. split the parenthesized list and assert `!cols.includes("chapters")` plus presence of `outline`), and that a bare `grant select on public.courses` (whole-table) no longer appears for anon/authenticated outside historical files.
- New `src/courses/no-public-chapters.test.ts`: walks `src/` and `app/`, finds `.from("courses")` call sites, pairs each with its following `.select(...)` argument (same-file scan, a few lines of lookahead is enough at current call shapes), and fails if any non-allowlisted file selects `*` or a list containing the `chapters` token. Allowlist: `src/courses/publish.ts` (service-role `gate.admin` reads) — match on `gate.admin.from("courses")`, not on filename alone if cheap to do. Keep the scanner simple (regex/string scan, no AST); document the allowlist reason in a comment.
- **Verify:** `npm test` (including a negative check: temporarily re-add `chapters` to a select and confirm the scan test fails, then revert).

### Phase 6 — Full verification + PR evidence
- Run: `npm test` · `npm run lint` · `npx tsc --noEmit` · `npm run build` · `npx playwright test` · `supabase start` + both `psql` tests.
- PR must contain: the grant-test `psql` output, the negative scan-test check note, and a note that catalog/course/lesson/authoring screens were exercised against a migrated DB (e2e + manual check per acceptance).
- **Do not remove or skip any test** (acceptance criterion). Ops sequencing (manual, not in code): the SIG-1119 app release deploys and is confirmed healthy in production (course pages + lessons load) **before** this migration is applied — call this out in the PR description.

## Risks
- **Doing Phase 3 before Phases 1–2 breaks the app**: any surviving `chapters`/`*` public read fails with permission denied after the grant change. Mitigation: Phase 2 first + Phase 5 scan gate.
- **Column-list drift**: a later migration adding a `courses` column after this plan was written would be excluded from the grant list, breaking reads of that column. Mitigation: Phase 0 re-inventory at build time; the Phase 4 test selects every granted column so a missing column surfaces immediately.
- **Future `select("*")` on `courses` from public code**: fails closed at runtime. Mitigation: Phase 5 scan test.
- **`outline`/gate tables missing at build time** (SIG-1051/1050/1060 dependencies of the absorbed gate scope): Phase 1 must be built against the real tables on the branch; if `subscriptions`/`course_purchases` shapes differ from the issue text, follow the branch and record the deviation.
- **Trigger sync gap**: the `chapters → outline/course_content` trigger only fires on `insert/update of chapters`; out-of-band writes bypassing it (none known) would desync. Acceptable: app writes go through `publish.ts` service-role path.

## Assumptions
- Repository guard passed: remote `https://github.com/dansigma/chess-studio.git`, branch `factory/linear-sig-1120`.
- Triage claims re-verified 2026-10-29: `COURSE_SELECT_FIELDS` still contains `chapters`; all 5 public `from("courses")` sites identified; `publish.ts` reads are all `gate.admin` (service role); no `select("*")` on `courses` in `src`/`app` (the two `select("*")` hits are `load-games.ts` and `StudioShell.tsx`, unrelated tables); no `outline`/`course_content`/`can_access_course` in the tree; CI `migrations` job runs `supabase start` + `psql folder_cycles.sql` with an RLS-policy check the new tables must also satisfy (public tables need ≥1 policy — `course_content` gets its select policy in Phase 1).
- Migration timestamps: `20261021300000` is free (latest `courses`-adjacent migration on branch is `20261021270000`; later ones are unrelated tables). If the branch gains a colliding migration, rename preserving order: gate < hide_chapters, both after all `courses`-column-adding migrations.
- If SIG-1119 / SIG-1052-gate land on the branch before this build starts, skip Phases 1–2 (verify by searching for `outline` in `supabase/` and `src/courses/catalog.ts`) and go straight to Phase 0+3.
- Test runner is `npm test` (node:test, see `rls-contract.test.ts` imports); source-scan test follows the existing `node:test` + `node:assert/strict` style.

## Open questions
None — sequencing, scope, and design decisions are taken in the issue or resolved above; the only human step is the manual ops ordering (SIG-1119 release before migration apply), which is a deployment action, not a plan question.
