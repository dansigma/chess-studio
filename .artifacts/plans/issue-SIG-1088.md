# SIG-1088 — My Games 2/5: incremental import into per-user `my_games` — Implementation Plan

## Goal

Give the app a stable per-user store of recent public games: a new `POST /api/my-games/sync` route fetches only-what-is-new for each of the signed-in user's linked Lichess/Chess.com accounts (up to 200 games/sync, 90-day lookback on first sync, ≤6 syncs/hour/user), persists them into a new `public.my_games` table with `(user_id, source, external_id)` dedupe, and advances `linked_accounts.last_synced_at` — proven by loader/route/mapper tests, RLS contract tests, and the standard verification suite (`npm test`, `lint`, `tsc --noEmit`, build, migration applies).

## Scope

**In:**

- Migration `supabase/migrations/20261021200000_my_games.sql`: `public.my_games` table + own-row RLS (select/insert/delete only, no update) + `(user_id, played_at desc)` index + grants to `authenticated`.
- `src/lib/supabase/database.types.ts`: `my_games` Row/Insert/Update entries.
- `src/lib/supabase/rls-contract.test.ts`: new `describe` block asserting the migration contract.
- Loaders: `lichessGamesSince(username, sinceMs, max)` in `src/lib/players/lichess.ts`; `chesscomGamesSince(username, sinceMs, max)` in `src/lib/players/chesscom.ts` (+ tests in the existing `*.test.ts` files). Existing `lichessGames`/`chesscomGames` become thin wrappers so `players-server.ts` and the `/api/players/games` route are untouched.
- Mapper: `src/lib/my-games/game-row.ts` (`playerGameToRow`) + `src/lib/my-games/game-row.test.ts`.
- Route: `app/api/my-games/sync/route.ts` + `app/api/my-games/sync/route.test.ts`.
- Binding config: add an `RL_SYNC_HOUR`-style rate-limit binding in `cloudflare.config.ts` if the chosen approach needs edge enforcement distinct from `RL_30_MIN`/`RL_AUTH` (see Phase 5 assumptions; fallback-only is acceptable with a recorded reason).

**Out (same as issue):** list UI (3/5), batch review (4/5), statistics (5/5), background/scheduled syncing, OAuth, upstream account-existence checks.

## Phase 1 — Migration + types + RLS contract test

Changes:

- `supabase/migrations/20261021200000_my_games.sql` (new), following the `linked_accounts` migration (`20261021190000_linked_accounts.sql`) and `repertoire_progress` (`20261013120000_repertoire_progress.sql`) patterns: `create table if not exists public.my_games (...)` with columns exactly per the issue (`id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users on delete cascade`, `source text check in ('lichess','chesscom')`, `external_id text not null`, `played_at timestamptz`, `color check in ('white','black')`, `result check in ('win','loss','draw')`, `time_class text`, `white/black text`, `white_elo/black_elo int`, `eco/opening text`, `ply_count int`, `pgn text not null check (octet_length(pgn) <= 1000000)`, `created_at not null default now()`), `unique (user_id, source, external_id)`, `create index if not exists my_games_user_played_idx on public.my_games (user_id, played_at desc)`, `enable row level security`, three policies `my_games_select_own` / `my_games_insert_own` / `my_games_delete_own` all wrapped as `(select auth.uid()) = user_id` (no update policy), `grant select, insert, delete on public.my_games to authenticated`.
- `src/lib/supabase/rls-contract.test.ts`: new block reading the migration file asserting RLS enabled, the three policy names, zero unwrapped `auth.uid()`, grant scoped to `authenticated` (no anon/public/service_role), unique constraint, pgn size check, and the played_at index.
- `src/lib/supabase/database.types.ts`: add `my_games` Row/Insert/Update (`source: "lichess" | "chesscom"`, `color: "white" | "black" | null`, `result: "win" | "loss" | "draw" | null`, matching nullability of the issue).

Tests: RLS contract suite (`node --test` on the file) — must fail if RLS, a policy, the unique constraint, or the pgn check is removed (acceptance-criteria style, mirroring the linked_accounts tests).

Verification: `npm test -- src/lib/supabase/rls-contract.test.ts`-equivalent via repo `npm test` filter; `npx tsc --noEmit`; `supabase start`/CI migrations job applies cleanly on a fresh DB.

## Phase 2 — Incremental loaders (`lichessGamesSince`, `chesscomGamesSince`)

Changes:

- `src/lib/players/lichess.ts`: extract the existing NDJSON parsing/normalization body into a shared helper taking a `max` param; add `export async function lichessGamesSince(username, sinceMs, max)` building `?max={max}&since={sinceMs}&clocks=false&evals=false&opening=true&moves=true` (Lichess `since` = ms epoch), reusing `readCapped` + existing normalizers, returning `PlayerGame[]` newest-first; keep `lichessGames(username)` as `lichessGamesSince(username, 0, MAX_PLAYER_GAMES)` semantics (no `since` param when `sinceMs <= 0`) so callers are unaffected.
- `src/lib/players/chesscom.ts`: add `export async function chesscomGamesSince(username, sinceMs, max)` that fetches the archives list (existing 512 KB cap), selects archives from newest back to the archive month containing `sinceMs`, fetches each month via existing `fetchArchive`, filters games with `end_time*1000 > sinceMs` (or all when `sinceMs <= 0`), normalizes via `compactChesscomGame`, stops at `max`, returns newest-first; bound the walk (e.g. stop after the `sinceMs` month; cold 90-day histories touch ≤ ~4 month archives in practice) and document the bound. Keep `chesscomGames(username)` as `chesscomGamesSince(username, 0, MAX_PLAYER_GAMES)` but preserve its current observable behavior for the 2-archive common path — or keep the old body verbatim and delegate only if behavior-identical; executor decides and records which.
- Constants: do not change `MAX_PLAYER_GAMES = 80` (display path); the sync cap (200) lives in the route, not shared.

Tests (extend `src/lib/players/lichess.test.ts`, `src/lib/players/chesscom.test.ts` with `mockFetch` from `src/test-utils/route-test.ts`):

- `since` is sent on the Lichess URL when provided, absent/zero when not.
- Paging stops at `max` (fake multi-page/capped payload).
- Chess.com month walk: archives newest→`sinceMs` month; games older than `sinceMs` excluded; cap respected.
- Oversize-body behavior preserved (existing `UpstreamPayloadTooLargeError` tests keep passing).

Verification: `npm test` for the two loader suites; `npx tsc --noEmit`; `npm run lint` on touched files.

## Phase 3 — Row mapper `playerGameToRow`

Changes (`src/lib/my-games/game-row.ts`, new, pure function, no Supabase import):

- `playerGameToRow(userId: string, source: "lichess" | "chesscom", game: PlayerGame): Database["public"]["my_games"]["Insert"] | null` mapping: `external_id = game.id`, `played_at = game.playedAt ? new Date(game.playedAt).toISOString() : null`, `color = game.color`, `result = game.playerResult`, `white/black (+elos)`, `eco/opening` (null-safe), `time_class = game.timeClass ?? null`, `ply_count` = token count of `game.moves` (`moves.split(/\s+/).filter(Boolean).length`, 0 when absent), `pgn` = `game.pgn` truncated to fit the 1 MB `octet_length` check (truncate by UTF-8 bytes, not chars; executor picks exact helper), `created_at` omitted (DB default).
- Return `null` when the row cannot satisfy NOT NULL constraints (`!game.id`, `!game.pgn` after truncation/empty) so the route skips instead of failing the sync; games with `played_at: null` map to `played_at: null` but must not advance `last_synced_at` (route concern, Phase 4).

Tests (`src/lib/my-games/game-row.test.ts`, new): full mapping incl. `playedAt`→ISO, `moves`→`ply_count`, null-safe fields, oversize-pgn truncation within 1 MB, `null` for missing id/pgn.

Verification: `npm test` on the mapper suite; `tsc --noEmit`.

## Phase 4 — `POST /api/my-games/sync` route + tests

Changes (`app/api/my-games/sync/route.ts`, new), following `app/api/masters-pgn/route.ts` (limiter + `clientIp`) and `app/login/update-password/actions.ts` (per-user + per-IP dual limiter):

- Session: `createServerSupabase()`; `auth.getUser()`; no user → 401 `{ error: ... }`. No Supabase config → 503-style unavailable (mirror existing unavailable handling; executor picks 503 with reason recorded).
- Rate limits before any upstream fetch: per-user 6/hour (`rateLimitKey("my-games-sync", user.id)`), per-IP 20/hour (`rateLimitKey("my-games-sync-ip", ip)`); either exhausted → 429 with `Retry-After`. Module-level `createRouteLimiter` instances (hour windows; see Phase 5 for binding).
- Load linked accounts via `loadLinkedAccounts(supabase)` (reuse `src/lib/my-games/linked-accounts.ts`); `unavailable` → 502; empty accounts → 200 `{ imported: 0, accounts: [] }`.
- Per account, sequentially or with bounded concurrency (executor picks; sequential is the default assumption): `sinceMs = lastSyncedAt ? Date.parse(...) : Date.now() - 90d`; fetch `lichessGamesSince`/`chesscomGamesSince(username, sinceMs, remaining)` with `remaining = 200 - totalImported`; per-account `try/catch` → `{ source, imported: 0, error: "upstream_unavailable" }` without failing siblings; map via `playerGameToRow`, skip `null`s; insert with `on conflict do nothing` semantics on `(user_id, source, external_id)` — executor picks the supabase-js spelling (`upsert(..., { onConflict: "user_id,source,external_id", ignoreDuplicates: true })` per `player-bookmarks.ts:129` precedent, or insert-then-ignore) and records it; only count actually inserted rows (supabase returns inserted rows; duplicates excluded).
- Advance `last_synced_at` per successfully contacted account to the newest fetched `played_at` (ISO string) via `supabase.from("linked_accounts").update(...)` — update even when 0 new rows inserted (dedupe hit) as long as upstream was reached; never advance on upstream failure or when all fetched games have `played_at: null`; malformed stored `last_synced_at` → treat as first sync (90d).
- Response: 200 `{ imported: total, accounts: [{ source, imported, error? }] }` in linked-account source order.

Tests (`app/api/my-games/sync/route.test.ts`, new; follow `route-test.ts` holder + `nextTestIp` isolation patterns, dynamic import after `mock.module` for the server client):

- 401 anonymous; 401/503 without session (mirror repo conventions).
- 429 on 7th sync within the hour from one user (fresh limiter or injected `now` seam), with `Retry-After`.
- Incremental: seed fake `my_games` with rows; second sync sends `since` equal to stored `last_synced_at`, inserts 0 new, still 200.
- Per-account isolation: lichess fetch throws → chess.com still imports; response reports the failed entry.
- `last_synced_at` write assertions (advanced on success with dated games, untouched on failure).

Verification: `npm test` on the route suite; full `npm test`; `npm run lint`; `npx tsc --noEmit`; `npm run build`.

## Phase 5 — Bindings, contract updates, full verification

Changes:

- If edge enforcement is wanted for the hour-window limiter, add `RL_SYNC_HOUR` binding (`namespace: "1004"`) to `cloudflare.config.ts` mirroring `RL_AUTH`, and reference it from the sync route's limiters; otherwise record why the in-process fallback suffices (hour windows already rely on fallback per `rate-limit.ts:161-169`).
- Re-check `database.types.ts` completeness and that no `Update` policy/type for `my_games` client writes was added (Update type may exist as `Record<string, never>`-style or minimal; keep consistent with the no-update-policy decision).

Verification (all, in order): `npm test` · `npm run lint` · `npx tsc --noEmit` · `npm run build` · migration applies on fresh DB (`supabase start` / CI `migrations` job). Acceptance mapping: second-sync-0-rows + `since` == stored value (route test); failure isolation (route test); 401 + 7th-sync-429 (route tests); no tests removed/skipped (full suite green).

## Risks

- Chess.com cold-sync fan-out: a 90-day lookback could span several monthly archives; mitigated by the month-walk bound + `max` cap + per-month `readCapped`, but a pathological account (thousands of games/month) still costs N month fetches — watch test timing and document the bound.
- Lichess `since` semantics (ms vs s): wrong unit silently over/under-fetches; the loader test asserting the exact query param + a dated-game fixture discriminates.
- `playerGameToRow` pgn truncation vs 1 MB `octet_length` check: char-length truncation can still exceed the byte check on multibyte PGNs — truncate by UTF-8 bytes; mapper test covers a multibyte case.
- `last_synced_at` advancement on dedupe-only syncs: advancing is correct (upstream reached, nothing new) but must not mask clock skew; never advance on failure/null dates.
- Hour-window rate limiting relies on the in-process fallback (Cloudflare bindings express 10s/60s periods); multi-isolate drift is accepted per existing `rate-limit.ts` design — record if edge binding added or not.

## Assumptions

- Triage claims re-verified: `lichessGames` has no `since` (`lichess.ts:194-196`), `chesscomGames` reads last two archives (`chesscom.ts:136-173`), `linked_accounts.last_synced_at` has no writer, no `my_games` code exists.
- Sync budget semantics: 200 total across accounts per sync (not per account); `remaining` shrinks per account in source order (lichess, chesscom).
- `external_id = PlayerGame.id`; dedupe scope `(user_id, source, external_id)` also isolates chess.com synthetic fallback ids.
- RLS = exactly three own-row policies (select/insert/delete), `(select auth.uid())` wrapping, grants to `authenticated` only — the issue's "select and delete only … add the insert policy too, no update policy" read literally.
- Lichess `since` unit is ms epoch; chess.com has no `since`, hence month-walk.
- Null-`played_at` games never advance `last_synced_at`; malformed stored timestamps fall back to 90-day lookback.
- Route uses the user's session client for all DB writes (RLS-enforced); no service-role involvement.
- Alternatives rejected: background/scheduled sync (explicitly out of scope); single shared limiter instead of per-user+per-IP (issue mandates both); replacing `lichessGames`/`chesscomGames` instead of wrapping (blast radius — display path untouched).

## Open questions

- None — caps (200/90d/6-per-hour), lookback, quotas, and schema are stated as already decided in the issue; no product trade-off is left open.
