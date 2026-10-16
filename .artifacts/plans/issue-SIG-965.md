# Implementation Plan - SIG-965: Game Review: persist finished reviews (IndexedDB) so a reload does not throw away minutes of analysis

## Goal

Finished Game Reviews survive reloads, new tabs, and deploys. A review computed once (including minutes-long Deep depth-16 runs) is shown instantly on revisit with a "Saved review" hint, a preset/engine/line change still misses, "Review again" always forces a fresh engine run, and Settings offers "Clear saved reviews". IndexedDB failure (private mode, quota, SSR) silently falls back to the current in-memory behavior. Done means: `npm test`, `npm run lint`, and `npx tsc --noEmit` all pass, plus a manual live check (review → reload → instant report).

## Scope

- **In Scope**:
  - `src/studio/review/review-cache.ts`: versioned sync key (`REVIEW_SCHEMA_VERSION`), unchanged sync hot-layer API (`getCachedReview`/`setCachedReview`/`clearReviewCache`), async write-through + `hydrateReviewCache()`.
  - `src/studio/review/review-store.ts` (new): minimal promise-wrapped IndexedDB adapter with injectable backend, SHA-256 persistent keys, LRU eviction (~50 entries / ~5MB by `lastUsedAt`), silent failure fallback.
  - `src/studio/review/useGameReview.ts`: hydrate on mount, async persistent lookup per line-key with stale-key guard, expose `cached` flag.
  - `src/chess/review-strings.ts` (+ test): `panel.savedReview` string in English and Portuguese.
  - `src/studio/ReviewPanel.tsx`: "Saved review" hint when rows came from cache.
  - `src/studio/SettingsDialog.tsx`: "Game Review" section with "Clear saved reviews" button (clears memory + IndexedDB).
  - Tests: extend `review-cache.test.ts`, new `review-store.test.ts` (both must run under plain `node:test`).
- **Out of Scope**:
  - Server sync / cross-device reviews; storing reviews inside PGN (explicitly out per issue).
  - Per-review deletion UI; only clear-all.
  - Adding an `idb`-style dependency (hand-rolled ~80-line wrapper instead).
  - Changing review scoring/grading itself; `REVIEW_SCHEMA_VERSION` only invalidates the cache.

## Phases

### Phase 1: Versioned cache key + canonical fingerprint input

- **Files**:
  - `src/studio/review/review-cache.ts`
  - `src/studio/review/review-cache.test.ts`
- **Changes**:
  - Export `REVIEW_SCHEMA_VERSION = 1` with a comment: bump whenever `ReviewRow` scoring/grading shape changes, because it invalidates all persisted reviews.
  - Extract `reviewFingerprintInput(fens, ucis, preset, engineBuild): string` returning the canonical string currently built inline (`fens.join("|")#ucis.join(" ")` plus preset/build/length components).
  - `reviewCacheKey(...)` keeps its exact sync signature and FNV-1a core but prefixes the version (`v1:...`), so old keys miss after any scoring change.
  - Export `sha256Hex(text: string): Promise<string>` — uses `crypto.subtle.digest` when available, falls back to the FNV-1a hex when `subtle` is unavailable (Node tests, non-secure contexts, SSR). Never throws: catch-all returns the fallback.
  - `persistentReviewKey(fens, ucis, preset, engineBuild): Promise<string>` → `` `v${REVIEW_SCHEMA_VERSION}:${await sha256Hex(reviewFingerprintInput(...))}` ``.
  - Keep `MAX_ENTRIES = 12` for the hot layer unchanged (minimal blast radius; the persistent layer holds the depth).
  - Tests: key still varies by line/preset/build; key starts with `v1:`; `persistentReviewKey` is stable for identical input, differs across preset/build, and resolves (via fallback) under Node where `crypto.subtle` may be absent.
- **Verification**:
  - `npm test -- src/studio/review/review-cache.test.ts` (via repo script: `npm test` runs all; scope with file filter as supported)

### Phase 2: IndexedDB review store with injectable backend

- **Files**:
  - `src/studio/review/review-store.ts` (new)
  - `src/studio/review/review-store.test.ts` (new)
- **Changes**:
  - Record shape (plain JSON only, no `Path` objects — `ReviewRow` core only): `{ key: string; rows: ReviewRow[]; preset: string; engineBuild: string; moves: number; bytes: number; lastUsedAt: number }`. `bytes` = `new TextEncoder().encode(JSON.stringify(rows)).length`.
  - Constants: `REVIEW_STORE_DB = "chess-studio"`, `REVIEW_STORE_NAME = "reviews"`, `MAX_PERSISTED_REVIEWS = 50`, `MAX_PERSISTED_BYTES = 5_000_000`.
  - `StoreBackend` interface: `get(key) / put(record) / delete(key) / clear() / entries()` (async). `createIndexedDbBackend()` implements it with a promise-wrapped raw IndexedDB open (`keyPath: "key"`), created lazily and cached; every operation wrapped in try/catch returning safe defaults (`null`/`[]`) on any failure, and the whole module no-ops when `typeof indexedDB === "undefined"`.
  - `createReviewStore(backend?: StoreBackend)` (default backend = IDB singleton) exposing:
    - `loadReview(persistentKey): Promise<ReviewRow[] | null>` — on hit, bumps `lastUsedAt` (fire-and-forget put) and returns rows; validates rows is an array, else treats as miss and deletes the record.
    - `saveReview(persistentKey, meta, rows): Promise<void>` — put + evict; never rejects (catch-all inside).
    - `loadAllByRecency(): Promise<Array<{ key: string; rows: ReviewRow[] }>>` — oldest-first for ordered hydration.
    - `clearReviews(): Promise<void>` — never rejects.
    - Eviction after each save: while `count > 50` or `bytes > 5MB`, delete oldest by `lastUsedAt`.
  - Rejected alternative: `localStorage` (5MB sync quota, blocks main thread on large Deep reviews, JSON parse cost per read) — IndexedDB is async and quota-generous, matching the issue spec.
  - Rejected alternative: adding the `idb` npm package — one small store does not justify a dependency; the wrapper is ~80 lines.
  - Tests use `createReviewStore(new MapBackend())` (in-memory `StoreBackend` in the test file): save/load round-trip, validation rejects corrupt records, eviction drops oldest-first at 51 entries, byte-cap eviction, throwing backend still resolves (failure-safe), `clearReviews` empties.
- **Verification**:
  - `npm test -- src/studio/review/review-store.test.ts`

### Phase 3: Write-through, hydration, and async lookup in cache + hook

- **Files**:
  - `src/studio/review/review-cache.ts`
  - `src/studio/review/useGameReview.ts`
- **Changes**:
  - `review-cache.ts`:
    - `setCachedReview(key, rows)` stays sync for the hot layer, then fire-and-forget persists: computes `persistentReviewKey` from stored fingerprint inputs… simpler: change write-through signature to accept the fingerprint inputs. Decision: `setCachedReview(key, rows)` keeps its signature (hot layer only, zero consumer churn); add `persistReview(fens, ucis, preset, engineBuild, rows): void` (fire-and-forget, catches everything) and `hydrateReviewCache(): Promise<void>` (loads `loadAllByRecency()` into the hot Map in oldest-first order through the existing capped insert, catches everything). `clearReviewCache()` clears hot layer and fire-and-forget clears IDB.
    - To avoid double key derivation, `persistReview`/`hydrateReviewCache` live in `review-cache.ts` and import the store singleton from `review-store.ts` (store module holds no React imports; safe under `node:test` because IDB access is lazy + guarded).
  - `useGameReview.ts`:
    - Module-level `let hydratePromise: Promise<void> | null` — kick off `hydrateReviewCache()` once on first hook mount (client only; guard `typeof window === "undefined"`).
    - Track persistent lookup per `cacheKey`: in an effect on `[cacheKey]`, if hot layer missed, `await persistentReviewKey(...)` + `store.loadReview(...)`; `setCore(rows)` only if the key is still current (compare against `lineRef`/local variable) to avoid stale-key races when the user switches lines mid-flight.
    - On run completion: existing `setCachedReview(line.cacheKey, outcome.rows)` plus `persistReview(line fens/ucis/preset/engineBuild, outcome.rows)` — capture the line inputs from `lineRef.current` (already held).
    - Return `cached: boolean` — true when `rows` is non-null and the run did not just finish in this session (i.e. `core` came from hot or persistent cache without `running` having produced it). Simplest correct: `const [freshRun, setFreshRun] = useState(false)` set true on completion, reset on key change; `cached = rows != null && !freshRun && !running`.
- **Verification**:
  - `npm test -- src/studio/review/`
  - `npx tsc --noEmit`

### Phase 4: "Saved review" hint + Settings clear action

- **Files**:
  - `src/chess/review-strings.ts`, `src/chess/review-strings.test.ts`
  - `src/studio/ReviewPanel.tsx`
  - `src/studio/SettingsDialog.tsx`
- **Changes**:
  - `review-strings.ts`: add `panel.savedReview` — en: `"Saved review"`, pt: `"Análise salva"` — following the existing key/en/pt pattern; extend the test's key-coverage list if it enumerates keys.
  - `ReviewPanel.tsx`: when `cached && rows`, render a caption line under the header (e.g. next to the preset select) with `tReview(locale, "panel.savedReview")`. No behavior change: the existing button already reads "Review again" when `rows` exists, and `start()` always launches a fresh engine run (it never short-circuits on cache), satisfying "Review again forces fresh run" with zero edits to `start`.
  - `SettingsDialog.tsx`: new `<Section title="Game Review">` with a `<Row label="Saved reviews">` containing a Button that calls `clearReviewCache()` (sync hot clear + fire-and-forget IDB clear). Button label hard-coded English/Portuguese per existing dialog convention (note: dialog labels are currently hard-coded English — follow that, no new i18n plumbing).
- **Verification**:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm test` (full suite)

### Phase 5: Full verification + live check

- **Commands** (from `chess-studio/`):
  - `npm test`
  - `npm run lint`
  - `npx tsc --noEmit`
- **Live check** (dev browser): run a Deep review on a real game → reload tab → report renders instantly with "Saved review" hint and no engine run; change preset → miss (fresh run); Settings → Clear saved reviews → reload → miss; with IndexedDB disabled/broken (e.g. private mode blocking) reviews still work in-memory within the session.

## Risks & Mitigations

- **Risk**: Async persistent lookup resolves after the user switched lines → wrong report shown.
  - *Mitigation*: stale-key guard in the lookup effect (only `setCore` when key still current); covered by a hook-adjacent unit test on the guard logic if extractable, else careful review.
- **Risk**: `crypto.subtle`/`indexedDB` absent (SSR, Node tests, insecure context) crashes import or render.
  - *Mitigation*: all access lazy + `typeof` guarded + try/catch; `review-cache.test.ts`/`review-store.test.ts` run under plain Node as proof.
- **Risk**: Persisted rows from an older scoring version silently change displayed ratings.
  - *Mitigation*: `REVIEW_SCHEMA_VERSION` in both key forms; bump-on-scoring-change documented at the constant.
- **Risk**: Quota exceeded on save breaks the review flow.
  - *Mitigation*: every persist path is fire-and-forget with catch-all; eviction caps entries/bytes before write settles.
- **Risk**: Non-serializable data sneaks into `ReviewRow` later and breaks IDB structured-clone.
  - *Mitigation*: record stores `ReviewRow[]` as-is (structured-clone handles plain JSON); Phase 2 validation test asserts array shape on load.

## Assumptions

- Remote `https://github.com/dansigma/chess-studio.git` verified against target `dansigma/chess-studio`; issue paths (`review-cache.ts`, `useGameReview.ts`, `SettingsDialog.tsx`) all exist in this checkout.
- Triage claims re-verified this run: 12-entry module-level Map, sync-only get/set, FNV-1a key `engineBuild:preset:length:hash:linelen`, no IDB store, no Game Review settings section, single consumer (`useGameReview.ts`), `ReviewRow` plain JSON.
- `start()` already forces a fresh run (never reads cache), so "Review again" needs no logic change — only the saved-hint display.
- Hot-layer cap stays 12; persistent cap 50 entries / ~5MB LRU by `lastUsedAt`, per issue spec.
- No new dependencies; hand-rolled IDB wrapper; injectable backend keeps `node:test` green.
- `crypto.randomUUID()` trap from the issue does not apply (no IDs needed — content keys only).
- Settings dialog labels stay hard-coded English per current file convention.
- `REVIEW_SCHEMA_VERSION = 1` initial value.

## Open Questions

- None. All design forks resolved from codebase patterns and the issue spec; retention caps taken as specified.
