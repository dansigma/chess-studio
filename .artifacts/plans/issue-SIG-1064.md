# SIG-1064 — Coach invites UI: create/revoke in /admin/users + /coach-invite/[token] accept page

## Goal

Admins can create, list, revoke, and resend coach invites from `/admin/users`
(the invite link is shown once with a copy button; only the SHA-256 hash is
ever stored), and an invitee opening `/coach-invite/<token>` is sent through
login (with `next` preserved) and then sees a localized accept result, with
success linking to `/courses/admin`. Done means: all five issue requirements
implemented, unit tests pinning every accept code in both locales, the
redirect-allowlist regression tests extended, the new e2e spec passing, and
`npm test`, `tsc --noEmit`, `lint`, `build`, and the new e2e spec all green.
No existing tests removed or weakened.

## Scope

**In:**
- `app/admin/users/invite-actions.ts` + `invite-actions.test.ts` (new):
  `createInviteAction(email)` → `{ ok: true, data: { id, link, expiresAt } }`,
  `listInvitesAction()`, `revokeInviteAction(id)`, `resendInviteAction(id)`.
  Admin-gated via `getRole`/`isAdmin`, validated before quota, rate-limited
  10 req / 10 min per admin and per IP (`RL_AUTH` binding, namespaced keys).
  Never returns tokens or hashes (only the one-time `link` from create/resend).
- `src/admin/UsersView.tsx` "Invites" section: email field + "Create invite"
  button showing the link once with copy button + expiry; pending-invite list
  with Revoke and Resend (resend = revoke old + mint new link via lib
  `resendInvite`). Pending = `!acceptedAt && !revokedAt && expiresAt > now`,
  filtered client-side; lib `listInvites` unchanged.
- `app/coach-invite/[token]/page.tsx` (new, `dynamic = "force-dynamic"`,
  `robots: noindex`): no session → `redirect("/login?next=/coach-invite/<token>")`;
  with session → per-IP 10/10 min limit, then `acceptInvite`, render
  `src/admin/InviteResult.tsx` (new client component, locale message pick,
  success links to `/courses/admin`).
- `src/admin/strings.ts`: `admin.invites.*` + `coach.invite.*` keys in EN and
  PT-BR (strict `Record`, so a missing PT-BR key fails `tsc`); `src/admin/rules.ts`:
  `COACH_INVITE_ACCEPT_CODES` + `coachInviteAcceptKey(code)` pure helper.
  Extend `src/admin/rules.test.ts`: parity, per-code localization in both
  locales (mirrors the `ADMIN_USERS_ERROR_CODES` test).
- `src/lib/auth/redirect-path.ts`: add `"/coach-invite"` to
  `ALLOWED_PREFIXES` + tests (`/coach-invite/abc` passes;
  `/coach-invitex`, `/coach-invite@evil`, `//evil.example` fall back).
- `e2e/coach-invite.spec.ts` (new, mirrors `admin-users.spec.ts`): anonymous
  `GET /coach-invite/anything` lands on `/login` with `next` preserved.
- CHANGELOG entry following the existing SIG-10xx style.

**Out:**
- Emailing the invite link (follow-up after SIG-1058).
- Coach-owned courses / review workflow (SIG-1050).
- Any change to `src/lib/admin/coach-invites.ts`, the
  `accept_coach_invite` migration, RLS policies, or `database.types.ts`.
- Translating the rest of the site (SIG-1035 slices).

## Phase 1 — Redirect allowlist for /coach-invite

**Changes:**
- `src/lib/auth/redirect-path.ts`: add `"/coach-invite"` to `ALLOWED_PREFIXES`.
- `src/lib/auth/redirect-path.test.ts`: accept `/coach-invite/abc123` (and with
  query string); reject `/coach-invitex`, `/coach-invite@evil`, `//evil.example`
  (fallback). Follows the existing `/adminx` / `/admin@evil` sibling tests.

**Tests:** extended `redirect-path.test.ts` (12 existing + new cases).
**Verify:** `cd chess-studio && node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test src/lib/auth/redirect-path.test.ts`

## Phase 2 — Invite server actions

**Changes** (`app/admin/users/invite-actions.ts`, new; mirror the structure of
`app/admin/users/actions.ts`: `adminCaller` gate via `createServerSupabase` +
`getRole`/`isAdmin`, validate-before-quota, dual user+IP quota):
- Module limiter: `createRouteLimiter({ limit: 10, windowMs: 10 * 60 * 1000, bindingName: "RL_AUTH" })`.
  Keys namespaced per action so listing never burns the create quota, e.g.
  `coach-invite-create:<adminId>` / `coach-invite-create-ip:<ip>`,
  `coach-invite-manage:<adminId>` / `-ip:<ip>`.
- `createInviteAction(email)`: reject blank/non-string email as `invalid_email`
  before gate/quota; gate admin (`forbidden`); quota (`rate_limited`); call
  `createInvite({ callerRole: "admin", email, invitedBy: gate.userId })`;
  build `link = ${siteUrl}/coach-invite/${token}` where `siteUrl` comes from
  `resolveSiteUrl({ origin: (await headers()).get("origin") })` (same call shape
  as `app/login/actions.ts` reset flow; `unavailable` if resolution fails).
  Map `CoachInviteError` codes through (`forbidden`/`unavailable`/`invalid_email`).
  Returns `{ ok: true, data: { id, link, expiresAt } }` — token appears only
  inside the one-time link, never as a bare field.
- `listInvitesAction()`: gate + quota, then `listInvites({ callerRole: "admin" })`.
  Returns rows as-is (no hash column is ever selected by the lib).
- `revokeInviteAction(id)` / `resendInviteAction(id)`: validate non-empty id
  (`not_found`) before gate/quota; revoke maps lib codes; resend returns a fresh
  one-time `{ id, link, expiresAt }` like create.
- Result type: `{ ok: true; data: T } | { ok: false; code: InviteActionCode }`
  where `InviteActionCode = InviteAdminCode | "forbidden" | "rate_limited"`
  (re-export lib codes; `forbidden` overlaps and collapses).

**Tests** (`app/admin/users/invite-actions.test.ts`, new; follow
`actions.test.ts` + `coach-invites.test.ts` patterns — `mock.module` the
server/admin Supabase factories, `setRequestHeaders` + `nextTestIp()` per test):
- Non-admin (signed-out, student, coach) gets `forbidden` on all four actions
  without touching the service client.
- Blank email → `invalid_email` before any DB call.
- Create success returns `link` ending in `/coach-invite/<43-char base64url>`
  and `expiresAt`, and the insert captured no plaintext token (assert the
  service fake's insert row has `token_hash` ≠ link token, `email` lowercased).
- Revoke/resend/list map lib `not_found`/`unavailable` through.
- List result contains no `token`/`token_hash` key on any row.
- Rate limit: 11 rapid creates from one admin (fresh IPs per other tests, reuse
  one IP here) → 11th is `rate_limited` (note: module-level limiter state; use a
  dedicated IP so other tests stay isolated, per `route-test.ts` rules).

**Verify:** targeted test file run (same runner as Phase 1).

## Phase 3 — Strings, rules, and the Invites section in UsersView

**Changes:**
- `src/admin/strings.ts`: add keys (exact naming; keep the
  `admin.users.*` convention):
  - `admin.invites.heading/intro`, `emailLabel/emailPlaceholder/submit`,
  - `createdLink` (`"Invite link (shown once):"`), `copy/copied`, `expires`
    (`"Expires {expiresAt}"`), `pendingHeading/empty`, `revoke`, `resend`,
    `error.invalid_email`, `error.not_found`, `error.unavailable`,
    `error.forbidden`, `error.rate_limited`,
  - `coach.invite.title/success` (`success` links to `/courses/admin`),
    `error.invalid/not_found/expired/revoked/consumed/email_mismatch/role_unchanged/unavailable/rate_limited`
    — one key per **actual** lib/RPC code (`consumed`, not `used`;
    `email_mismatch` covers the unconfirmed-email fail-closed path; `not_found`
    and `invalid` stay distinct). EN + PT-BR, strict `Record` typing.
- `src/admin/rules.ts`: add `COACH_INVITE_ACCEPT_CODES`
  (`accepted | invalid | not_found | expired | revoked | consumed |
  email_mismatch | role_unchanged`), `INVITE_ACTION_ERROR_CODES`
  (`invalid_email | not_found | unavailable | forbidden | rate_limited`), and
  `coachInviteAcceptKey(code): \`coach.invite.${code === "accepted" ? "success" : \`error.${code}\`}\``
  (pure, keeps the code→message map unit-testable without React).
- `src/admin/UsersView.tsx`: "Invites" section below the role table —
  email input + Create button; on success show link once in a readonly input
  with Copy (uses `navigator.clipboard`, `copied` state) + expiry; pending list
  (client-side filter) with per-row email/expiry + Revoke and Resend buttons;
  errors via `admin.invites.error.*` keys; refresh list after each mutation.
  Reuse `pending`/`role="alert"` patterns from the existing view. No change to
  `app/admin/users/page.tsx` (the view calls the new actions itself).

**Tests:** extend `src/admin/rules.test.ts` — string-table alignment already
  covers new keys via `assertStringTablesAligned`; add "every accept code maps
  to a localized message in both locales" (iterate `COACH_INVITE_ACCEPT_CODES`)
  and same for `INVITE_ACTION_ERROR_CODES`.
**Verify:** rules test file + `npx tsc --noEmit` (catches missing PT-BR keys).

## Phase 4 — Accept page + result component

**Changes:**
- `app/coach-invite/[token]/page.tsx` (new): `export const dynamic =
  "force-dynamic"`; `export const metadata = { robots: { index: false, follow:
  false } }` (same shape as `app/admin/users/page.tsx`). Props `{ params:
  Promise<{ token: string }> }` (Next 16 async-params convention, cf.
  `app/courses/[slug]/page.tsx`). Flow: `token = (await params).token`;
  `getUser` via `createServerSupabase()`; no user →
  `redirect("/login?next=" + encodeURIComponent("/coach-invite/" + token))`
  (do **not** pass through `safeAuthNext` — the value is constructed, and the
  login page re-validates `next` anyway). Rate-limit per IP
  (`createRouteLimiter({ limit: 10, windowMs: 10 min, bindingName: "RL_AUTH" })`,
  key `coach-invite-accept:<ip>`); on exceed render `InviteResult`
  with `code: "rate_limited"` without calling `acceptInvite`. Else
  `acceptInvite({ token, userId: user.id, email: user.email ?? "",
  emailConfirmedAt: user.email_confirmed_at })` and render
  `<InviteResult code={result.code} />`. Catch `CoachInviteError` →
  `InviteResult` with its code. Do not log the raw token.
- `src/admin/InviteResult.tsx` (new, `"use client"`): props `{ code:
  CoachInviteResultCode }` where `CoachInviteResultCode =
  COACH_INVITE_ACCEPT_CODES[number] | "unavailable" | "rate_limited"`;
  locale via `useStudioStore` (same as `UsersView`); message via
  `coachInviteAcceptKey`; success renders the message + a link to
  `/courses/admin`; failures render `role="alert"`.

**Tests:** page logic is covered indirectly — `coachInviteAcceptKey` mapping is
  unit-tested in Phase 3; add accept-page-specific cases to `rules.test.ts`
  if the helper grows branches (e.g. `rate_limited` key). No page-render tests
  (repo convention: pages are thin, logic lives in tested helpers).
**Verify:** `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Phase 5 — E2E + full verification

**Changes:** `e2e/coach-invite.spec.ts` (new, mirrors `admin-users.spec.ts`):
anonymous `page.goto("/coach-invite/<43-char-token>")` → pathname becomes
`/login` and the URL preserves `next` pointing at `/coach-invite/<token>`
(assert `new URL(page.url()).searchParams.get("next")` starts with
`/coach-invite/`). Also assert no invite content renders.

**Verify (all, in order):**
1. `npm test` (full suite — must show zero failures attributable to this change;
   pre-existing `chess.js` `ERR_MODULE_NOT_FOUND` failures, if still present,
   must be proven identical on the clean tree via `git stash` comparison).
2. `npx tsc --noEmit`
3. `npm run lint`
4. `npm run build`
5. `npx playwright test e2e/coach-invite.spec.ts`

## Risks

- **Code-vs-spec code drift** (accept codes `used`/`unconfirmed` vs real
  `consumed`/`email_mismatch`, `returns text` vs `jsonb`): contained by mapping
  the real codes in `coachInviteAcceptKey` and never touching the migration.
  Caught by the per-code localization test + `tsc`.
- **Rate-limiter module state leaking between unit tests**: mitigated with
  `nextTestIp()` per test and a dedicated reused IP only in the 429 test (the
  documented `route-test.ts` convention).
- **Token characters vs `safeAuthNext`**: base64url tokens contain no `/`, `+`,
  or `=` and are 43 chars — path-safe and far under the 512 cap; the login
  page's `safeAuthNext(next)` accepts them after Phase 1.
- **Showing the link "once"**: the token lives only in client state after
  create/resend and is never refetchable (list returns no hash) — a refresh
  loses it by design; the copy in the UI text (`createdLink`) says so.
- **E2E flakiness (auth redirects)**: follow the `admin-users.spec.ts`
  `expect.poll(pathname)` pattern rather than fixed waits.

## Assumptions

- Feature request (planned slice), not a bug; settled decisions reused as-is:
  no email sending, success → `/courses/admin`, token-in-path safe under
  `Referrer-Policy: strict-origin-when-cross-origin`.
- Keep the real lib/RPC codes and the `jsonb` contract; the plan maps them in
  the UI layer instead of changing backend behavior (per the SIG-1062 review
  note suggesting the issue text be updated, not the function).
- Rate limits follow the issue (10 req / 10 min, `RL_AUTH` binding, same shape
  as `app/login/actions.ts`), not the 30/min `/admin/users` precedent, because
  invite minting/accepting is credential issuance; dual user+IP quota on admin
  actions and IP-only quota on the accept page (mirrors `consumeAdminQuota`).
- `resendInviteAction` added although the issue names only three actions —
  requirement 2's "Resend" needs it and lib `resendInvite` already exists.
- Pending filtering stays client-side in `UsersView`; `listInvites` unchanged.
- `ADMIN_USERS_PAGE_SIZE` is already 50 (SIG-1063 resolved the earlier mismatch).
- Executor opens no PR (the build stage owns PR creation); no tests removed.

## Open questions

- None blocking. If the reviewer prefers the 30/min admin-users quota shape for
  invite actions, that is a one-line limiter change with no structural impact.
