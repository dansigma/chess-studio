# Changelog

## Unreleased

### Chess.com removed from the Databases panel (SIG-1270)

- Chess.com has no shared games database (its API is per-username), so it no longer appears under Databases
  ("3 sources"). Searching a Chess.com player and the Chess.com source in the explorer panel are unchanged.
- The selected database was never persisted (it resets to Masters on reload), so no saved value needs migrating.

### Transparent puzzle XP and a growing level curve (SIG-1234)

- XP is `20 x difficulty (0.5-2.0) x speed (1.0-1.5) x first try (1.2)`, rounded once, and the panel shows the
  sum after every puzzle ("+42 XP · 20 solved × 1.4 hard × 1.5 fast") in every mode, en and pt-BR. Hints remove
  the speed and first-try bonuses; a missed puzzle gives 0. Mistakes practice and a repeated daily show the
  breakdown but add nothing to your XP.
- Level n costs `round(100 * 1.3^(n-1))` XP (flat after level 20); the level bar shows "XP to level N".
  Levels are recalculated from stored total XP, so some players will drop a level.
- `puzzlePoints` and `XP_PER_LEVEL` are gone; the rules live in `src/puzzles/xp.ts`. The scoring hook exposes
  `xpResult` and `sessionXp` for the session summary (SIG-1235).

### Opening book v3 tooling and a safer zstd build (SIG-1229, SIG-1227)

- Book rule: the move share went from 3% to 1% (`BOOK_RULE` version 2, shared with the explorer path); the
  100-game position and 20-game move floors are unchanged.
- `build-book.mjs --profile masters | correspondence` (default `lichess`): over-the-board and correspondence
  PGN databases with their own Elo bars (2100 FIDE / 2300 ICCF), online-game and live-clock exclusion,
  de-duplication by normalized players + Date + Round + first 40 plies (also across input files), and a rule
  that a move is theory only if at least 5 distinct players made it. Bounded memory is kept (player sets
  survive spilling; spilled builds stay byte-identical).
- `union-books.mjs` merges built books into the one file the app reads (a pair is in if it is theory in any
  input) and writes a manifest with a `sources` list; `inspect-book.mjs` retries partial explorer answers and
  never compares them.
- SIG-1227: a decompressor that exits non-zero, is killed or cannot start now fails the build with a clear error
  and writes nothing (no book, no manifest, no `--app-manifest`); the pipe is read with backpressure; stdin cut
  mid-game warns; `--min-games-read` aborts a suspiciously small input and `--months` warns about one.
  The runbook now recommends `zstd -dc ... | node ... -` on every OS (`cmd /c` on Windows).
- Licenses: the masters inputs are Chess-Results, AJ-OTB and Lumbra's CC BY-SA 4.0 Lichess Broadcast PGN only (the
  full Lumbra DB is CC BY-NC and must not be used); `--license` / `--attribution` are recorded per source in the
  manifests; see "Licenses and attribution" in `docs/opening-book.md`.

### Game Review: local opening book (SIG-1226)

- Book moves now come from a local book built offline from the Lichess open database (both players 2300+,
  blitz/rapid/classical, first 40 plies, same rule and constants as the explorer book). The file is fetched
  lazily on the first review, kept in memory, cached by the browser, and served from R2 (`book/<file>` in the
  engine bucket, via `app/book/[...path]`). The explorer route is only asked when the file is not available
  within 3 s or the game is still in book at ply 40.
- Build tooling in `scripts/opening-book/` (streaming PGN reader, bounded-memory counting with spill to disk,
  synthetic PGN generator, inspect/compare tool) and a runbook in `docs/opening-book.md`. The real one-month
  build and the R2 upload are still to be run; until then the app falls back to the explorer book.
- Binary format: gzip of header + delta-encoded sorted 64-bit position keys + 16-bit move codes
  (`src/chess/opening-book-format.ts`). The review cache key includes the book manifest version.

### Game Review: opening book before the engine (SIG-1225)

- The book is resolved first and the engine only analyzes from the last book position onward (that position's
  score grades the first out-of-book move). Book moves get the `book` label, are not scored and stay out of
  accuracy, rating, phases, pace and key moments; the eval chart shades them as a "Book" band with no curve.
- Source is the Lichess games explorer (`ratings=2200,2500`, `speeds=blitz,rapid,classical`). A move is theory
  while its position has at least 100 games and the move has at least 20 games and 3% of the position; the book
  ends at the first move that fails, for either side, and never resumes on transposition. Constants live in
  `BOOK_RULE` (`src/chess/opening-theory.ts`).
- One request per review: new `POST /api/explorer/book` walks the explorer server-side (server Lichess token,
  `explorer_cache` under its own `lichess-book-v1-...` source so it cannot collide with masters/lichess entries,
  about 8 s total and 2.5 s per request, rate-limited). Non-standard start positions (FEN, Chess960) have no book.
- If the explorer is unavailable the review still runs with every position scored, shows "Opening book
  unavailable", and is not cached so the next open retries the book.
- The review cache key includes the book version, so masters-only reviews recompute once.
- Removed the per-ply masters request (`book-replies.ts`).

### Game Review: dedicated review engine (SIG-1223)

- The review no longer shares the analysis panel's worker or settings. It always runs Stockfish 19 lite
  (`/engine/stockfish.js`, the single-thread build of the same NNUE net as `stockfish-lite.js`) at Threads 1, in
  its own `ReviewEnginePool` (`src/engine/review-pool.ts`): `min(4, max(1, cores - 1))` workers, positions
  scored concurrently, each with the same depth, MultiPV 3 and fresh hash as before, so labels and accuracy are
  unchanged. Settings engine build/threads now only affect the analysis panel and the eval graph (Settings says so).
- No preemption: the analysis panel and Show threat neither stop nor wait for the review, and vice versa. The
  `review` and `batch` slots are removed from `shared-engine`; the My Games batch queue uses a one-worker pool.
- `reviewCacheKey` no longer includes the Settings engine build. Reviews cached from the lite build stay valid;
  reviews cached from the full build are not reused (one re-review).
- Cancel terminates every pool worker; progress counts positions finished across workers.
- Test-only: `NEXT_PUBLIC_REVIEW_POOL_SIZE` forces the pool size (benchmarks on small machines).

### Enforce the Content Security Policy (SIG-1059)

- Every response now sends the policy as enforcing `Content-Security-Policy` (same directives as
  before, via `CSP_HEADER` in `src/lib/security-headers.ts`); no `Content-Security-Policy-Report-Only`
  header is sent. `X-Frame-Options: DENY` is unchanged.
- Rollback: change `CSP_HEADER` back to `"Content-Security-Policy-Report-Only"` (one line).

### Workers Logs persisted in worker config (SIG-1176)

- `cloudflare.config.ts` now declares `observability.logs` (`enabled`, `invocationLogs`, `persist`),
  matching the dashboard setting enabled on Oct 30 2026, so GitHub deploys no longer reset it.
  Logs-only; Traces and Logpush stay off. This restores storage of `csp-report …` lines for the
  SIG-1059 one-week review.

### Repertoire deviation fixes: "Train this line" / "Add to repertoire" (SIG-1094)

- New pure helpers in `src/chess/repertoire-actions.ts`: `findPathToPosition` (DFS pre-order path to a FEN,
  transposition-aware), `withMoveDue` (marks a repertoire move due, preserves interval/ease), and
  `addOpponentMove` (appends the opponent novelty once via `playMove` dedupe).
- New store actions in `src/store/slices/repertoire-actions.ts`: `trainDeviationLine` activates the side's
  repertoire board at the deviation position, marks the repertoire's own move due, and starts training there;
  `addGapToRepertoire` derives the post-move FEN from the event via chess.js, appends the novelty once, selects
  it, and asks for the user's reply. Both fail closed with an explanatory status when no board is marked.
- My Games rows and the Review panel render the one-click fix ("Train this line" for user deviations, "Add to
  repertoire" for opponent gaps; EN + PT-BR), disabled with an explanatory tooltip when the side has no marked
  repertoire board.
- Six new keys in `src/i18n/repertoire-strings.ts` (EN + PT-BR).

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
