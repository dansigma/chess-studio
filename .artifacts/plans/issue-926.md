# Implementation Plan: SIG-926 Auth: require confirmed email before granting admin role

## Goal
Prevent unconfirmed user accounts from obtaining administrative or course-publishing privileges by requiring verified email confirmation (`email_confirmed_at`) for email allowlist checks in `src/lib/auth/course-permissions.ts`, adding unit tests covering confirmed and unconfirmed states, and documenting the mandatory Supabase "Confirm email" configuration in `.env.example` and `README.md`.

## Scope
- **In Scope:**
  - Update `isCourseSuperAdmin` and `userCanPublishCourses` in `src/lib/auth/course-permissions.ts` to check `Boolean(user.email_confirmed_at && emailIsCourseAdmin(user.email))`.
  - Preserve `app_metadata.role === "admin"` access without stripping or breaking existing admins.
  - Add unit tests to `src/lib/auth/course-permissions.test.ts` verifying unconfirmed allowlisted emails are denied, confirmed allowlisted emails are permitted, and existing `app_metadata.role === "admin"` accounts remain permitted.
  - Document in `.env.example` and `README.md` that Supabase "Confirm email" must remain enabled in project settings.
- **Out of Scope:**
  - Modifying `adminDenyDestination` in `src/lib/supabase/admin-gate.ts` (remains a pure destination mapper).
  - Modifying `src/lib/auth/access.ts` (already verifies `emailConfirmedAt` before granting admin).
  - Modifying signup/login rate limits or SMTP/Resend delivery settings (SIG-843).

## Phases

### Phase 1: Course Permissions Enforcement & Unit Tests
1. **File:** `src/lib/auth/course-permissions.ts`
   - Update `isCourseSuperAdmin(user: Pick<User, "email" | "app_metadata"> & { email_confirmed_at?: string | null }): boolean`
     - Return `Boolean(user.email_confirmed_at && emailIsCourseAdmin(user.email)) || user.app_metadata.role === "admin"`.
   - Update `userCanPublishCourses(supabase: SupabaseClient<Database>, user: Pick<User, "id" | "email" | "app_metadata"> & { email_confirmed_at?: string | null }): Promise<boolean>`
     - Check `user.app_metadata.role === "admin" || Boolean(user.email_confirmed_at && emailIsCourseAdmin(user.email))`.
     - Fall through to checking `profiles.role === "admin"` in the database.
2. **File:** `src/lib/auth/course-permissions.test.ts`
   - Test `isCourseSuperAdmin`:
     - Allowlisted email + confirmed (`email_confirmed_at: "2026-10-14T00:00:00Z"`) -> `true`.
     - Allowlisted email + unconfirmed (`email_confirmed_at: null` or `undefined`) -> `false`.
     - Non-allowlisted email + `app_metadata: { role: "admin" }` with `email_confirmed_at: null` -> `true`.
     - Non-allowlisted email without admin claim -> `false`.
   - Test `userCanPublishCourses`:
     - Allowlisted email + confirmed -> `true` without querying profiles table.
     - Allowlisted email + unconfirmed + non-admin profile -> `false`.
     - Allowlisted email + unconfirmed + admin profile -> `true` (handles existing promoted admins).
     - Non-allowlisted email + student profile -> `false`.
3. **Verification Command:**
   ```bash
   node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "src/lib/auth/**/*.test.ts"
   ```

### Phase 2: Documentation Updates
1. **File:** `.env.example`
   - Document above `COURSE_ADMINS` that Supabase Auth "Confirm email" must be enabled in the project dashboard (Authentication > Providers > Email) so signups cannot impersonate allowlisted admins without verification.
2. **File:** `README.md`
   - Under `## Supabase (accounts + saved boards)`, add explicit instruction to ensure "Confirm email" is enabled in Supabase Authentication settings.
3. **Verification Command:**
   ```bash
   git diff .env.example README.md
   ```

### Phase 3: Final Verification & Sanity Checks
1. Run all auth test suites:
   ```bash
   node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "src/lib/auth/**/*.test.ts"
   node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "src/lib/supabase/admin-gate.test.ts"
   ```
2. Verify clean git status and no unintended edits.

## Risks & Mitigations
- **Risk:** Existing admins might be locked out if `email_confirmed_at` is missing in cached sessions.
  - **Mitigation:** Existing admins have `app_metadata.role === "admin"` written by `finishSignIn`, which acts as an immediate bypass without requiring `email_confirmed_at`.
- **Risk:** Callers passing partial user objects might fail TypeScript checks.
  - **Mitigation:** Use optional property `{ email_confirmed_at?: string | null }` in the parameter types, consistent with Supabase's `User` interface. All known call sites (`publish.ts`, `middleware.ts`) pass the full `User` object from `supabase.auth.getUser()`.

## Assumptions
- Supabase's `User` object provides `email_confirmed_at` as an ISO string when confirmed and null/undefined when unconfirmed.
- `finishSignIn` in `src/lib/auth/access.ts` is already gating role elevation on `emailConfirmedAt`.
- `adminDenyDestination` remains unchanged as a pure routing decision helper.

## Open Questions
- None.
