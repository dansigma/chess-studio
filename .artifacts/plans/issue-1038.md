# SIG-1038 — Run the Supabase session check in the proxy only for `/courses/admin`

## Goal

Every request through `proxy.ts` (studio, puzzles, public APIs, ISR pages) currently blocks on a
Supabase `auth.getUser()` call plus a `profiles` role read, even though the result is only ever used
to gate `/courses/admin*`. When done, `updateSession` returns immediately — before creating any
Supabase client — for every non-admin path; `/courses/admin*` behavior (anonymous → login, non-author
→ `/courses`, author → pass, unconfigured → `/courses`) is unchanged; security headers still apply to
every response; and unit tests prove the predicate and the no-client behavior. Verified by
`npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and
`npx playwright test e2e/signin.spec.ts e2e/security-headers.spec.ts`.

## Scope

In:
- `src/lib/supabase/admin-gate.ts` — add exported `isAdminGatePath(path)`; reuse it inside
  `adminDenyDestination` so the two cannot drift apart.
- `src/lib/supabase/middleware.ts` — early `return NextResponse.next({ request })` for non-gate
  paths before any Supabase client creation (before even the `isSupabaseConfigured()` check; that
  branch returns the identical `NextResponse.next()` for non-admin paths, so behavior is preserved).
- `proxy.ts` — remove the now-redundant `/api/csp-report` special case and its unused import;
  always `await updateSession(request)`; headers still applied to every response.
- Tests: predicate cases in `src/lib/supabase/admin-gate.test.ts`; new
  `src/lib/supabase/middleware.test.ts` with a `@supabase/ssr` spy proving no client creation for
  `/studio` and `/api/explorer` but creation for `/courses/admin`.

Out (explicitly, per the issue):
- Explorer / player search / review-fetch changes (SIG-1084 to SIG-1087).
- Any other middleware hardening from the work-item title (per-source backoff, capped bodies,
  search cache, cache headers) — those belong to sibling API slices.
- Flag rename: keep the `canAuthor` name currently on this branch (post-SIG-1060); do not rename.

## Phase 1 — Shared gate predicate + predicate tests

Changes (`src/lib/supabase/admin-gate.ts`):
```ts
export function isAdminGatePath(path: string): boolean {
  return path === "/courses/admin" || path.startsWith("/courses/admin/");
}
```
Replace the inline condition in `adminDenyDestination` (lines 11–13) with `if (!isAdminGatePath(path)) return null;`.

Tests (`src/lib/supabase/admin-gate.test.ts`, new `describe` block, same `node:test` + `assert` style):
- `isAdminGatePath("/courses/admin")` → true; `("/courses/admin/x")` → true;
  `("/courses/admin/")` → true (trailing slash is under the prefix).
- `("/courses/adminx")` → false (prefix trap — must be exact segment); `("/studio")`,
  `("/api/explorer")`, `("/puzzles")` → false.
- Leave all existing `adminDenyDestination` tests untouched (they double as the acceptance
  "gate unchanged" proof).

Verify: `npm test -- src/lib/supabase/admin-gate.test.ts` (repo `test` script uses
`node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs`; pass the file path
through it, e.g. `npm test -- <file>` resolves via `node --test` file filtering).

## Phase 2 — Early return in `updateSession` + `proxy.ts` cleanup

Changes (`src/lib/supabase/middleware.ts`):
- Import `isAdminGatePath` alongside `adminDenyDestination`.
- At the top of `updateSession`, compute `path` first, then:
  `if (!isAdminGatePath(path)) return NextResponse.next({ request });`
  placed before `let response = …` / the `isSupabaseConfigured()` check. (Equivalent for the
  unconfigured branch: it currently returns a plain `NextResponse.next()` for non-admin paths.)
- Do not touch anything else in the function: the configured admin path keeps `getUser()` →
  `getRole` → `adminDenyDestination` → redirect logic byte-for-byte.

Changes (`proxy.ts`):
- Delete the `CSP_REPORT_PATH` import and the ternary; body becomes
  `const response = await updateSession(request);` followed by the unchanged
  `applySecurityHeaders(response, csp, isProd);`.
- Keep the exported `config` matcher unchanged.

Why this shape (alternatives considered and rejected):
- Early return inside `updateSession` rather than path filtering in `proxy.ts`: the issue
  mandates it, and it keeps the gate predicate in one module so matcher/gate cannot drift.
- Returning before the `isSupabaseConfigured()` check rather than after: avoids client creation
  in all cases and is behavior-identical for non-admin paths; no reason to keep a dead branch.

## Phase 3 — Spy test proving no Supabase client off the admin path

New file `src/lib/supabase/middleware.test.ts`. Constraints discovered during planning:
- `src/test-utils/stubs/next-server.ts` (used under `node --test`) implements `NextResponse.json`
  and `redirect` but **not** `NextResponse.next()` and has no `cookies` on the response — so
  importing the real `next/server` stub cannot run `updateSession`. Do **not** modify the shared
  stub (blast radius); instead `mock.module("next/server", …)` inside this test file, following
  the `mock.module` + dynamic `await import()` pattern in `src/lib/auth/access.test.ts`.
- `updateSession` imports `createServerClient` from `@supabase/ssr`; mock that module with a
  counting spy.

Test scaffolding:
- `mock.module("next/server", { namedExports: { NextRequest: FakeRequest, NextResponse: FakeResponse } })`
  where `FakeRequest` exposes `nextUrl` (a real `URL`) and `cookies.getAll()/set()`, and
  `FakeResponse` implements `static next()` (200, empty cookies store with `getAll`/`set`),
  `static redirect(url)` (307 + `Location` header), instance `.cookies`, `.headers`, `.status`.
  `redirectWithSession` only needs `cookies.getAll()` (array) and `cookies.set(name, value)`.
- `mock.module("@supabase/ssr", { namedExports: { createServerClient: (...args) => { calls.push(args); return fakeClient; } } })`
  with `fakeClient = { auth: { getUser: async () => ({ data: { user: null } }) } }`
  (`getRole` is never reached for the anonymous user, so no DB fake is needed).
- Set dummy env before calling: `process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"`,
  `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "dummy"` so the configured path is exercised.
  (`node --test` isolates files per process, so no leakage to other suites.)
- Dynamic `const { updateSession } = await import("@/src/lib/supabase/middleware.ts");` after mocks.

Cases (mirrors the issue's acceptance list):
1. `/studio` → spy `calls.length === 0`, response status 200 (proves no client created).
2. `/api/explorer` → spy `calls.length === 0`.
3. `/courses/admin` (anonymous) → spy `calls.length === 1`, response is a redirect whose
   `Location` is `/login?next=%2Fcourses%2Fadmin` (proves the client IS created on the admin path
   and the gate still works end-to-end through `updateSession`).
4. `/courses/adminx` → spy not called (guards the prefix trap through the full function).

## Phase 4 — Full verification

Run in order; stop and fix on first failure:
1. `npm test` (full unit suite — includes existing gate tests, auth/roles tests, route tests).
2. `npm run lint`.
3. `npx tsc --noEmit`.
4. `npm run build`.
5. `npx playwright test e2e/signin.spec.ts e2e/security-headers.spec.ts` (needs a running
   app server per `playwright.config.ts`; proves `/courses/admin` redirects still work and CSP /
   security headers still land on `/studio` and `/api/csp-report`).

Acceptance re-check: no test removed or skipped (`Nenhum teste removido ou pulado`); existing
`admin-gate.test.ts` cases pass unchanged; e2e `security-headers` passes (headers applied to all
responses including the former special-cased path).

## Risks

- **Session-refresh regression on non-admin pages.** Mitigated at triage: all server-side session
  readers are route handlers/server actions that refresh cookies themselves
  (`app/api/explorer/route.ts:228`, `app/api/my-games/sync/route.ts:91-95`,
  `app/auth/callback/route.ts:9`, `app/login/actions.ts:38,119`,
  `app/login/update-password/actions.ts:22`, `src/courses/publish.ts:33-74`,
  `src/lib/players/studio.ts:9,47`); no `page.tsx` Server Component calls
  `createServerSupabase`. Client components use the browser client. E2E `signin.spec.ts` is the
  backstop — do not skip it.
- **`NextResponse.next({ request })` semantics for middleware.** The early return preserves the
  exact construction the function already used for pass-through; `proxy.ts` then applies headers
  as before.
- **Shared-stub temptation.** If the spy test is written against the repo's `next-server` stub
  instead of an in-file mock, it will fail (`next()` missing). The plan's Phase 3 avoids this;
  do not "fix" the stub as a shortcut.
- **Trailing-slash admin paths** (`/courses/admin/`): covered by `startsWith` and an explicit
  predicate case.

## Assumptions

- Triage claims re-verified against the current checkout (branch `factory/linear-sig-1038`,
  remote `dansigma/chess-studio` — matches the issue's repo): eager `getUser()` at
  `middleware.ts:67`, role read at `:71`, gate predicate at `admin-gate.ts:11-13`, matcher at
  `proxy.ts:20-24`. Line numbers may drift; search by symbol, not line.
- The CSP-report exemption + `readCapped`-on-`Request` work (SIG-1054/PR #123, per author comment
  2026-10-21) is already on the base; this plan deletes only the exemption, nothing else.
- Scope is Requirements 1–3 of SIG-1038 only; the work-item title's other slices (backoff, capped
  bodies, search cache, cache headers) are sibling items and out of scope.
- Type for transition: `bug` (performance), route `Plan fix` — carried over from triage.
- `mock.module` + dynamic-import pattern from `src/lib/auth/access.test.ts` works for mocking
  `@supabase/ssr` and `next/server` in `node --test` (same runner flags, same loader).

## Open questions

- None blocking execution. Sequencing of the sibling API slices (SIG-1084–1087) is a maintainer
  prioritization call, not a plan blocker.
