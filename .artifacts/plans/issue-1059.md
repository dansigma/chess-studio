# SIG-1059 — Enforce the CSP (Report-Only → enforcing)

## Goal

Switch the Content Security Policy from `Content-Security-Policy-Report-Only` to enforcing
`Content-Security-Policy` with byte-identical directives, tighten the tests so the enforcing
header is pinned (and Report-Only is asserted absent), and record the change plus rollback in the
CHANGELOG. Done means: every `proxy.ts` response carries the enforcing header with unchanged
directives, no Report-Only header is sent, `X-Frame-Options: DENY` still accompanies it, and the
unit + e2e suites prove it.

## Scope

In:
- `src/lib/security-headers.ts` — flip `CSP_HEADER`, update the header comment.
- `src/lib/security-headers.test.ts` — assert enforcing header name + absence of Report-Only.
- `e2e/security-headers.spec.ts` — require `content-security-policy`, keep no-violation checks.
- `CHANGELOG.md` — Unreleased entry: enforcement + one-line rollback.

Out:
- Removing `'unsafe-inline'` from `script-src` (separate research issue).
- Any directive or allowed-host change (no policy content change in this issue).
- Touching `public/_headers`, `proxy.ts` matcher logic, or the report endpoint.

Rejected alternatives:
- Dual-send (enforcing + Report-Only in parallel): adds no signal — directives are identical and
  the report endpoint already receives both `report-uri` and `report-to`; one header keeps the
  surface minimal (rollback stays one line).
- Directive tightening in the same change: conflates enforcement with policy edits; if production
  logs showed a violation it must be a separate policy-adjustment issue first (per the issue).

## Phase 1 — Flip the header to enforcing

Changes (`src/lib/security-headers.ts` only):
- `CSP_HEADER`: `"Content-Security-Policy-Report-Only"` → `"Content-Security-Policy"`.
- Header comment (`:6-8`): rewrite to state the policy is enforcing, give the one-line rollback
  (`Content-Security-Policy` → `Content-Security-Policy-Report-Only`), and note `frame-ancestors`
  is now active (while `X-Frame-Options: DENY` stays as defense-in-depth).
- No change to `buildCsp`, `staticSecurityHeaders`, or `applySecurityHeaders` — `applySecurityHeaders`
  already keys off `CSP_HEADER`, so the flip propagates to every response via `proxy.ts` untouched.

Tests:
- Existing CSP-scoped unit tests (`src/lib/security-headers.test.ts`, `src/lib/csp-report.test.ts`,
  `app/api/csp-report/route.test.ts`) must pass after the rename update in Phase 2.

Verification:
- `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "src/lib/security-headers.test.ts" "src/lib/csp-report.test.ts" "app/api/csp-report/route.test.ts"`
- `rg "Content-Security-Policy-Report-Only" src/ e2e/ proxy.ts` → zero hits outside the rollback
  note in the header comment and CHANGELOG.

## Phase 2 — Pin enforcement in the unit test

Changes (`src/lib/security-headers.test.ts`):
- Rename test `"ships as Report-Only"` → `"ships enforcing"`; assert
  `CSP_HEADER === "Content-Security-Policy"`.
- Extend the `applySecurityHeaders` test: after applying to a `Response`, assert
  `res.headers.get("Content-Security-Policy") === csp` and
  `res.headers.get("Content-Security-Policy-Report-Only") === null`.
- Keep all directive assertions unchanged (no policy content change to prove).

Tests: the updated file itself is the proof; run the same CSP-scoped command as Phase 1.

Verification:
- Same unit command as Phase 1 — 17 tests across the CSP suites, 0 failures.
- `npx tsc --noEmit` (typecheck clean).

## Phase 3 — Tighten the e2e spec

Changes (`e2e/security-headers.spec.ts:10`):
- Replace `headers["content-security-policy"] ?? headers["content-security-policy-report-only"]`
  with a hard requirement: `const csp = headers["content-security-policy"];` plus
  `expect(headers["content-security-policy-report-only"]).toBeUndefined();`
- Keep the directive assertions (`frame-ancestors`, `object-src`, `report-uri`, `report-to`,
  `reporting-endpoints`) and the `securitypolicyviolation` no-violation loop over
  `/login`, `/puzzles`, `/courses` unchanged.

Tests: the e2e spec itself (`npx playwright test e2e/security-headers.spec.ts`).

Verification:
- `npx playwright test e2e/security-headers.spec.ts` — all 4 tests pass, including zero
  `securitypolicyviolation` events on the three pages.
- `npm run lint` clean on touched files.

## Phase 4 — Changelog + full verification

Changes (`CHANGELOG.md`, top of `## Unreleased`):
- New `###` section (e.g. `### Enforce the Content Security Policy (SIG-1059)`):
  one line stating every response now sends enforcing `Content-Security-Policy` with unchanged
  directives, one line giving the one-line rollback
  (`CSP_HEADER` back to `Content-Security-Policy-Report-Only`), and a note that
  `X-Frame-Options: DENY` is unchanged.

Tests: none new; this phase re-runs everything.

Verification (in order):
1. `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "src/lib/security-headers.test.ts" "src/lib/csp-report.test.ts" "app/api/csp-report/route.test.ts"`
2. `npx tsc --noEmit`
3. `npm run lint`
4. `npm run build`
5. `npx playwright test e2e/security-headers.spec.ts`
6. Acceptance re-check: every response carries `Content-Security-Policy` with the same directives
   and no Report-Only header (unit); e2e passes enforcing with no violations on the three pages;
   `X-Frame-Options: DENY` still sent; no test removed or skipped (issue's `Nenhum teste removido
   ou pulado`).

## Risks

- **Undetected production violation becomes a breakage** (e.g. an untested embed, auth redirect,
  or upload host on a page outside the e2e trio). Mitigation: directives are byte-identical to the
  Report-Only policy that has been collecting reports; the e2e no-violation loop covers the main
  surfaces; rollback is one line and documented in two places.
- **`frame-ancestors 'none'` now active** (ignored in Report-Only). Mitigation: `X-Frame-Options:
  DENY` already enforced the same outcome, and the e2e `/login` framing test pins it — no behavior
  change expected.
- **Pre-existing unrelated test failures** (triage baseline: 87 failures in chess/puzzles/admin
  areas, none in CSP files). Mitigation: scope verification to the CSP suites + typecheck + lint +
  build + security e2e; do not chase unrelated failures.

## Assumptions

- Remote verified as `dansigma/chess-studio` on `factory/linear-sig-1059`; triage claims re-verified
  against current code (flip point, `proxy.ts` flow, test pins all unchanged).
- Treated as maintenance (planned hardening); production log review is a human ops gate outside this
  change — the plan proceeds on the issue's premise that the observation window was clean (any real
  violation found later spawns a separate policy-adjustment issue first).
- Directives need no change before enforcing; `unsafe-inline` removal stays out of scope.
- Rollback documentation in both the source comment and CHANGELOG is sufficient; no feature flag or
  env toggle (overkill for a one-line constant).

## Open questions

- Has the week of production `csp-report` log lines been reviewed and confirmed clean for
  YouTube/Vimeo lessons, file videos, board image export, Supabase auth including Google sign-in,
  and legacy course covers? (Human ops gate — blocks safe deploy, not implementation.)
