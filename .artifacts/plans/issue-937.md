# Implementation Plan — SIG-937: Explorer fallback caching and raw-HTML sink regression tests

## Goal
Implement a short-lived in-memory cache TTL (2 minutes) and upstream failure backoff (30 seconds) for explorer fallback responses in `app/api/explorer/route.ts` so upstream outages or missing `LICHESS_TOKEN` do not trigger repeated 16s network timeouts per request. Concurrently, add comprehensive regression test suites for the two raw-HTML sinks: `sanitizeCourseHtml` in `src/courses/description.test.ts` (covering scripts, event handlers, javascript URLs, SVGs, nested/mixed-case tags, NUL bytes, and attribute-smuggled tags) and `printSheetMarkup` in `src/chess/print-sheet.test.ts` (covering `<`, `&`, `"`, `'` in titles and tree comments).

## Scope
- **In scope**:
  - `app/api/explorer/route.ts`: Cache responses with `notice` in `memoryCache` for a 2-minute TTL (`FALLBACK_CACHE_TTL_MS`), while keeping the 24-hour TTL (`CACHE_TTL_MS`) for authoritative upstream responses. Keep Supabase `explorer_cache` write bypass for notices intact (SIG-839 RLS lockdown).
  - `app/api/explorer/route.ts`: Implement a simple failure backoff window (30 seconds) in `fetchLichess` when both Lichess endpoints fail, avoiding consecutive 16s timeout storms. Provide a test-only reset helper if needed.
  - `app/api/explorer/route.test.ts`: Test that repeated requests for the same FEN with unset `LICHESS_TOKEN` or failing upstream hit the memory cache and do not re-fetch upstream within the fallback TTL. Test failure backoff behavior.
  - `src/chess/print-sheet.ts`: Ensure `escapeHtml` handles single quotes (`' -> &#39;`) alongside `&`, `<`, `>`, and `"`.
  - `src/chess/print-sheet.test.ts`: Add escaping tests for `printSheetMarkup` verifying `<script>`, `&`, `"`, and `'` in titles, start comments, move comments, and variation comments are safely escaped.
  - `src/courses/description.test.ts`: Add XSS regression tests for `sanitizeCourseHtml` asserting neutralization of `<script>`, `onerror`/`onload`, `javascript:` URLs, `<svg>`, nested and mixed-case tags, NUL bytes (`\u0000`), and attribute-smuggled `<`.
- **Out of scope**:
  - Replacing the `xss` library with another sanitizer.
  - Modifying Supabase schema, migrations, or RLS policies on `explorer_cache`.
  - Persisting fallback or filtered responses to Supabase.
  - Modifying UI components in `src/courses/DescriptionField.tsx` or `src/studio/print-board.ts`.

## Phases

### Phase 1: Explorer Route Fallback Caching & Failure Backoff
- **Files**: `app/api/explorer/route.ts`, `app/api/explorer/route.test.ts`
- **Changes**:
  1. In `app/api/explorer/route.ts`:
     - Define `FALLBACK_CACHE_TTL_MS = 1000 * 60 * 2` (2 minutes) and `LICHESS_BACKOFF_MS = 1000 * 30` (30 seconds).
     - Track `let lichessBackoffUntil = 0`.
     - In `fetchLichess`: if `Date.now() < lichessBackoffUntil`, return `null` immediately without making HTTP calls. If all endpoints fail, set `lichessBackoffUntil = Date.now() + LICHESS_BACKOFF_MS`. On any endpoint success, clear `lichessBackoffUntil = 0`.
     - In `GET`: update the memory cache check:
       ```ts
       const memory = memoryCache.get(key);
       if (memory) {
         const ttl = memory.payload.notice ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS;
         if (Date.now() - memory.fetchedAt < ttl) {
           return NextResponse.json(memory.payload);
         }
       }
       ```
     - Export a helper `_resetExplorerStateForTest()` to clear `memoryCache` and `lichessBackoffUntil` between tests.
  2. In `app/api/explorer/route.test.ts`:
     - Add test: "serves cached fallback responses with notice within fallback TTL without re-fetching upstream".
     - Add test: "backs off Lichess upstream queries when upstream has recently failed".
- **Verification**:
  - `npm test app/api/explorer/route.test.ts`

### Phase 2: Raw-HTML Sink XSS Regression Tests for Courses
- **Files**: `src/courses/description.test.ts`
- **Changes**:
  - In `src/courses/description.test.ts`, add test cases for `sanitizeCourseHtml`:
    - `<script>` variants: `<SCRIPT>alert(1)</SCRIPT>`, `<sCrIpT>alert(1)</sCrIpT>`, nested `<scr<script>ipt>alert(1)</script>`.
    - Event handler injections: `<img src=x onerror=alert(1)>`, `<b onmouseover="alert(1)">hover</b>`, `<div onload="alert(1)">`.
    - `javascript:` URLs: `<a href="javascript:alert(1)">click</a>`, `<iframe src="javascript:alert(1)">`.
    - `<svg>`: `<svg><script>alert(1)</script></svg>`, `<svg onload="alert(1)">`.
    - Nested & mixed-case tags: `<DIV><STRONG>Safe</STRONG></DIV>`, `<B>Bold</B>`, `<I>Italic</I>`.
    - NUL byte stripping: `\u0000` stripped, preventing bypasses like `<scr\u0000ipt>alert(1)</script>`.
    - Attribute-smuggled `<`: `<div title="<script>alert(1)</script>">safe</div>`, `<b class="foo<script>">text</b>`.
- **Verification**:
  - `npm test src/courses/description.test.ts`

### Phase 3: Raw-HTML Sink Escaping Tests for Print Board
- **Files**: `src/chess/print-sheet.ts`, `src/chess/print-sheet.test.ts`
- **Changes**:
  1. In `src/chess/print-sheet.ts`:
     - Update `escapeHtml` to also escape single quotes (`.replaceAll("'", "&#39;")`), ensuring all 5 standard HTML entities (`&`, `<`, `>`, `"`, `'`) are escaped.
  2. In `src/chess/print-sheet.test.ts`:
     - Add tests for `printSheetMarkup` with titles and comments containing `<`, `>`, `&`, `"`, `'`:
       - Title escaping: verify `title: "Morphy's & Anderssen's <Immortal> \"Game\""` escapes to `Morphy&#39;s &amp; Anderssen&#39;s &lt;Immortal&gt; &quot;Game&quot;`.
       - Comment escaping: create game tree with `startComment`, `commentBefore`, and move `comment` containing malicious HTML (`<script>`, `<img onerror=...>`, quotes, ampersands), call `printTokens` and `printSheetMarkup`, and assert all special characters are escaped and no raw HTML elements are injected.
- **Verification**:
  - `npm test src/chess/print-sheet.test.ts`

### Phase 4: Full Suite Validation
- **Verification**:
  - `npm test`
  - `npm run lint`
  - `npx tsc --noEmit`

## Risks
- **Risk**: Backoff or memory cache state leaking across isolated tests in `route.test.ts`.
  - **Mitigation**: Expose and invoke `_resetExplorerStateForTest()` in `beforeEach` or at start of tests in `app/api/explorer/route.test.ts`.
- **Risk**: Escaping `'` breaking existing board or notation snapshots.
  - **Mitigation**: Existing tests do not rely on raw `'` in HTML markup; running full `npm test` guarantees zero regressions.

## Assumptions
- In-memory fallback TTL set to 2 minutes (120s), safely within the specified 1–5 min window.
- Upstream failure backoff window set to 30 seconds.
- Single quotes `'` in `src/chess/print-sheet.ts` escaped to `&#39;` in `escapeHtml`.
- Notice responses are not persisted to Supabase `explorer_cache` (preserving SIG-839 RLS lockdown).
- Classified as `bug` to maintain alignment with triage and automatic pipeline advancement.

## Open questions
- None.
