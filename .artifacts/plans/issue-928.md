# Implementation Plan: SIG-928 Auth: require NEXT_PUBLIC_SITE_URL in production for auth email redirects

## Goal
Enforce and validate `NEXT_PUBLIC_SITE_URL` as a mandatory, well-formed `https:` URL in production for all auth email redirects (`redirectTo` in password reset and `emailRedirectTo` in signup) to eliminate client-influenced link domains (origin header poisoning) and broken localhost links, while retaining safe `Origin` and `http://localhost:3000` fallbacks for development and test environments.

## Scope
- **In Scope:**
  - Create a pure URL resolution helper in `src/lib/auth/site-url.ts` that enforces a valid `https:` `NEXT_PUBLIC_SITE_URL` in production (`NODE_ENV === "production"`), returning a structured result `{ ok: true, url: string } | { ok: false, error: string, cause: string }`.
  - In non-production environments (`development`, `test`), maintain fallback to configured `NEXT_PUBLIC_SITE_URL`, then request `Origin` header, then `http://localhost:3000`.
  - Update `app/login/actions.ts` to use `resolveSiteUrl`. If resolution fails, log the configuration error cause via `console.error` and return a user-friendly generic error without calling Supabase auth methods.
  - Add comprehensive unit tests in `src/lib/auth/site-url.test.ts`.
  - Add integration tests in `app/login/actions.test.ts` covering production mode (unset env var fails closed, valid https env var used, request Origin ignored in prod) and dev/test mode (Origin fallback works).
  - Update `.env.example` to document `NEXT_PUBLIC_SITE_URL` as required in production and note that it must be a well-formed `https:` URL.
- **Out of Scope:**
  - Modifying Supabase dashboard redirect-URL allowlists (operator manual step).
  - Modifying `safeAuthNext` or path sanitization in `src/lib/auth/redirect-path.ts` (already verified and safe).
  - Modifying other server actions or auth role assignments (`src/lib/auth/access.ts`, `src/lib/auth/course-permissions.ts`).

## Phases

### Phase 1: Pure Site URL Helper & Unit Tests
1. **File:** `src/lib/auth/site-url.ts` (new)
   - Export interface `SiteUrlOptions`: `{ siteUrl?: string | null; origin?: string | null; nodeEnv?: string }`.
   - Export type `SiteUrlResult`: `{ ok: true; url: string } | { ok: false; error: string; cause: string }`.
   - Export function `resolveSiteUrl(options?: SiteUrlOptions): SiteUrlResult`:
     - Determine environment mode: `nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV`.
     - In production (`nodeEnv === "production"`):
       - If `NEXT_PUBLIC_SITE_URL` (or `options.siteUrl`) is missing or blank: return `{ ok: false, error: "Authentication service is temporarily unavailable.", cause: "NEXT_PUBLIC_SITE_URL is required in production but was not set." }`.
       - Validate using `new URL(...)`. If invalid or protocol is not `"https:"`: return `{ ok: false, error: "Authentication service is temporarily unavailable.", cause: "NEXT_PUBLIC_SITE_URL must be a valid https: URL in production." }`.
       - If valid: normalize trailing slashes and return `{ ok: true, url: normalizedUrl }`.
       - Under no circumstance fall back to `origin` or `localhost` in production.
     - In non-production (`nodeEnv !== "production"`):
       - If `options.siteUrl` or `NEXT_PUBLIC_SITE_URL` is set: validate and return normalized URL if valid.
       - Otherwise if `origin` is provided: validate URL, return `new URL(origin).origin`.
       - Otherwise fallback to `"http://localhost:3000"`.
2. **File:** `src/lib/auth/site-url.test.ts` (new)
   - Unit tests using `node:test` and `node:assert/strict`:
     - Production: missing var returns error with clear cause.
     - Production: empty/whitespace var returns error.
     - Production: non-https URL (e.g. `http://example.com`, `ftp://...`) returns error.
     - Production: malformed URL returns error.
     - Production: valid https URL returns `{ ok: true, url: ... }` with trailing slashes stripped.
     - Production: request `origin` parameter is ignored when var is missing.
     - Development: missing var uses `origin` if present.
     - Development: missing var and missing origin falls back to `http://localhost:3000`.
     - Development: valid var overrides origin.
3. **Verification Command:**
   ```bash
   node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "src/lib/auth/site-url.test.ts"
   ```

### Phase 2: Wire into `app/login/actions.ts` & Actions Integration Tests
1. **File:** `app/login/actions.ts`
   - Import `resolveSiteUrl` from `@/src/lib/auth/site-url`.
   - Replace internal `requestOrigin()` and `siteUrl()` with a call to `resolveSiteUrl({ origin: (await headers()).get("origin") })`.
   - In `submitAuth`:
     - In `mode === "reset"`: call `resolveSiteUrl`. If not ok, `console.error("[auth] Site URL resolution failed:", result.cause);` and return `{ error: "Could not send the reset link. Try again." }`.
     - In `mode === "signup"`: call `resolveSiteUrl`. If not ok, `console.error("[auth] Site URL resolution failed:", result.cause);` and return `{ error: "Could not create the account. Try again." }`.
2. **File:** `app/login/actions.test.ts`
   - Maintain existing tests (run under `NODE_ENV=test` where Origin fallback works).
   - Add test case: in `NODE_ENV=production` without `NEXT_PUBLIC_SITE_URL`, `mode: "reset"` returns generic error and does not call `supabase.auth.resetPasswordForEmail`.
   - Add test case: in `NODE_ENV=production` without `NEXT_PUBLIC_SITE_URL`, `mode: "signup"` returns generic error and does not call `supabase.auth.signUp`.
   - Add test case: in `NODE_ENV=production` with `NEXT_PUBLIC_SITE_URL=https://chess.example.com`, `reset` and `signup` use the configured URL even if request has a different `Origin` header.
3. **Verification Command:**
   ```bash
   node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "app/login/actions.test.ts"
   ```

### Phase 3: Update `.env.example`
1. **File:** `.env.example`
   - Update comments around `NEXT_PUBLIC_SITE_URL` to state clearly:
     - Required in production.
     - Must be a well-formed `https:` base URL.
     - In development, falls back to request `Origin` or `http://localhost:3000`.
2. **Verification Command:**
   ```bash
   git diff .env.example
   ```

### Phase 4: Full Suite Verification & Quality Checks
1. Run all auth unit and integration tests:
   ```bash
   node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "src/lib/auth/**/*.test.ts" "app/login/actions.test.ts"
   ```
2. Verify clean git status and no unwanted file changes.

## Risks & Mitigations
- **Risk:** Inlined `NEXT_PUBLIC_*` build-time evaluation in Cloudflare Pages / Next.js builds could cause missing runtime vars if not set at build time.
  - **Mitigation:** Document clearly in `.env.example` and release notes that `NEXT_PUBLIC_SITE_URL` must be configured in build environment variables.
- **Risk:** Trailing slashes on `NEXT_PUBLIC_SITE_URL` (e.g. `https://example.com/`) producing double slashes (e.g. `https://example.com//auth/callback`).
  - **Mitigation:** Normalize resolved URLs by stripping trailing slashes in `resolveSiteUrl`.
- **Risk:** Existing tests or local dev setups without `NEXT_PUBLIC_SITE_URL` breaking.
  - **Mitigation:** Only require the variable when `NODE_ENV === "production"`; development and test default to Origin / localhost fallback.

## Assumptions
- `process.env.NODE_ENV === "production"` reliably distinguishes production deployments from local development and test runs.
- In production, URLs must strictly use `https:` (no plain `http:` allowed in production).
- When `resolveSiteUrl` fails in production, returning standard generic error messages ("Could not send the reset link. Try again." and "Could not create the account. Try again.") protects against leaking internal setup details to end users while server-side `console.error` provides operational visibility.

## Open Questions
- None. Requirements and edge cases are well-defined.
