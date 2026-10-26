# Changelog

## Unreleased

### Repertoire deviations in My Games + Review (SIG-1093)

- New `src/lib/my-games/deviation-for-game.ts`: `deviationForGame({ pgn, color, repertoireTree | null })` returns the
  SIG-1040 deviation event or `null` (no repertoire marked for the side, or missing/empty/unparseable PGN), plus
  `deviationBadgeText` / `deviationReviewText` sentence builders over whole-sentence EN + PT-BR templates.
- My Games rows show a compact badge against the marked repertoire board for the row's color ("Left your repertoire at
  7…Nf6" / "Opponent novelty at 9…h5" / "Line ended"; nothing when no repertoire is marked, with a one-line hint in the
  list header pointing to the board menu). Badges are memoized per page + repertoire trees.
- The Review panel shows a single deviation line below the report card for the active board's orientation ("You left
  your repertoire at 7…Nf6; your line is 7…Be7" / "Your repertoire has no answer to 9…h5"), engine-independent.
- Six new keys in `src/i18n/repertoire-strings.ts` (EN + PT-BR).

### Repertoire board marks (SIG-1092)

- A board can be marked as the White or Black repertoire from the board context menu ("Use as White repertoire" /
  "Use as Black repertoire", plus "Remove repertoire mark" when marked; EN + PT-BR). Each user holds at most one
  board per color: marking a second board moves the mark, clearing the first.
- New migration `20261021220000_boards_repertoire_color.sql`: nullable `boards.repertoire_color` (`white`/`black`
  check) with partial unique index `boards_user_repertoire_color_uq` (no RLS change; own-row policies cover it).
- The autosave persists unmarks before marks so moving the mark between two saved boards cannot collide on the
  unique index. Guests persist their boards locally (`studio-clone-guest-boards`: PGN + metadata), so marks survive
  a browser reload; signing in clears the guest snapshot and loads the account boards from Supabase.

### Coach role: database foundation (SIG-1049)

- New migration `20261021120000_marketplace_roles.sql`: `profiles.role` now accepts `coach` (besides `student` and
  `admin`), `profiles.role_source` (`system` or `manual`) records how a role was set, and two tables, `role_changes`
  (audit log of role changes, with a required reason) and `coach_invites` (hashed, single-use, expiring invite tokens),
  are created. Both tables are closed to clients (RLS deny-all, no grants); only the service role can use them.
- No behavior changes yet: nothing reads the new role or tables until the following slices (authorization from the
  database, role management, invites). The RLS contract test covers the new constraints and tables.

### Coach invites: create, revoke and accept, server side (SIG-1062)

- New migration `20261021140000_accept_coach_invite.sql`: `accept_coach_invite` (security definer, empty search path,
  execute granted only to the service role) locks the invite row and enforces the guard chain (`invalid`, `not_found`,
  `expired`, `revoked`, `consumed`, `email_mismatch`, `role_unchanged` — admins are never downgraded). On success it
  marks the invite consumed, promotes `student` to `coach` with `role_source = 'manual'`, and writes a `role_changes`
  audit row (`coach invite accepted`).
- New module `src/lib/admin/coach-invites.ts` (service role only): `createInvite` mints a 32-byte base64url token valid
  7 days and stores only its SHA-256 hash (the raw token is returned once for the admin to copy — no email is sent);
  `revokeInvite`, `resendInvite` (revoke + fresh token), `listInvites`, and `acceptInvite` (confirmed email required,
  hash-then-RPC) complete the slice. Every function takes the caller's `getRole`-resolved role and throws `forbidden`
  for non-admins; the RLS contract test pins the migration and the unit suite covers the module.

### CSP violation reports (SIG-1054, part 1)

- New endpoint `POST /api/csp-report` that accepts both `application/csp-report` (`report-uri`) and
  `application/reports+json` (Reporting API). It caps the body at 64 KB, allows 60 reports per minute per IP,
  logs one line per violation (`csp-report <disposition> directive=… blocked=<host> path=<path>`, at most 20 per
  request) and returns an empty response (it never echoes the input). Only the blocked host and the document path
  are logged, never full URLs or query strings. The parsing lives in `src/lib/csp-report.ts`.
- The CSP now has `report-uri /api/csp-report` and `report-to csp-endpoint`, and every response sends
  `Reporting-Endpoints: csp-endpoint="/api/csp-report"`. The policy is still Report-Only; it gets enforced after a
  week of production reports has been reviewed.
- `proxy.ts` skips the Supabase session refresh for `/api/csp-report`, so a burst of reports costs no auth calls.
- `readCapped` now also takes an incoming `Request`.

### Google sign-in and legal pages (SIG-1057)

- The login page has a "Continue with Google" button on the sign-in and sign-up tabs. It starts the OAuth flow
  from the browser (`signInWithOAuth`), so it does not depend on the CSP `form-action` directive, and returns
  through the existing `/auth/callback`. The post-login target goes through `safeAuthNext` (helper in
  `src/lib/auth/oauth.ts`). The button is hidden when Supabase is not configured.
- New pages `/privacidade` (Privacy Policy, LGPD) and `/termos` (Terms of Use), statically rendered, with
  Portuguese first and the English version below on the same page; `/privacy` and `/terms` redirect to them.
  The controller is Sigma Labs Tecnologia da Informação LTDA, trading as Xadrez Digital (CNPJ 62.281.698/0001-18,
  contato@xadrez.digital), last updated 21 October 2026, with São Paulo/SP as the chosen forum. Company data
  lives in `src/lib/legal/config.ts`.
- Links to both pages on the login page (consent line) and in a footer on the courses and puzzles pages.

### Security headers (SIG-1033)

- Every page and API response now sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin` and, in production, `Strict-Transport-Security`
  (1 year, includeSubDomains). `/login` and `/courses/admin` can no longer be framed.
- A Content Security Policy is sent as `Content-Security-Policy-Report-Only` (set in `proxy.ts`, policy in
  `src/lib/security-headers.ts`), so nothing is blocked yet; enforcing it is a one-line change once a deploy shows
  no violations. Scripts are limited to the site itself plus inline scripts; there is no nonce, so pages keep their
  static rendering and the course pages keep their 60s cache. The `/engine` assets and COOP/COEP on `/studio` are
  unchanged.

### Sign-in and password security (SIG-1031)

- Password sign-in is rate-limited per IP and per email: 10 attempts per 10 minutes each. Further attempts get
  "Too many attempts. Wait a few minutes and try again.", with the same message whether or not the account exists.
- Choosing a new password now goes through the server. It requires a valid session, enforces the 10-character
  minimum and the confirmation match on the server, and is rate-limited per user and per IP. Leading and trailing
  spaces are trimmed, as they already were at sign-up and sign-in.

### Fixes

- Starting a review right after cancelling another one could leave the engine stuck, with each position
  waiting out its timeout. The engine client now waits for a stopped search to report before starting the
  next one. If the engine does stop answering, the review stops after a few positions with a message instead
  of grinding through every timeout.

### Game Review explanations (SIG-961)

- New "Why?" block in the Review panel for the move the board is on. It opens by default for Brilliant, Miss,
  Mistake and Blunder and stays collapsed for the rest. Every sentence is backed by the position facts (threats,
  pins, hanging pieces, mates, sacrifices); when nothing can be proven it shows only the engine's view.
- Hovering a sentence highlights the squares involved on the board (transient, never saved to the game);
  sentences about the position before the move briefly show that position.
- The engine's best line is shown as clickable moves and opens as a variation.
- Explanations follow the site language (English / Português do Brasil); fresh installs seed it from the
  browser language until the user picks one (SIG-971).

### Game Review (SIG-960)

- **Accuracy values shift slightly.** Player accuracy is now the average of a volatility-weighted mean and a
  harmonic mean (move accuracies floored at 10 in the harmonic part) instead of the plain harmonic mean.
  Per-phase accuracy uses the same model, so figures differ slightly from earlier reviews.
- Every position is analysed with 3 engine lines. New depth presets next to "Review game": Fast (10),
  Standard (12, default) and Deep (16).
- Forced moves (one legal reply) get a `forced` label, are listed apart from the tiers and are excluded from
  accuracy, average loss and tier counts.
- Finished reviews are cached in memory per line, depth preset and engine build, so switching panels or
  re-opening the same line is instant. They are also persisted in IndexedDB (SIG-965), so a reload,
  a new tab or a deploy no longer discards minutes of analysis; saved reviews show a "Saved review"
  hint and can be cleared via Settings → Game Review.
- Progress bar with an estimated time and a Cancel button; cancelling keeps the progress made so far.
- Each position is searched from a clean engine hash, so a review is not affected by Show threat or by
  restarted searches.
- **"Great" is assigned far more often.** With three lines always available, a best move that beats the
  second-best line by more than 10 win-chance points is now marked Great; before, that needed the extra
  two-line pass that only ran for sacrifices. Compared on Standard depth against the old pipeline (Morphy's
  Opera Game and Kasparov–Topalov 1999): Great went from 0 to 6 of 33 moves and from 0 to 24 of 87 moves, taken
  mostly from Perfect. A few other moves also change tier (Perfect vs Very good) because searching 3 lines gives
  slightly different depth-12 scores than searching 1.
