# SIG-1113 — Marketplace 2/4 (b): course status transitions in the server actions

## Goal

Coaches can save drafts and submit their own courses for review, and admins can approve (publishes), reject (with a 3–500-char note), or archive — all enforced by one pure transition function used by every course server action, with `CourseAdminErrorKey` failures and `revalidatePath` invalidation exactly on public-visibility changes. Done means: `src/courses/status.ts` with the full transition matrix tested; five new actions (`saveCourseDraft`, `submitCourseForReview`, `approveCourse`, `rejectCourse`, `archiveCourse`) plus `canTransition` + revalidation wired into the existing `publishCourse`/`unpublishCourse`/`removePublishedCourse`; three new i18n error keys (EN+PT-BR); action tests with the fake Supabase client proving coaches can never reach `published`, cannot touch others' courses, and revalidation fires exactly on visibility changes; `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` all green; no test removed or skipped.

## Scope

**In:**
- `src/courses/status.ts` (new, pure) + `src/courses/status.test.ts` (new): `canTransition({ role, isOwner, from, to, hasNote? })`.
- `src/courses/publish.ts`: five new server actions in-file; `canTransition` checks + `revalidatePath` in the three existing actions; extended row selects (`status`, `slug`) for transition checks and old-slug revalidation.
- `src/i18n/course-admin-strings.ts`: three new error keys + EN/PT-BR text (existing alignment test covers them if it iterates the table — verify).
- Test infra (additive only): `src/test-utils/stubs/next-cache.ts` (new) + `next/cache` entry in `scripts/test-resolve.mjs` STUBS; `update`/`delete` chains + awaitable `select().eq()` in `createFakeSupabase` (`src/test-utils/route-test.ts`).
- `src/courses/publish.test.ts` (new): all action-level behavior with mocked Supabase boundaries.

**Out (explicit):** coach authoring screen + tier/price UI (SIG-1114); review queue and badges (SIG-1115); email notifications (not planned); access enforcement/payments; any migration or RLS change (columns from SIG-1050 already exist); any client-component change (`AdminView` keeps working — existing action signatures are untouched).

## Design

**Single file, not split.** The issue allows `publish.ts` or a new `review-actions.ts`. Rejected the split: `publish.ts` has module-level `"use server"`, and Next forbids exporting non-async helpers from such files — the new actions need the private sync `checkedCourse`, which cannot be exported/shared across files without relocating it. Keeping everything in `publish.ts` avoids helper relocation and keeps the diff reviewable (~275 → ~550 lines).

**Pure matrix in `status.ts`, thin enforcement in actions.** `canTransition` returns `{ ok: true } | { ok: false; reason: "not_owner" | "invalid_status_change" | "note_required" }` — the reason strings are exactly the new error-key suffixes, so each action maps denial to `{ key: \`course.admin.error.${reason}\` }` with no second code layer. `CourseStatus` is imported from `./types` (already exists — do not redefine). `Role` from `@/src/lib/auth/roles`.

```ts
// src/courses/status.ts
import type { Role } from "@/src/lib/auth/roles";
import type { CourseStatus } from "./types";

export type TransitionReason = "not_owner" | "invalid_status_change" | "note_required";
export type TransitionCheck = {
  role: Role | null | undefined;
  isOwner: boolean;
  from: CourseStatus;
  to: CourseStatus;
  /** True when a valid (3–500 char, trimmed) review note was supplied. */
  hasNote?: boolean;
};
export function canTransition(check: TransitionCheck): { ok: true } | { ok: false; reason: TransitionReason } {
  const { role, isOwner, from, to, hasNote } = check;
  if (role === "admin") {
    if (to === "rejected" && !hasNote) return { ok: false, reason: "note_required" };
    return { ok: true }; // any change among the five, plus idempotent same-status (republish)
  }
  if (role === "coach" && isOwner) {
    if (to === "draft" && (from === "draft" || from === "rejected")) return { ok: true }; // save
    if (to === "in_review" && (from === "draft" || from === "rejected")) return { ok: true }; // submit
    return { ok: false, reason: "invalid_status_change" };
  }
  if ((role === "coach" || role === "student" || role == null) && !isOwner) {
    return { ok: false, reason: "not_owner" };
  }
  return { ok: false, reason: "invalid_status_change" };
}
```

Notes on the sketch: coaches can never yield `published` (no rule produces it); students/anon are denied everything; a coach non-owner gets `not_owner`, a coach owner attempting a wrong-state change gets `invalid_status_change`. Admin same-status is `ok` so republish-by-`publishCourse` keeps working.

**Gates.** Keep `requirePublisher()` (admin-only), extend its success return with `role: Role`. Add `requireAuthor()` (coach or admin via `canAuthorCourses`): anon → `signinRequired`, student → `cannotPublish` (reused; no new key for "cannot author"). Both return the service client.

**Revalidation rule (uniform, matches acceptance literally).**
- Private helper `revalidateCourse(slug: string, oldSlug?: string)` calls `revalidatePath("/courses")` + `revalidatePath(\`/courses/${slug}\`, "layout")` (+ old slug layout when it differs).
- Status flips (`approve`, `reject`, `submit`, `save`, `publish`, `unpublish`): call it iff `(from === "published") !== (to === "published")` — i.e. exactly when public visibility changes.
- `archiveCourse` and `removePublishedCourse`: always call it (acceptance lists archived/deleted unconditionally; cheap, admin-only).
- Never on plain draft save / submit / reject of non-published rows.

**Action semantics.**
- `saveCourseDraft(input: Course)`: `requireAuthor` → `checkedCourse` validation → read `select("id, created_by, status, slug").eq("id").maybeSingle()`. New row: owner = caller. Existing: non-admin non-owner → `not_owner`; coach on non-`draft`/`rejected` → `invalid_status_change` (via `canTransition` to `draft`); keep `created_by`; keep seed + DB slug-collision pre-checks (same as `publishCourse`). Upsert writes content fields + `status: "draft"`, `published_at: null`, `updated_at`, plus `access_tier`/`price_cents`/`author_display_name` passthrough; `review_note` is **omitted** so a `rejected → draft` save preserves the note ("clears nothing else" — only `status` changes). Missing row on update path is impossible (read-then-write); a vanished row surfaces as `publishFailed`.
- `submitCourseForReview(id)`: `requireAuthor` → `isCourseId` check → read row → coach non-owner → `not_owner`; `canTransition → in_review` denial → `invalid_status_change`; update `{ status: "in_review", updated_at }`. No content re-validation (content is validated on save/publish; approve flips status only).
- `approveCourse(id)`: `requirePublisher` → read row → `canTransition → published` → update `{ status: "published", published_at: now, review_note: null, updated_at }` (stale rejection note is cleared on approve) → revalidate per rule.
- `rejectCourse(id, note)`: `requirePublisher` → trimmed note length 3–500 else `note_required` → `canTransition` with `hasNote: true` → update `{ status: "rejected", review_note: note, published_at: null, updated_at }` → revalidate iff it was published.
- `archiveCourse(id)`: `requirePublisher` → update `{ status: "archived", published_at: null, updated_at }` → always revalidate.
- `publishCourse`: extend existing-row select to `status, slug`; after ownership check, `canTransition({ role, isOwner: superAdmin || created_by === userId, from: existing?.status ?? "draft", to: "published" })` denial → mapped key (unreachable for coaches — gate — but enforced uniformly); after upsert, revalidate per rule + old slug when changed. Content validation and tier-column behavior unchanged (tier passthrough stays in `saveCourseDraft` only; full tier validation is SIG-1114's `validateTierAndPrice`; a DB paid/price mismatch surfaces as `publishFailed` via code 23514).
- `unpublishCourse` / `removePublishedCourse`: extend selects (`status, slug`); `canTransition` check; revalidate (unpublish per rule, delete always).

**New error keys** (exact literals from the issue, intentionally snake_case per issue text despite the table's camelCase trend):
- `course.admin.error.not_owner` — EN "You can only change your own courses." / PT-BR "Você só pode alterar os seus próprios cursos."
- `course.admin.error.invalid_status_change` — EN "This course cannot change status like that." / PT-BR "Este curso não pode mudar de situação dessa forma."
- `course.admin.error.note_required` — EN "A review note of 3 to 500 characters is required." / PT-BR "É necessária uma nota de revisão de 3 a 500 caracteres."

**Test-infra changes (all additive, no existing behavior touched).**
- `src/test-utils/stubs/next-cache.ts` (new, mirror `next-headers.ts` stub style):
  ```ts
  export const revalidateCalls: Array<{ path: string; type?: string }> = [];
  export function revalidatePath(path: string, type?: "page" | "layout"): void {
    revalidateCalls.push({ path, type });
  }
  export function resetRevalidateCalls(): void { revalidateCalls.length = 0; }
  ```
  Register `"next/cache": "src/test-utils/stubs/next-cache.ts"` in `scripts/test-resolve.mjs` STUBS. Production `import { revalidatePath } from "next/cache"` then resolves to the recorder under `node --test` and the real implementation under Next. Tests import the stub path directly to assert calls (no `mock.module` for `next/cache`).
- `createFakeSupabase` extensions in `src/test-utils/route-test.ts`:
  - `update(row)` chain: `{ eq: async (col, val) => { log to calls.update; return { data: [row], error: updateError ?? null }; } }`; add `update: Array<{table,row}>` to `SupabaseCallLog`, `updateError?: unknown` to `FakeTableConfig`.
  - `delete()` chain: `{ eq: () => sameChain, select: async () => { log to calls.deleted; return { data: deletedRows ?? [{ id: "deleted" }], error: deleteError ?? null }; } }`; awaiting the chain directly (super-admin path `delete().eq()`) yields the plain object whose `error` destructures to `undefined` → treated as success, same tolerance the fake already relies on for the slug pre-check. Add `deleted: Array<{table}>` to the log, `deleteError`/`deletedRows` to config.
  - Make the `select().eq()` chain thenable resolving `{ data: selectRows ?? null, error: selectError ?? null }` (add `selectRows?: unknown[]` to config) so the slug-collision DB path is testable; default `null` preserves today's tolerance (`?? []` → no collision).
- `publish.test.ts` mocking follows the `app/admin/users/actions.test.ts` holder pattern: `mock.module` once each for `@/src/lib/supabase/server.ts` and `@/src/lib/supabase/admin.ts` with per-test holder objects; server fake = `createFakeSupabase({ tables: { profiles: … }, auth: { getUser } })`; service fake = `createFakeSupabase({ tables: { courses: … } })` (extended). Where multi-read differentiation on one table is needed, script `maybeSingle` per test (each action performs exactly one `maybeSingle` read on `courses`; the slug pre-check uses the thenable `selectRows`).

## Phases

### Phase 1 — Pure transition matrix (`src/courses/status.ts` + test)
- Create `status.ts` per the sketch above (import `CourseStatus` from `./types`, `Role` from `@/src/lib/auth/roles`; no `next/cache`, no Supabase — stays unit-testable with zero mocks).
- Create `src/courses/status.test.ts`: programmatic full matrix (roles `admin|coach|student|null` × owner × 5×5) against explicit expected-allow sets + named cases: coach `draft→in_review`/`rejected→in_review` ok; coach save (`draft→draft`, `rejected→draft`) ok; coach `→published` denied from every state; coach non-owner everything denied (`not_owner`); student/null everything denied; admin all 25 + `rejected` without note → `note_required`, with note → ok; admin same-status ok.
- Verify: `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test src/courses/status.test.ts`; `npx tsc --noEmit`.

### Phase 2 — Error keys (`src/i18n/course-admin-strings.ts`)
- Append the three keys to `COURSE_ADMIN_STRING_KEYS` and both `EN`/`PT_BR` tables with the texts above. Check `src/i18n/course-admin-strings.test.ts` iterates the table (per SIG-1072 plan it asserts every key renders) — new keys are then covered automatically; if it lists keys explicitly, extend it (assertions changed/added, none removed).
- Verify: `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test src/i18n/course-admin-strings.test.ts`; `npx tsc --noEmit` (missing PT-BR fails typecheck by design).

### Phase 3 — Test infra (stub + fake extension)
- Add `src/test-utils/stubs/next-cache.ts`, register in `scripts/test-resolve.mjs` STUBS, extend `createFakeSupabase` per the design (update/delete/thenable-select + call-log fields + config fields). JSDoc on the fake updated to name the new chains.
- Verify: `npx tsc --noEmit`; full `npm test` passes with zero regressions (infra is additive — any failure here is a real break).

### Phase 4 — Server actions (`src/courses/publish.ts`)
- Import `revalidatePath` from `next/cache`, `canTransition` from `./status`; add private `revalidateCourse(slug, oldSlug?)`; extend `requirePublisher` success with `role`; add `requireAuthor`; implement the five actions and the `publish`/`unpublish`/`remove` integrations exactly per "Action semantics" above. No signature change to existing exports; no client file touched.
- Before pushing, re-run the repository guard (`git rev-parse --show-toplevel`, `git remote get-url origin` → must be `dansigma/chess-studio`).
- Verify: `npx tsc --noEmit`; `npm run lint`.

### Phase 5 — Action tests (`src/courses/publish.test.ts`) + full gates
- Tests (each resets holders + `resetRevalidateCalls`):
  1. Coach `publishCourse`/`approveCourse`/`rejectCourse`/`archiveCourse` → `cannotPublish`, zero service writes.
  2. Coach `saveCourseDraft` new course → ok, upsert `status: "draft"`, `created_by` = coach, no revalidate.
  3. Coach saves own `rejected` course → upsert `status: "draft"`, upsert row carries no `review_note` key (nothing else cleared), no revalidate.
  4. Coach saves another coach's course → `not_owner`, no write. Coach saves own `in_review` course → `invalid_status_change`, no write.
  5. Coach submits own `draft`/`rejected` → update `status: "in_review"`, no revalidate. Coach submits other's → `not_owner`. Coach submits own `in_review` → `invalid_status_change`.
  6. Coach can never reach `published`: full-matrix actions sweep (submit/save paths only yield `draft`/`in_review`).
  7. Admin can do everything: submit other's draft, approve `in_review → published` (update sets `published_at`, nulls `review_note`; revalidate `/courses` + `/courses/<slug>` layout), reject with note, archive.
  8. `rejectCourse` with missing/`"ab"`/501-char note → `note_required`, no write. Reject of a `published` course revalidates; reject of a `draft` does not.
  9. `saveCourseDraft` with invalid content → existing validation keys (e.g. `needsTitle`); slug collision against seed → `addressInUse`.
  10. Admin `publishCourse` republish (existing `published`) → ok + revalidate; slug change → old + new slug revalidated. Admin `unpublishCourse` on published → `draft` + revalidate. `removePublishedCourse` (published and draft) → delete + revalidate both. Plain draft save → zero revalidate calls.
- Verify: `npm test` (full suite, nothing removed/skipped); `npm run lint`; `npx tsc --noEmit`; `npm run build`.

## Risks

- **`update`/`delete` fake gaps** (flagged at triage): `unpublish`/`remove` already use chains the shared fake lacks, so Phase 3 is on the critical path — if the thenable-`eq` design fights existing suites, fall back to per-test hand-rolled service fakes (the `actions.test.ts` custom-object pattern) for `publish.test.ts` only, leaving the shared fake untouched.
- **`next/cache` under `node --test`**: real module needs the Next runtime; the stub + STUBS entry is mandatory before Phase 4 code is imported by any test. If `mock.module("next/cache")` is ever needed instead, prefer the direct-stub-import assertion pattern (deterministic, no double-mock issues).
- **`review_note` preservation**: Supabase `upsert` only writes supplied columns — omitting `review_note` preserves it; the test asserts the upsert payload has no such key. If a future column default interferes, set it explicitly from the read row.
- **Old-slug revalidation** needs the pre-update read the actions already perform — do not add a second query; reuse the read row's slug.
- **Key-name convention**: the three keys use the issue's literal snake_case (`not_owner` etc.) against the table's camelCase trend — intentional, recorded below; do not "fix" to camelCase (acceptance and downstream SIG-1114 reference these names).

## Assumptions

- Treated as feature request (planned slice) routing to Execute; all issue "Decisions (already taken, do not reopen)" accepted as settled (pure `canTransition`, coach-owns-own-only in `draft`/`rejected`, rejected-save → `draft`, admin direct publish stays, revalidate on visibility changes).
- Single-file implementation in `publish.ts`; the `review-actions.ts` split rejected because `"use server"` files cannot export the sync `checkedCourse` the new actions reuse.
- `canTransition` gains an optional `hasNote?: boolean` (absent from the issue's sketch) so the "rejecting requires a note" rule lives in the matrix and its test; length validation (3–500) stays in `rejectCourse`.
- `reason` values equal the error-key suffixes (`not_owner | invalid_status_change | note_required`) — one code layer, actions interpolate `course.admin.error.${reason}`.
- Admin same-status transitions are `ok` (idempotent republish/unpublish no-ops keep working through the uniform check).
- Status-only flips do no content re-validation; tier/price columns pass through on save with DB-check fallback (`publishFailed` on 23514); full tier validation belongs to SIG-1114.
- `approveCourse` nulls `review_note`; `saveCourseDraft` preserves it; `archiveCourse`/`removePublishedCourse` revalidate unconditionally; `submitCourseForReview` on a missing row returns `publishFailed` (no not-found key in scope).
- `requireAuthor` reuses `signinRequired`/`cannotPublish` keys (no new gate key).
- Triage claims re-verified this run: HEAD still `78fce50`, tree clean, `status.ts`/`review-actions.ts`/three keys/`revalidatePath` all still absent, ISR `revalidate = 60` on catalog + slug pages, fake lacks `update`/`delete`.

## Open questions

None blocking — all product decisions are recorded as taken in the issue and both dependencies (SIG-1050, SIG-1060) plus SIG-1072 are Done.
