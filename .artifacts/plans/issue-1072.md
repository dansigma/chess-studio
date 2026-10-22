# SIG-1072 — i18n 4/7: course authoring (admin) in PT-BR

## Goal

The course-authoring admin surface renders in PT-BR when the site locale is `pt-br`, and every publish/validation failure surfaces as a stable `CourseAdminErrorKey` resolved client-side via `tCourseAdmin(locale, key, vars)` — never as an English sentence from the server (server never knows the site locale). Done means: `src/i18n/course-admin-strings.ts` exists with aligned EN + PT-BR tables; `publish.ts`, `catalog.ts`, `draft.ts`, `admin-draft.ts` return keys; `AdminView`, `CourseFields`, `ChapterDraft`, `DescriptionField`, `use-admin-session` render/confirm/display through those keys; unit tests prove table alignment and representative mappings; `npm test` + `tsc --noEmit` pass.

## Scope

**In:**
- New `src/i18n/course-admin-strings.ts`: `COURSE_ADMIN_STRING_KEYS`, `CourseAdminErrorKey` (subset or same type — see Phase 1), `CourseAdminMessage = { key; vars? }` pattern per `auth-strings.ts:72`, `TABLES`, `tCourseAdmin = createT(EN, PT-BR)`, following `course-strings.ts` grain (whole-sentence templates, `{title}`/`{count}` interpolation, stored author content never translated).
- Key-ification of every English failure string in the publish path:
  - `publish.ts`: `databaseError` (3), `requirePublisher` (4), `checkedCourse` (~9), slug-collision (1), ownership-changed (1). `databaseError` takes the Supabase error and returns a key — keep its signature `(error) => CourseAdminErrorKey`.
  - `catalog.ts`: `courseSlugError`, `courseOwnershipError` return `CourseAdminErrorKey | null` instead of `string | null`. (Both are also re-exported/used by `store.ts:17` — update the re-export type, not behavior.)
  - `draft.ts`: `normalizeChapters` returns `{ error: CourseAdminMessage }` (needs `{title}` interpolation for the three per-line errors); `hasPlayableContent` unchanged.
  - `admin-draft.ts`: `importChapterPgn` returns `{ error: CourseAdminMessage }` (no vars — static sentences).
- Client resolution at every display site: `AdminView.tsx` (`save()` guards, `normalizeChapters` mapping, publish/unpublish/remove results, confirms at :149/:204/:231, status/empty/gated copy), `use-admin-session.ts` (`fetchPublishedCourses` error passthrough, import/discard confirms, stale-copy notice :122), `use-admin-draft.ts` (`addChapterPgn` mapping: `{key, vars}` → `tCourseAdmin`), `CourseFields.tsx`, `ChapterDraft.tsx`, `DescriptionField.tsx` (labels, placeholders, aria-labels, toolbar titles).
- Tests: `src/i18n/course-admin-strings.test.ts` mirroring `course-strings.test.ts` (alignment + every-key-renders + spot-check interpolation incl. `{title}` line errors); extend `catalog.test.ts`/`admin-draft.test.ts`-style assertions only where return types change (key equality, not sentence equality).

**Out:**
- Student surface (done in SIG-1071), `/admin/users` table (SIG-1063), `store.ts` fetch path key-ification (`fetchPublishedCourses` returns `string | null` consumed by `use-admin-session` — wrap at the session layer with a key mapping instead of changing its contract; `MISSING_SCHEMA_NOTICE` stays as-is unless trivial to include — it is admin-visible but out of the publish path).
- No component/e2e tests (no harness per SIG-1045); no visual changes; no migration; author content (titles, PGN, summaries) never translated.

## Phases

### Phase 1 — String table + error-key types (foundation)

Create `src/i18n/course-admin-strings.ts` with `createT` following `auth-strings.ts`/`course-strings.ts` exactly:
- Keys (namespace `course.admin.*` for UI, `course.admin.error.*` for failures). Derive from current code, not from the issue's counts (verified drift: 17 `error: "` sites in `publish.ts` today, plus helpers):
  - UI (~35 keys): gated heading/body/signin, `newCourse`, `saveCourse`/`saving`, `addChapter`, `chapterHeading` (`Chapter {n}`), `chapterTitle` placeholder, `lineName` placeholder, `addLine`, `uploadPgn`, `pgnHint`, `pgnPlaceholder` (keep `{Opening comment} 1. e4…` example untranslated — it is PGN syntax, only the surrounding hint translates), `removeChapter`/`moveChapterUp`/`moveChapterDown`/`moveLineUp`/`moveLineDown`/`removeLine` (IconButton labels), `confirmRemoveChapter`, `confirmUnpublish`, `confirmDelete`, `unpublish`, `delete`, `field.address/title/description/cover/introVideo/theme/pieces`, `themePlaceholder` (`Choose a theme`), `white`/`black` options, `coverPlaceholder` (`https://` — invariant, no key needed; skip), `videoPlaceholder`, `slugFallback` (`my-course` — slug syntax, skip translation, keep literal), `saveHint` (`Save the title…`), `statusPublished`/`statusDraft`, `formNeedsTitle` (also an error key — share it), `pgnTooLarge`/`pgnNoLines`/`pgnUnreadable`, `staleCopyNotice`, `confirmReplaceDraft` (`Replace the published course "{title}"…` with `{title}` var), `confirmDiscardDrafts`, empty-form heading (`Create a course` / draft title fallback).
  - Errors (~20 keys, each a stable literal, whole-sentence with `{title}` where interpolated): `supabaseNotConfigured`, `signinRequired`, `cannotPublish`, `serverUnavailable`, `needsTitle`, `invalidId`, `chooseColor`, `chooseTheme`, `descriptionTooLong`, `coverHost`, `videoLink`, `needsAddress`, `addressInUse`, `noOwner`, `belongsToOther`, `tableMissing`, `publishFailed`, `ownershipChanged`, `needsPlayableLine`, `tooManyChapters`, `tooManyLines`, `lineNeedsPgn` (`{title}`), `lineTooLong` (`{title}`), `lineNoMoves` (`{title}`), plus shared `needsTitle`/`chooseTheme`/`needsPlayableLine` reused by `AdminView.save()` guards.
- `export type CourseAdminMessage = { key: CourseAdminErrorKey; vars?: StringVars }` (import `StringVars` from `./create-t.ts` as `auth-strings.ts:7` does).
- PT-BR translations for all keys (admin-register Portuguese; follow `course-strings.ts` PT-BR tone: `Capítulo {n}`, `Linha`, `Publicar` verbs, `Endereço` for slug/address — check `course-strings` for precedent where overlapping).
- Test: `src/i18n/course-admin-strings.test.ts` = alignment via `assertStringTablesAligned`, uniqueness + every-key-renders in both locales, interpolation spot-checks (`lineNeedsPgn` with `{title}`, `confirmReplaceDraft` with `{title}`).

Verify: `npx tsc --noEmit` (missing PT-BR key fails typecheck by design); `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test src/i18n/course-admin-strings.test.ts`.

### Phase 2 — Server/pure error-key refactor (no UI yet)

- `catalog.ts`: `courseSlugError` → returns `CourseAdminMessage | null`; `courseOwnershipError` → same. Keep the `null`-means-ok contract. Update `store.ts:17` re-export (type flows through; no behavior change).
- `draft.ts`: `normalizeChapters` → `{ chapters } | { error: CourseAdminMessage }` with `{title}` var on the three per-line errors. Pure function — update `draft`-adjacent tests to assert keys.
- `admin-draft.ts`: `importChapterPgn` → `{ error: CourseAdminMessage } | null`.
- `publish.ts`: `databaseError` → returns `CourseAdminErrorKey`; `requirePublisher`/`checkedCourse`/`publishCourse`/`unpublishCourse`/`removePublishedCourse` return `{ ok:false; error: CourseAdminMessage }`. `checkedCourse` maps `normalizeChapters`/`courseSlugError` messages through directly. `databaseError` keeps mapping logic (PGRST205/23505 → keys).
- Decision (recorded): error payloads are `{ key, vars? }` objects, not bare string keys, because three draft errors interpolate `{title}` — matches `AuthMessage` precedent, costs nothing.

Verify: `npx tsc --noEmit` will fail at all client call sites (expected — proves the seam); `npm test -- src/courses/catalog.test.ts src/courses/admin-draft.test.ts` after updating assertions to keys.

### Phase 3 — Client resolution + admin UI strings

- `AdminView.tsx`: `save()` guards emit keys; `normalizeChapters` failure maps via `tCourseAdmin(locale, msg.key, msg.vars)`; publish/unpublish/remove results same; `window.confirm` strings → `tCourseAdmin` keys; all static copy (gated view, buttons, hints, status lines) → keys. Get `locale` from `useStudioStore` as `CourseFields.tsx:18`/`LocalDraftsSection.tsx:24` already do.
- `use-admin-session.ts`: `importLocalDraft` maps `result.error` via `tCourseAdmin`; `published.error` from `fetchPublishedCourses` (still `string | null`) maps to a `loadFailed` key at display time; confirms/notices → keys.
- `use-admin-draft.ts`: `addChapterPgn` maps `{key,vars}` through `tCourseAdmin` — needs `locale` param or store read (client hook, store read is fine).
- `CourseFields.tsx` (already reads `locale`), `ChapterDraft.tsx` + `DescriptionField.tsx` (add `useStudioStore` locale read; `DescriptionField` placeholder/aria-label/toolbar labels are props of tiptap/FormatButton — pass translated strings; note `extensions` array is module-level with a hardcoded placeholder — move placeholder into the component via `Placeholder.configure` per-instance or set `editorProps`/update option so it re-renders with locale).
- Keep `LocalDraftsSection.tsx` as-is (already translated in SIG-1071).

Verify: `grep -rn '"The \|"Choose \|"That \|"Sign in to\|window.confirm("' src/courses/*.tsx src/courses/use-admin-*.ts` returns only author-content/URL literals; `npm test`; `tsc --noEmit`; manual `?previewDrafts` admin walkthrough in both locales if feasible.

## Risks

- **Key-count drift**: issue says "20 literal sites" but code has 17 `error: "` in `publish.ts` + helpers; mitigation: Phase 1 derives keys from `grep` output above, test asserts every key renders (a missed string stays English — visible, not breaking).
- **`DescriptionField` module-level `extensions`**: placeholder baked at import; must become per-locale — check tiptap `Placeholder.configure` update path; fallback: `key={locale}` on `DescriptionField` to remount per locale (cheap, admin-only).
- **`fetchPublishedCourses` contract**: left as `string | null` deliberately; session layer maps to a generic `loadFailed` key — slight imprecision (schema-missing vs generic) accepted for blast-radius control; `MISSING_SCHEMA_NOTICE` path stays English only in the missing-migration edge.
- **PT-BR quality**: admin-only surface; machine-quality PT-BR acceptable, native-speaker review recommended as follow-up (non-blocking).

## Assumptions

- Feature request, not bug; dependency SIG-1035 satisfied (`createT`, `assertStringTablesAligned` in-tree).
- `{ ok:false; error: CourseAdminMessage }` breakage accepted: only in-repo consumers (`AdminView`, `use-admin-session`), verified by search.
- `normalizeChapters`/`courseSlugError`/`courseOwnershipError`/`importChapterPgn` English strings are in scope (same `setError` display path).
- Confirms + `use-admin-session` sentences included in the table (user-facing admin copy).
- `IconButton label`/`title`/`aria-label` localization also changes a11y strings — intended.
- No component/e2e tests (no harness, SIG-1045); unit tests on key→message mapping only.
- Slug-syntax literals (`my-course`, `https://`, PGN example placeholder) stay untranslated.

## Open questions

- None blocking. Non-blocking follow-up: native-speaker PT-BR review of the admin table before or after merge.
