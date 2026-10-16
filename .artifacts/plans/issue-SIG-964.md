# SIG-964 — Game Review: localize numbers, ETA and opening names

## Goal

PT-BR Game Review output uses locale-correct numbers, ETA sentences, and opening names while EN output stays byte-identical. Done = PT-BR report shows accuracy `86,0` (decimal comma), rating `2.450` (thousands dot), ETA `~12s restantes` / `~1m 05s restantes`, and a Sicilian line renders `B20 · Defesa Siciliana` (ECO kept, PT name when mapped, EN fallback otherwise); `npm test`, `npm run lint`, `npx tsc --noEmit` all green plus the live check in Phase 4.

## Scope

**In:**
- New locale-explicit number helper `src/i18n/format.ts` + `src/i18n/format.test.ts` (`formatDecimal1`, `formatInteger` via `Intl.NumberFormat` with explicit `en-US`/`pt-BR` tags).
- `ReviewReportCard.tsx`: accuracy/phase percentages, ACPL, game rating through the helper with `locale` prop (already received).
- `review-strings.ts`: PT-BR `formatReviewEta` retuned to the issue wording (`~Ns restantes`, `~Nm 05s restantes` with zero-padded seconds); depth/progress counters (`reviewProgressText`, `reviewFailedText`, `reviewCancelledText`, `reviewResumeText`) formatted via the helper; EN strings unchanged; `review-strings.test.ts` updated.
- Opening names: new pure module `src/lib/opening-names.ts` (`PT_BR_OPENING_NAMES` keyed by exact ECO code + `resolveOpeningName(eco, fallbackName, locale)`) covering the 13 distinct in-book ECO codes (A13 shared by two lines — composite key disambiguates) plus `B20 → Defesa Siciliana`; `ReviewPanel.tsx` opening line uses it (keeps `ECO · name` shape, EN fallback); `src/lib/opening-names.test.ts`.
- Consumer wiring only in `ReviewPanel.tsx` (already imports `lookupBookOpening`) and `ReviewReportCard.tsx`.

**Out (per issue):** translating the whole opening book (only the ~15-entry family map), date formatting elsewhere, any other panels (Explorer hardcodes `Intl.NumberFormat("en")` — untouched).

**Considered and rejected:**
- `toFixed(1).replace(".", ",")` à la `src/chess/explain/locales/format.ts:formatPawns`: rejected — handles the decimal comma but not thousands grouping for ratings (`2.450`) or future magnitudes; `Intl.NumberFormat` with explicit locale does both and is what the issue requires.
- Keying the PT map by English name: rejected — names are verbose PGN strings with punctuation variants; ECO codes are short, stable, already returned by `lookupBookOpening`, and the issue example (`B20`) is ECO-keyed.
- Putting the map inside `review-strings.ts` TABLES: rejected — opening names are data (book domain), not review-chrome strings; a standalone pure module next to `opening-book.ts` keeps it testable without touching the `REVIEW_STRING_KEYS` no-silent-fallback invariant.
- Reusing the browser/runtime default locale: rejected — causes hydration mismatch and Node-vs-browser `Intl` drift (the issue's stated trap); every helper takes `SiteLocale` and maps to an explicit BCP-47 tag.

## Phase 1 — Locale-explicit number helper

Files: new `chess-studio/src/i18n/format.ts`, new `chess-studio/src/i18n/format.test.ts`.

- `format.ts`:
  ```ts
  import type { SiteLocale } from "./locale.ts";
  const TAG: Record<SiteLocale, string> = { en: "en-US", "pt-br": "pt-BR" };
  export function formatDecimal1(locale: SiteLocale, value: number): string {
    return new Intl.NumberFormat(TAG[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  }
  export function formatInteger(locale: SiteLocale, value: number): string {
    return new Intl.NumberFormat(TAG[locale], { maximumFractionDigits: 0 }).format(value);
  }
  ```
  No caching, no default-locale path, no `toLocaleString()` without tag.
- `format.test.ts` (node:test, existing grain): `formatDecimal1("pt-br", 86) === "86,0"`, `formatDecimal1("en", 86) === "86.0"`, `formatInteger("pt-br", 2450) === "2.450"`, `formatInteger("en", 2450) === "2,450"`, small counters (`12`, `3/20` components) render ungrouped in both locales, `—` handling stays in callers (helper never sees null).

Verify: `npm test -- src/i18n/format.test.ts` (run from `chess-studio/`; repo script resolves TS via `scripts/test-resolve.mjs`).

## Phase 2 — ETA + progress/counter templates

Files: `chess-studio/src/chess/review-strings.ts`, `chess-studio/src/chess/review-strings.test.ts`.

- `formatReviewEta(locale, ms)`: keep seconds math + `Math.max(1, …)`; change only the PT-BR branches to the issue wording with zero-padded rest seconds:
  - `<60s`: `~${seconds}s restantes` (EN `~${seconds}s left` untouched).
  - `≥60s`: `~${minutes}m ${String(rest).padStart(2, "0")}s restantes` (EN `~${minutes}m ${rest}s left` untouched).
  - So `12_000 → "~12s restantes"`, `125_000 → "~2m 05s restantes"`.
- `reviewProgressText`, `reviewFailedText`, `reviewCancelledText`, `reviewResumeText`: keep whole-sentence templates (never concatenation — file grain), but render `depth/done/total` via `formatInteger(locale, n)` imported from `../../i18n/format.ts` (check relative path from `src/chess/`; no cycle since `format.ts` imports only the `SiteLocale` type).
- Update `review-strings.test.ts` ETA expectations to the new PT-BR strings (EN assertions unchanged) and add a grouping-sensitive case if cheap (e.g. `reviewProgressText("pt-br", { depth: 12, done: 1234, total: 2450 })` contains `1.234/2.450`).

Verify: `npm test -- src/chess/review-strings.test.ts`.

## Phase 3 — Opening-name lookup (ECO-keyed, EN fallback)

Files: new `chess-studio/src/lib/opening-names.ts`, new `chess-studio/src/lib/opening-names.test.ts`; read-only reference `chess-studio/src/lib/opening-book.ts:371-377`.

- `opening-names.ts`:
  ```ts
  import type { SiteLocale } from "../i18n/locale.ts";
  // Bare ECO lookup first; `ECO|English name` composite wins when one code
  // covers two families (A13 = English Opening and Reti Opening in-book).
  export const PT_BR_OPENING_NAMES: Record<string, string> = {
    C41: "Defesa Philidor", C33: "Gambito do Rei Aceito", C52: "Gambito Evans",
    C92: "Ruy López", B90: "Defesa Siciliana: Variante Najdorf", B20: "Defesa Siciliana",
    C11: "Defesa Francesa", B12: "Defesa Caro-Kann", D59: "Gambito da Dama Recusado",
    E34: "Defesa Nimzoíndia", E97: "Defesa Índiana do Rei", A13: "Abertura Inglesa",
    "A13|Reti Opening": "Abertura Réti", D17: "Defesa Eslava", D02: "Sistema London",
  };
  export function resolveOpeningName(eco: string, fallbackName: string, locale: SiteLocale): string {
    if (locale !== "pt-br") return fallbackName;
    const code = eco.trim().toUpperCase();
    return PT_BR_OPENING_NAMES[`${code}|${fallbackName}`] ?? PT_BR_OPENING_NAMES[code] ?? fallbackName;
  }
  ```
  Verified ECOs in-book (`grep 'ECO "' src/lib/opening-book.ts`): C41 C33 C52 C92 B90 C11 B12 D59 E34 E97 A13(×2: English + Reti) D17 D02 — 13 distinct codes; map adds off-book B20 per the issue example. Keep ECO display code as returned by the book (do not normalize display, only lookup).
- `opening-names.test.ts`: `resolveOpeningName("B20", "Sicilian Defense", "pt-br") === "Defesa Siciliana"`, unknown ECO falls back to English verbatim in pt-br, `en` always returns fallback untouched (all 14 mapped ECOs spot-checked).

Verify: `npm test -- src/lib/opening-names.test.ts`.

## Phase 4 — Wire into panel + report card

Files: `chess-studio/src/studio/ReviewPanel.tsx:114-125`, `chess-studio/src/studio/review/ReviewReportCard.tsx:29-51,78-79`.

- `ReviewPanel.tsx` `openingName` memo: `const name = resolveOpeningName(opening.eco, opening.name, locale); return opening.eco ? \`${opening.eco} · ${name}\` : name;` — shape unchanged, only the name half localizes. Add `locale` to the memo deps.
- `ReviewReportCard.tsx`: `percent(value, locale)` → `formatDecimal1(locale, value)`; ACPL cells → `side.acpl == null ? "—" : formatInteger(locale, side.acpl)`; `ratingText(side, locale)` → `formatInteger(locale, value)` preserving the `≈ ` prefix and `—` null paths; phase cells flow through `percent`. Counts (`white.counts[label]`, `forced`) stay raw (true integers, grouping adds noise for single digits — matches issue's enumerated surfaces).
- No new test file for the card (no existing card-test pattern); coverage comes from Phases 1–3 unit tests.

Verify (from `chess-studio/`): `npm test`, `npm run lint`, `npx tsc --noEmit`. Live check: locale `pt-br`, run/loading a saved review shows accuracy `86,0`, ETA `~12s restantes`-style string, and a Sicilian line header `B20 · Defesa Siciliana`; switch to `en` restores `86.0` / `~12s left` / English name.

## Risks

- `Intl.NumberFormat` Node-vs-browser drift: mitigated by pinning explicit `en-US`/`pt-BR` tags and asserting exact strings (`86,0`, `2.450`) in `format.test.ts`; engines field is `>=22` so full-ICU is present.
- Hydration mismatch from default locale: no code path may call `Intl` without the explicit tag map; grep for `toLocaleString()` / `toFixed(1)` in the touched files during review.
- PT-BR ETA test churn: `review-strings.test.ts` currently pins the old `faltam …` wording — Phase 2 must update those two assertions, otherwise the suite fails by design.
- ECO key drift: if a PGN header ECO differs from the map key (e.g. Reti/Slav/London codes), lookup silently falls back to English; the `grep 'ECO "'` check in Phase 3 catches this before wiring.
- Scope creep into Explorer (`ExplorerPanel.tsx:16` hardcodes `en`): explicitly out of scope; do not "fix" it in passing.

## Assumptions

- Triage claims re-verified this run against current branch (`factory/linear-sig-964`, HEAD `38113fd`): `percent()` at `ReviewReportCard.tsx:30-32`, `ratingText` at `:45-51`, ACPL raw at `:78-79`; `formatReviewEta` PT-BR `faltam ~Ns` / `~Nmin Ss` at `review-strings.ts:217-226`; `lookupBookOpening` returns `{eco, name}` verbatim at `opening-book.ts:371-377`; `ReviewPanel.tsx:114-125` builds `eco · name` EN-only; `SITE_LOCALES ["en","pt-br"]` in `src/i18n/locale.ts`. Remote guard: `https://github.com/dansigma/chess-studio.git` matches target `dansigma/chess-studio`.
- ETA wording decision: adopt the issue's `~12s restantes` / `~1m 05s restantes` (zero-padded) verbatim, replacing the current `faltam …` phrasing — the issue text is newer and more specific than the SIG-963-era strings.
- Map keying decision: exact ECO code (uppercased/trimmed for lookup only); ~15 entries (14 in-book + B20) satisfies "start with … ~50 ECO families" as a starter map without boiling the ocean.
- PT-BR name translations above are the executor's best-effort standard chess Portuguese; any correction is a string swap, not a structural change.
- Counters in `done/total` pairs use `formatInteger` per number (so `3/20` stays `3/20` but thousands group correctly); the `/` separator itself is not localized.

## Open questions

- None blocking. If the maintainer prefers `faltam …` over `… restantes`, it is a two-line string swap in Phase 2 with no plan impact.
