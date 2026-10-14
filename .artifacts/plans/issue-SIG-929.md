# Implementation Plan - SIG-929: Auth: raise minimum password length above 6 characters

## Goal
Raise the minimum password length requirement from 6 to 10 characters across the application by introducing a single shared constant and validation helper (`src/lib/auth/password.ts`), enforcing it on signup in the server action (`app/login/actions.ts`), updating client form validation and helper hints in `app/login/page.tsx` and `app/login/update-password/page.tsx`, and ensuring existing users with shorter passwords can continue signing in without restriction. Done means all unit and integration tests pass (`npm test`, `npm run lint`, `npx tsc --noEmit`), signup/password change reject passwords < 10 characters, and operator steps for Supabase Auth are documented.

## Scope
- **In scope:**
  - Create `src/lib/auth/password.ts` exporting `MIN_PASSWORD_LENGTH = 10`, `isValidPassword`, `passwordLengthError`, and `passwordRequirementHint`.
  - Create unit tests in `src/lib/auth/password.test.ts` testing boundaries (9 vs 10 chars), non-strings, and messages.
  - Update `app/login/actions.ts` to enforce `MIN_PASSWORD_LENGTH` on `mode === "signup"`, require non-empty password on `mode === "signin"` without length restriction, and use `passwordLengthError()`.
  - Update `app/login/page.tsx` to display updated hint text ("At least 10 characters") for signup.
  - Update `app/login/update-password/page.tsx` to enforce `MIN_PASSWORD_LENGTH` in client form validation, `minLength` attributes, and hint text.
  - Update `app/login/actions.test.ts` fixtures (`"secret1"` -> `"secret1234"`, signup rejection test, signin backward-compatibility test).
  - Document Supabase operator settings (minimum password length = 10, leaked password protection).
- **Out of scope:**
  - Password strength meter, zxcvbn, entropy scoring.
  - Multi-factor authentication (MFA).
  - Changing existing password hash algorithm or database schema.

## Phases

### Phase 1: Shared Password Constant and Validation Module
- **Files:**
  - `src/lib/auth/password.ts` (new)
  - `src/lib/auth/password.test.ts` (new)
- **Changes:**
  - Define `MIN_PASSWORD_LENGTH = 10`.
  - Export `isValidPassword(password: unknown): password is string` verifying `typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH`.
  - Export `passwordLengthError(min = MIN_PASSWORD_LENGTH): string` returning `"Password must be at least 10 characters."`.
  - Export `passwordRequirementHint(min = MIN_PASSWORD_LENGTH): string` returning `"At least 10 characters"`.
- **Tests:**
  - `src/lib/auth/password.test.ts`: Test 9 chars (false), 10 chars (true), 11 chars (true), empty string (false), null/undefined/number (false), and returned error/hint strings.
- **Verification:**
  - `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "src/lib/auth/password.test.ts"`

### Phase 2: Server Action Enforcement & Sign-in Backward Compatibility
- **Files:**
  - `app/login/actions.ts`
  - `app/login/actions.test.ts`
- **Changes:**
  - Import `MIN_PASSWORD_LENGTH`, `isValidPassword`, and `passwordLengthError` from `@/src/lib/auth/password`.
  - Remove top-level `if (password.length < 6)` that previously blocked short passwords on signin.
  - For `mode === "signin"`: check `if (!password) { return { error: "Enter a password." }; }`. Do not enforce minimum length, preserving access for existing accounts.
  - For `mode === "signup"`: validate `if (!isValidPassword(password)) { return { error: passwordLengthError() }; }`.
  - In `app/login/actions.test.ts`:
    - Update test fixtures using `"secret1"` (7 chars) to `"secret1234"` (10 chars).
    - Update `short password is rejected` to test `mode: "signup"` with 9-character password, verifying error `"Password must be at least 10 characters."`.
    - Add test confirming `mode: "signin"` with a short password (< 10 chars, e.g. `"abc"`) is passed to `signInWithPassword` and not blocked by the minimum length validator.
- **Tests:**
  - `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "app/login/actions.test.ts"`
- **Verification:**
  - Run `npm test` and `npx tsc --noEmit`.

### Phase 3: Client Form and Reset Flow Alignment
- **Files:**
  - `app/login/page.tsx`
  - `app/login/update-password/page.tsx`
- **Changes:**
  - In `app/login/page.tsx`: Import `passwordRequirementHint` and replace hardcoded `"At least 6 characters"` with `{passwordRequirementHint()}`.
  - In `app/login/update-password/page.tsx`:
    - Import `MIN_PASSWORD_LENGTH`, `isValidPassword`, `passwordLengthError`, and `passwordRequirementHint`.
    - Update trailing label helper text to `{passwordRequirementHint()}`.
    - Update `minLength={MIN_PASSWORD_LENGTH}` on both `new-password` and `confirm-password` inputs.
    - In `onSubmit`: add validation `if (!isValidPassword(password)) { setMessage({ tone: "error", text: passwordLengthError() }); return; }`.
- **Tests & Verification:**
  - `npm test`
  - `npm run lint`
  - `npx tsc --noEmit`

### Phase 4: Supabase Operator Alignment Documentation
- **Changes:**
  - Document operator instructions for the PR description:
    1. Navigate to Supabase Dashboard -> Authentication -> Password Protection.
    2. Set Minimum Password Length to 10 characters.
    3. Enable Leaked Password Protection (checks against HaveIBeenPwned).
- **Verification:**
  - Ensure documentation is complete and clearly noted in PR template / handoff.

## Risks
- **Risk:** Existing users with 6-9 character passwords unable to sign in.
  - **Mitigation:** Ensure length validation is isolated to `signup` and `update-password`, and explicitly tested in `app/login/actions.test.ts`.
- **Risk:** Test fixture breakages in `app/login/actions.test.ts` due to 7-character `"secret1"`.
  - **Mitigation:** Proactively update all signup test fixtures in `actions.test.ts` to 10+ characters (`"secret1234"`).
- **Risk:** Desynchronization between client error messages and server error messages.
  - **Mitigation:** Both server action and client forms consume `passwordLengthError()` and `passwordRequirementHint()` from `src/lib/auth/password.ts`.

## Assumptions
1. `MIN_PASSWORD_LENGTH` is set to 10 as specified in SIG-929.
2. Sign-in requires a non-empty password (`!password`) but does not enforce minimum length.
3. Password update flow in `app/login/update-password/page.tsx` retains its existing browser Supabase client architecture, augmented with client-side validation against `MIN_PASSWORD_LENGTH` before calling `supabase.auth.updateUser`.
4. Supabase operator configuration changes are performed out-of-band via Supabase Dashboard.

## Open questions
- None blocking implementation.
