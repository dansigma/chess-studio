# Implementation Plan - SIG-930: API: cap upstream response size and tolerate malformed NDJSON in game proxies

## Goal
Implement a robust byte-capping response stream reader `readCapped` and integrate it across upstream game proxy endpoints (`masters-pgn`, `players/lichess`, `players/chesscom`) to prevent unbounded memory/CPU consumption in Cloudflare Workers. Make NDJSON parsing in `lichessGames` tolerant of malformed or corrupted lines (skipping and logging a warning instead of failing the batch), re-throw upstream failures in `loadPlayerGames`, and return HTTP 502 (Bad Gateway) instead of 400 when upstream endpoints fail or exceed payload limits.

## Scope
- **In scope**:
  - New helper module `src/lib/read-capped.ts` exporting `readCapped(response: Response, maxBytes: number): Promise<string>` and custom error `UpstreamPayloadTooLargeError`.
  - Comprehensive unit test suite `src/lib/read-capped.test.ts`.
  - Integration of `readCapped` into `app/api/masters-pgn/route.ts` with a 1 MB limit and HTTP 502 response on over-capacity.
  - Integration of `readCapped` into `src/lib/players/lichess.ts` with a 2 MB limit (sized for `MAX_PLAYER_GAMES = 80`).
  - Integration of `readCapped` into `src/lib/players/chesscom.ts` for archive and monthly games endpoints.
  - Fault-tolerant NDJSON line parsing in `src/lib/players/lichess.ts` with `try/catch` and `console.warn`.
  - Propagating upstream errors in `src/lib/players-server.ts` so `app/api/players/games/route.ts` returns HTTP 502 on upstream failure / over-limit.
  - Updating `app/api/players/games/route.ts` error handler to return 502 (was 400).
  - Updating and expanding unit/integration tests in `app/api/players/games/route.test.ts`, `app/api/masters-pgn/route.test.ts`, and `src/lib/players/lichess.test.ts`.
- **Out of scope**:
  - Pagination of player games (explicitly stated in SIG-930 description).
  - Modifying client-side UI components (`GamesPanel.tsx`, `PlayerGamesPanel.tsx`) beyond verifying graceful handling of 502.
  - Changes to other unrelated API routes (`explorer`, `puzzles`).

## Phases

### Phase 1: Implement `readCapped` Utility and Unit Tests
- **Files**:
  - `src/lib/read-capped.ts` (new)
  - `src/lib/read-capped.test.ts` (new)
- **Changes**:
  - Define `UpstreamPayloadTooLargeError` extending `Error`.
  - Implement `readCapped(response: Response, maxBytes: number): Promise<string>`:
    1. Check `Content-Length` header if present. If `parsedLength > maxBytes`, immediately throw `UpstreamPayloadTooLargeError`.
    2. If `response.body` is null, return empty string `""`.
    3. Obtain stream reader via `response.body.getReader()`.
    4. Stream chunks using `TextDecoder("utf-8")` with `{ stream: true }`, maintaining cumulative byte count `totalBytes`.
    5. If `totalBytes > maxBytes`, call `await reader.cancel()` and throw `UpstreamPayloadTooLargeError`.
    6. Return decoded string after stream ends and decoder is flushed.
- **Tests**:
  - Verify payload within `maxBytes` decodes completely.
  - Verify `Content-Length` header exceeding `maxBytes` rejects immediately without reading body.
  - Verify chunked / compressed stream exceeding `maxBytes` mid-stream cancels reader and throws `UpstreamPayloadTooLargeError`.
  - Verify empty response body returns empty string.
  - Verify multi-byte UTF-8 split across chunk boundaries decodes cleanly.
- **Verification**:
  - `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "src/lib/read-capped.test.ts"`

### Phase 2: Apply `readCapped` to `masters-pgn` Route
- **Files**:
  - `app/api/masters-pgn/route.ts`
  - `app/api/masters-pgn/route.test.ts`
- **Changes**:
  - In `app/api/masters-pgn/route.ts`:
    - Import `readCapped` and `UpstreamPayloadTooLargeError` from `@/src/lib/read-capped`.
    - Set `MAX_MASTERS_PGN_BYTES = 1024 * 1024` (1 MB).
    - Replace `await upstream.text()` with `await readCapped(upstream, MAX_MASTERS_PGN_BYTES)`.
    - If `readCapped` throws `UpstreamPayloadTooLargeError`, immediately return `NextResponse.json({ error: "Upstream response too large" }, { status: 502 })`.
- **Tests**:
  - In `app/api/masters-pgn/route.test.ts`:
    - Add test: upstream response exceeding 1 MB returns HTTP 502.
    - Ensure existing tests (missing id, malformed id, book hit, Lichess fallback, 404 on miss, 429 rate limit) continue passing.
- **Verification**:
  - `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "app/api/masters-pgn/route.test.ts"`

### Phase 3: Apply `readCapped` and Fault-Tolerant NDJSON Parsing to Player Proxies
- **Files**:
  - `src/lib/players/shared.ts`
  - `src/lib/players/lichess.ts`
  - `src/lib/players/chesscom.ts`
  - `src/lib/players-server.ts`
  - `app/api/players/games/route.ts`
  - `src/lib/players/lichess.test.ts`
  - `app/api/players/games/route.test.ts`
- **Changes**:
  - In `src/lib/players/shared.ts`:
    - Export `MAX_PLAYER_GAMES_BYTES = 2 * 1024 * 1024` (2 MB, sized for `MAX_PLAYER_GAMES = 80`).
  - In `src/lib/players/lichess.ts`:
    - In `lichessGames`: replace `await response.text()` with `await readCapped(response, MAX_PLAYER_GAMES_BYTES)`. Preserve existing `next: { revalidate: 120 }`.
    - In NDJSON line loop: wrap `JSON.parse(line)` in `try/catch`. On parse error, log with `console.warn("Skipping malformed NDJSON line from Lichess", { line, error })` and continue to the next line.
  - In `src/lib/players/chesscom.ts`:
    - In `fetchArchive`: read `monthResponse` using `readCapped(monthResponse, MAX_PLAYER_GAMES_BYTES)` and parse JSON safely. Preserve `next: { revalidate: 120 }`.
    - In `chesscomGames`: read `archivesResponse` using `readCapped(archivesResponse, 512 * 1024)`. Preserve `next: { revalidate: 300 }`.
  - In `src/lib/players-server.ts`:
    - In `loadPlayerGames`: when `lichessGames`, `chesscomGames`, or `studioGames` throws an upstream error, re-throw instead of swallowing it and returning empty games with a notice.
  - In `app/api/players/games/route.ts`:
    - Update `catch` block on `loadPlayerGames` to return `{ error: "Could not load games" }` with status 502 (instead of 400).
- **Tests**:
  - In `src/lib/players/lichess.test.ts`:
    - Test that `lichessGames` parses valid NDJSON lines and skips malformed lines without throwing.
    - Test that `lichessGames` throws when upstream body exceeds `MAX_PLAYER_GAMES_BYTES`.
  - In `app/api/players/games/route.test.ts`:
    - Update `test("upstream failure returns 400")` to `test("upstream failure returns 502")` asserting `res.status === 502`.
    - Ensure validation tests (invalid source, missing username, bad username) still return 400.
- **Verification**:
  - `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "src/lib/players/lichess.test.ts" "app/api/players/games/route.test.ts"`

### Phase 4: Full Suite Verification and Static Checks
- **Verification Commands**:
  - `npm test -- --run`
  - `npm run lint`
  - `npx tsc --noEmit`

## Risks
1. **Compressed vs Uncompressed Content-Length**:
   - Upstream servers may send a gzip `Content-Length` representing compressed bytes, while the decompressed stream is larger.
   - *Mitigation*: Only reject on `Content-Length` if the header itself already exceeds `maxBytes`; always enforce the strict running byte total on the stream chunks.
2. **Next.js fetch cache options**:
   - `fetch` options like `next: { revalidate: 120 }` must not be dropped or modified when adding timeouts or headers.
   - *Mitigation*: Keep existing `fetch` calls and options intact; `readCapped` only operates on the returned `Response`.
3. **Stream Cancellation and Memory Leaks**:
   - Early abort on over-limit payloads could leave streams uncancelled or hanging sockets.
   - *Mitigation*: Always call `await reader.cancel()` and catch any cancellation errors in `readCapped`.

## Assumptions
- Sizing `MAX_PLAYER_GAMES_BYTES` at 2 MB is sufficient for 80 games while protecting Worker memory.
- Sizing `MAX_MASTERS_PGN_BYTES` at 1 MB is sufficient for any single chess game PGN.
- `loadPlayerGames` in `src/lib/players-server.ts` should propagate upstream fatal errors (over-capacity, network failure) rather than caching or returning an empty game list, allowing `app/api/players/games/route.ts` to return HTTP 502.
- A single corrupt NDJSON line in `lichessGames` should be logged with `console.warn` and skipped, preserving all valid games in the response.

## Open Questions
None.
