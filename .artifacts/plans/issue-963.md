# SIG-963 — Game Review: translate the panel and report card (presets, phases, tiers, tooltips) with EN/PT-BR parity tests

## Goal

When the site language is `pt-br`, the whole Game Review surface (panel header, preset selector, progress/ETA, empty/setup/failed/cancelled states, report card labels, phase names, tier names, tooltips incl. `aria-label`/`title`, key-moments, `WhyBlock` tier chip) renders in Brazilian Portuguese; when it is `en`, every string is byte-identical to today. A parity test fails CI on any missing PT-BR key or placeholder mismatch. Verifiable by `npm test`, `npm run lint`, `npx tsc --noEmit`, plus a live EN/PT-BR toggle check of the panel and report card.

## Scope

In:
- `src/studio/ReviewPanel.tsx` — all hardcoded UI strings, `formatEta`, `lineNote`, progress/failed/cancelled templates, `aria-label`s, preset option labels; thread `locale` through to `ReviewReportCard`.
- `src/studio/review/ReviewReportCard.tsx` — `RATING_TOOLTIP`, `Accuracy`, `Avg. loss` + title, `White`/`Black` fallbacks, phase names, tier names/icons list, forced-row title, `Game rating ⓘ` + tooltip, `Key moments`, `No mistakes in this line.`, key-moment tier names.
- `src/studio/review/WhyBlock.tsx` — `REVIEW_TIERS[row.label].name` chip (currently always English).
- `src/chess/review-engine.ts` — `REVIEW_PRESETS` labels (`Fast`/`Standard`/`Deep`).
- `src/chess/review-report.ts` — `REPORT_PHASES` names, `headers.White || "White"` / `headers.Black || "Black"` defaults.
- `src/chess/review-tiers.ts` — 11 tier `name`s (display only; `mark`/`icon`/`className` stay).
- New pure-model locale table(s) + `EN`/`PT-BR` parity test (see Phase 1 for location decision).
- `src/chess/explain/locales/types.ts` `UI_KEYS` — only if the chosen design extends it (default: do not touch).

Out:
- Active-locale decision, persistence, `<html lang>` (done in SIG-962/SIG-971; `ReviewPanel` already reads `state.settings.locale`).
- Number/date formatting (`86.0`, `≈ 2100`, `~{s}s` digits stay as-is; only surrounding words/templates translate).
- New locales beyond EN/PT-BR.
- Opening names (`lookupBookOpening`) and player names from PGN headers — proper nouns, never translated.
- `moveNotation` / SAN formatting.

## Phases

### Phase 0 — Baseline + repo guard (independently verifiable, no edits)

1. From the working directory run `git rev-parse --show-toplevel` and `git remote get-url origin`; normalize SSH/HTTPS to `owner/repository` ignoring trailing `.git` and confirm `dansigma/chess-studio`. Also confirm the SIG-963 paths (`src/studio/ReviewPanel.tsx`, `src/chess/review-*.ts`, `src/i18n/`) exist in that checkout. If remote/root mismatch or paths contradict the checkout, stop without editing and report expected vs observed.
2. Run baseline: `npm test` (node `--experimental-test-module-mocks` over `src/**/*.test.ts` + `app/**/*.test.ts`), `npm run lint`, `npx tsc --noEmit`. Record results; all later phases must return to green.

### Phase 1 — New review locale tables + parity test (pure model, no UI wiring yet)

New file (proposed): `src/chess/review-strings.ts` (alternative accepted: `src/studio/review/locale.ts` if the executor finds the team prefers UI-adjacent strings there — but default to `src/chess/` to satisfy "stable ids in pure model modules").

Shape (follow the grain of `src/chess/explain/render.ts` + `src/i18n/strings.ts`):
- `export const REVIEW_STRING_KEYS = [...] as const` covering every static string: `panel.title`, `panel.depthLabel` (aria), `panel.cancel`, `panel.reviewAgain`, `panel.reviewGame`, `panel.empty`, `panel.pausedSetup`, `panel.progressLabel` (aria), `panel.estimating`, `panel.failed`, `panel.cancelled`, `panel.lineNote`, `report.accuracy`, `report.avgLoss`, `report.avgLossTitle`, `report.whiteFallback`, `report.blackFallback`, `report.gameRating`, `report.ratingTooltip`, `report.forcedTooltip`, `report.keyMoments`, `report.noMistakes`, `phase.opening|middlegame|endgame`, `tier.<11 labels + forced>`, `preset.fast|standard|deep`.
- Whole-sentence template functions (not placeholder glue) for interpolated strings, mirroring `StatementTemplate` whole-sentence ownership: `formatEta(locale, ms)`, `progressText(locale, {depth, done, total})`, `failedText(locale, {done, total})`, `cancelledText(locale, {done, total})`, `presetOption(locale, id)` → e.g. EN `"Fast (depth 10)"` / PT-BR `"Rápida (profundidade 10)"`.
- `EN: Record<Key,string>` complete; `PT_BR: Partial<...>` + `TABLES: Record<SiteLocale|ExplainLocale, ...>` with `tReview(locale, key)` that falls back to EN + `warnMissing` outside production (copy the `console.warn('[i18n] missing …')` / `'[explain] missing …'` pattern).
- Keep `REVIEW_TIERS` / `REPORT_PHASES` / `REVIEW_PRESETS` numeric/symbol fields (`depth`, `mark`, `icon`, `className`, phase `id`) where they are; the display `name`/`label` moves behind `tierName(locale, label)`, `phaseName(locale, id)`, `presetLabel(locale, id)` accessors in the new module. Do NOT delete the existing `name`/`label` fields in this phase (backward compat; EN snapshots depend on them).

Tests (new file, proposed `src/chess/review-strings.test.ts`, mirroring `src/chess/explain/render.test.ts`):
- Every key in `REVIEW_STRING_KEYS` resolves non-empty in both locales, ends as a whole sentence where applicable, contains no `undefined|NaN|[object|{|` leaks.
- PT-BR table covers every key (fail on missing — this is the CI parity gate); placeholder/template params covered ({depth},{done},{total},{s},{m} parity — fail on mismatch).
- EN snapshots: assert a handful of current strings byte-identical (e.g. `"Game Review"`, `"Fast (depth 10)"`, `"Estimated from each player's average centipawn loss…"` full tooltip, `"Key moments"`), so regressions fail loudly.
- PT-BR snapshots: a handful of agreed translations (tier names + `panel.title` + `report.accuracy`).

Verify: `npm test -- src/chess/review-strings.test.ts` (or full `npm test`), `npx tsc --noEmit`.

### Phase 2 — Model accessors (EN byte-identical, no UI text change yet)

- `src/chess/review-tiers.ts`: keep `REVIEW_TIERS` shape; export `tierName(locale, label)` (or re-export from the new module — pick one canonical home and re-export from the other to avoid two truths). All existing imports keep working.
- `src/chess/review-report.ts`: `REPORT_PHASES` keeps `{id}` ordering; display name via `phaseName(locale, id)`; `buildReviewReport(rows, headers, locale = "en")` — new optional third param defaulting to `"en"` so existing callers/tests are byte-identical; only the `"White"`/`"Black"` fallbacks become locale-aware (`"Brancas"`/`"Pretas"` under `pt-br`).
- `src/chess/review-engine.ts`: `REVIEW_PRESETS` keeps `{depth}`; label via `presetLabel(locale, id)`; `runReview` untouched (uses `.depth` only).
- Extend `src/chess/review-report.test.ts` (math-only today): `buildReviewReport` defaults stay `"White"`/`"Black"` with no locale arg; `pt-br` yields `"Brancas"`/`"Pretas"`; phases/tiers accessors return EN strings identical to today's literals.

Verify: `npm test`, `npx tsc --noEmit`.

### Phase 3 — UI wiring (the visible fix)

- `src/studio/ReviewPanel.tsx`: replace every literal with `tReview(locale, …)` / template fns using the existing `settings.locale` selector (already subscribed, live re-renders per SIG-971). Delete local `formatEta`; import it from the new module. `aria-label="Review depth"` → localized; `role="progressbar"` `aria-label="Review progress"` → localized; option rows use `presetOption(locale, id)`; pass `locale` into `<ReviewReportCard locale={locale} …>` (new prop, required).
- `src/studio/review/ReviewReportCard.tsx`: accept `locale: SiteLocale | ExplainLocale`; replace `RATING_TOOLTIP`, `Accuracy`, `Avg. loss` + `title`, `PlayerHeader color` fallbacks (`color` prop becomes unnecessary — derive from locale, or keep prop but ignore for display), `REPORT_PHASES` map, `REVIEW_LABELS` + forced rows, `Game rating ⓘ` + both `title`s, `Key moments`, `No mistakes…`, key-moment `tier.name` chips. `openingName`/`lineNote`: `openingName` passes through untranslated (proper noun); `lineNote` arrives as already-localized string from `ReviewPanel` (do not localize twice).
- `src/studio/review/WhyBlock.tsx`: `tier.name` → `tierName(locale, row.label)`; `uiText(locale, "why"|…)` stays as-is.
- No changes to `src/chess/explain/locales/{en,pt-br}.ts` or `UI_KEYS` (rejected alternative — see below).

Verify: `npm test`, `npm run lint`, `npx tsc --noEmit`, then live check: run the app, review a game in EN (screenshot/compare strings to pre-change), switch site language to PT-BR, re-open panel — whole panel + report card in Portuguese, no half-English rows, no missing-glyph `□` regressions (forced icon `□` is intentional, not a missing glyph).

### Phase 4 — Full verification + PR

1. Re-run repo guard (same as Phase 0) immediately before `gh pr create` — do not rely on the earlier check.
2. Full: `npm test`, `npm run lint`, `npx tsc --noEmit` (and `next build` if SIG-971 precedent applies and time permits).
3. Push branch `factory/linear-sig-963`, open PR to `master` with summary + test plan; include EN/PT-BR screenshots or pasted strings.

## Risks

- PT-BR tier names are a product call (Genius/Perfect/Very good/Decent/Textbook/Imprecise/Miss/Forced have several valid translations). Wrong guess ships awkward chess Portuguese → mitigated by Assumptions list + Open question; executor picks list below unless owner already answered on the issue.
- Over-broad refactor (renaming `REVIEW_TIERS.name`, changing `buildReviewReport` signature without default) breaks callers/tests → mitigated by optional `locale = "en"` default + re-exports; check with `search_content` for `REVIEW_TIERS|REPORT_PHASES|REVIEW_PRESETS|buildReviewReport` consumers before deleting anything (known: `ReviewReportCard`, `WhyBlock`, `ReviewPanel`, `useGameReview`, `review-engine.test.ts`).
- Placeholder-split sentences (e.g. `"Scoring moves at depth " + depth`) break PT-BR word order → mitigated by whole-sentence template functions (Phase 1), never concatenation.
- `□` forced icon vs missing-glyph confusion in QA → note in PR that `□` is the intentional forced glyph.
- Sandbox has no `.git` (planning observed `fatal: not a git repository`); repo-guard + history conventions could not be verified here → executor must verify in a real checkout before PR.

## Assumptions

1. Triage claims re-verified 2026-10-15 against current files: `UI_KEYS = ["why","bestLine","engineOnly","noLine"]` (`types.ts:15`); `REVIEW_PRESETS` labels EN-only (`review-engine.ts:19-23`); `REPORT_PHASES` EN-only (`review-report.ts:18-22`); `REVIEW_TIERS` 11 EN names (`review-tiers.ts:13-25`); `ReviewPanel` reads `settings.locale` (`ReviewPanel.tsx:29`) but only forwards it to `WhyBlock` (`:180`), `ReviewReportCard` gets no locale (`:186-193`); `RATING_TOOLTIP` + all card labels hardcoded (`ReviewReportCard.tsx:26-29,71-129`).
2. Design: NEW dedicated review string tables (`src/chess/review-strings.ts`) over (a) stuffing ~30 UI keys into `explain/locales` (rejected: pollutes the SIG-961 explanation-sentence domain with chrome strings) and over (b) flat `src/i18n/strings.ts` string-only keys (rejected: cannot own whole-sentence interpolation/ETA/plurals without function templates). New module copies the EN-fallback + dev `warnMissing` grain from both precedents.
3. `buildReviewReport(rows, headers, locale = "en")` optional-param keeps EN byte-identical; existing `REVIEW_TIERS.name` / `REPORT_PHASES[].name` / `REVIEW_PRESETS[].label` fields stay until UI wiring lands (no flag day).
4. `locale` type: accept `SiteLocale` (`en | pt-br`, canonical per `src/i18n/locale.ts`); `ExplainLocale` is an alias of it — either annotation accepted, normalized at the table boundary.
5. Proposed PT-BR (executor ships unless owner posted otherwise): panel `Game Review` → `Análise da partida`; `Review depth` → `Profundidade da análise`; `Cancel` → `Cancelar`; `Review again` → `Analisar novamente`; `Review game` → `Analisar partida`; `Play or open a game…` → `Jogue ou abra uma partida para analisá-la.`; `Paused in setup.` → `Pausado na configuração.`; progress → `Avaliando lances na profundidade {depth}… {done}/{total}`; `estimating…` → `estimando…`; ETA → `faltam ~{s}s` / `faltam ~{m}min {s}s`; `Review progress` → `Progresso da análise`; failed → `O motor parou de responder em {done}/{total} posições. Tente a análise novamente.`; cancelled → `Análise cancelada em {done}/{total} posições.`; lineNote → `A linha analisada é uma variante, não a linha principal.`; `White`/`Black` → `Brancas`/`Pretas`; `Accuracy` → `Precisão`; `Avg. loss` → `Perda média` (+title `Perda média em centipeões por lance (quanto menor, melhor)`); phases → `Abertura`/`Meio-jogo`/`Final`; `Game rating ⓘ` → `Rating da partida ⓘ` + fully translated tooltip; `Key moments` → `Momentos-chave`; `No mistakes…` → `Sem erros nesta linha.`; presets → `Rápida`/`Padrão`/`Profunda`; tiers → brilliant `Genial`, great `Ótima`, best `Perfeita`, veryGood `Muito boa`, decent `Razoável`, book `Teórica`, inaccuracy `Imprecisão`, mistake `Erro`, miss `Lance perdido`, blunder `Gafe`, forced `Forçada` (feminine agreeing with `jogada`; if owner prefers masculine sports-page forms, swap as a block).
6. `openingName` and PGN player names stay untranslated (proper nouns).
7. Existing coverage: `review-report.test.ts` math-only, `render.test.ts` EN/PT-BR parity pattern to copy, no review UI tests — so new parity test is the gate.

## Open questions

- Are the proposed PT-BR tier names (Assumption 5) the product-owner-agreed set the issue mentions? If the owner posted a different list, use theirs verbatim.
