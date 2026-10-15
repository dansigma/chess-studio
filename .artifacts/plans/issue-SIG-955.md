# Implementation Plan - SIG-955: Studio: compact tab close button, visible only on tab hover

## Goal

Every dockview tab bar in Studio (central board group, bottom Engine/Eval Graph/Game Review group, right
Notation/Repertoire/Ultra Database group, plus any explorer/dynamic panels) shows a compact close "X" that is
hidden at rest — including on the active tab — and fades in on tab hover or keyboard focus, visually matching the
Open boards sidebar row close (`<X size={13}/>`, faint, `rounded-md`). Done means: no X visible at rest on any tab;
~120ms fade-in on hover/focus; glyph ~12px in a ~20px button; no tab-width shift; touch devices still show the X on
the active tab; `npm run lint`, `npx tsc --noEmit`, and `npm test` all green.

## Scope

- **In scope**
  - `app/globals.css` — extend the existing `.dv-default-tab-action` override (lines 308–329) and add
    hover/focus-reveal, SVG sizing, and `(hover: none)` fallback rules, all under one shared `.dockview-theme-vs`
    selector.
  - `src/studio/dock-tabs.test.ts` — new SIG-955 describe block asserting the CSS contract (existing
    substring-assertion convention).
- **Explicitly out of scope**
  - `src/studio/StudioDock.tsx` — no custom tab component; dockview 8.3.1 renders a plain 11×11 SVG that CSS
    `width/height` overrides cleanly (verified in `node_modules/dockview-react/dist/dockview-react.js:19601-19608`).
  - Store changes, tab alignment/left offset, sidebar close buttons, SIG-915 close semantics (untouched).
  - No `!important`, no `display: none` / `visibility: hidden` for the idle state.

## Background (verified, not assumed)

- dockview's base CSS is `@import`ed at the top of `app/globals.css` (line 2), so Studio rules later in the file win
  at equal specificity by source order.
- Upstream rules (`node_modules/dockview/dist/styles/dockview.css` ~lines 127–175):
  - `.dv-tab.dv-active-tab .dv-default-tab .dv-default-tab-action { visibility: visible }` (0,4,0) — forces the X
    always-visible on the active tab. This is the rule to neutralise.
  - `.dv-tab.dv-inactive-tab … { visibility: hidden }` + `:hover { visibility: visible }` — inactive tabs already
    reveal on hover but with no fade, and `visibility: hidden` drops the button from keyboard tab order.
  - `@media (pointer: coarse) { .dv-default-tab-action { padding: 8px } }` (0,3,0) — our (0,4,0)+ selectors beat it
    without extra work.
- Studio's current override (`app/globals.css:308-329`) sets a 16px box, radius, and hover colors only.
- Reference: `src/studio/BoardsSidebar.tsx:109-118`.

### Considered and rejected

- **Custom `StudioTab` close button** (swap icon via `DockviewDefaultTab` props): unnecessary — the upstream icon is a
  plain SVG with no inline size that CSS can't override; a `width/height` rule on
  `.dv-default-tab-action svg` wins. Revisit only if visual check shows the glyph unresized.
- **`visibility: hidden` idle state**: rejected per the issue — removes the button from tab order and causes width
  shifts. `opacity: 0` keeps layout and focusability; `visibility` is forced to `visible` everywhere so the upstream
  inactive-tab `hidden` rule never applies.

## Phase 1: CSS override block in `app/globals.css`

- **File**: `app/globals.css` (edit in place, directly after the existing `.dv-default-tab-action` rules ~line 329;
  keep the SIG-955 comment style used by SIG-954 at line 238).
- **Changes** (single shared `.dockview-theme-vs` scope, no per-panel selectors):
  1. Extend the existing base rule `.dockview-theme-vs .dv-tab .dv-default-tab .dv-default-tab-action` (0,4,0):
     `width: 20px; height: 20px; padding: 3px; border-radius: 6px; color: var(--studio-faint); opacity: 0;
     visibility: visible; pointer-events: none;` and add `opacity 120ms ease` to its `transition` list (keep the
     existing background/color transitions). `visibility: visible` here neutralises the upstream inactive-tab
     `hidden` by source order at equal specificity.
  2. Add active-tab neutraliser (0,5,0 — strictly beats upstream 0,4,0, no `!important`):
     `.dockview-theme-vs .dv-tab.dv-active-tab .dv-default-tab .dv-default-tab-action { visibility: visible; opacity: 0; }`
  3. Add glyph sizing: `.dockview-theme-vs .dv-tab .dv-default-tab .dv-default-tab-action svg { width: 12px; height: 12px; }`
  4. Add reveal rule — tab hover, keyboard focus within the tab, and direct button focus:
     `.dockview-theme-vs .dv-tab:hover .dv-default-tab .dv-default-tab-action,`
     `.dockview-theme-vs .dv-tab:focus-within .dv-default-tab .dv-default-tab-action,`
     `.dockview-theme-vs .dv-tab .dv-default-tab .dv-default-tab-action:focus-visible { opacity: 1; pointer-events: auto; }`
     (≥0,5,0 with `:hover`/`:focus-within`, beats upstream). `pointer-events: none` at rest does not affect keyboard
     focus; hover passes through to the tab so the reveal is flicker-free.
  5. Keep/extend the existing `:hover` button-highlight rule (faint → `var(--studio-fg)` +
     `var(--studio-hover-strong)` background) and the `:focus-visible` accent outline — just update the base color
     token from `--studio-muted` to `--studio-faint` to match the sidebar.
  6. Add touch fallback: `@media (hover: none) { .dockview-theme-vs .dv-tab.dv-active-tab .dv-default-tab .dv-default-tab-action { opacity: 1; pointer-events: auto; } }`
  7. Do not touch the `.dv-tab-dragging` upstream background rule; verify it still looks sane in the live check.
- **Tests**: none yet (visual/CSS change).
- **Verification**: `npx tsc --noEmit` (CSS edit should not break types, but run to be safe); eyeball the diff for
  specificity (count classes: every new selector must carry `.dockview-theme-vs`).

## Phase 2: CSS-contract tests in `src/studio/dock-tabs.test.ts`

- **File**: `src/studio/dock-tabs.test.ts` (append a new `describe` block; follow the file's existing convention of
  reading `app/globals.css` and asserting substrings — see the SIG-938 block).
- **Changes** — `describe("studio tab close hover-only (SIG-955)", …)` with assertions that `globalsCss` includes:
  1. `opacity: 0` on the `.dv-default-tab-action` base rule and an `opacity` transition (fade, no layout shift).
  2. `.dv-default-tab-action svg` sizing (`width: 12px` / `height: 12px`).
  3. A `:hover` reveal selector and a `:focus-within`/`:focus-visible` reveal selector setting `opacity: 1`.
  4. `visibility: visible` neutraliser for `.dv-active-tab` (upstream always-visible rule defeated without `!important`
     — assert the file does not add `!important` in the new block is optional; keep the suite to positive includes).
  5. `@media (hover: none)` fallback keeping the active-tab close visible.
  6. Negative guard: no `display: none` introduced for `.dv-default-tab-action` (use `assert.ok(!globalsCss.includes(...))`
     scoped to a distinctive new-rule string, e.g. assert the reveal block text itself contains `opacity: 1` rather than
     a brittle whole-file negative — simplest robust check: assert `!globalsCss.includes(".dv-default-tab-action { display: none")`
     and same for `visibility: hidden` on the action).
- **Verification**: `npm test src/studio/dock-tabs.test.ts` (repo script:
  `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test …`).

## Phase 3: Full verification + live-check checklist

- **Commands** (from the repo root): `npm run lint`, `npx tsc --noEmit`, `npm test src/studio/dock-tabs.test.ts`
  (then full `npm test` if time permits — it runs the whole `src/**` + `app/**` suite).
- **Manual live check** (guest session, cannot be automated in this repo — perform in browser dev tools):
  in all three groups confirm no X at rest including the active tab; hovering a tab fades the X in; hovering the X
  highlights it; keyboard Tab to the close button reveals it and Enter/Space closes; closing a board tab focuses the
  previous tab (SIG-915 semantics); measure the glyph ≈ 12px and confirm zero tab-width change on hover (layout
  shift check via dev-tools overlay or screenshot compare); emulate a touch device (`hover: none`) and confirm the X
  shows on the active tab.
- **Traps to re-check while verifying**: selector specificity vs upstream (no `!important` anywhere in the new block);
  no placeholder gap on non-closable panels (dockview renders no action element when `hideClose` — CSS adds nothing);
  `.dv-tab-dragging` background still sane.

## Risks

- **Upstream specificity surprise**: if dockview's exact selectors differ from the 8.3.1 copy vendored in
  `node_modules` (e.g. after a dependabot bump), the neutraliser could lose. Mitigation: Phase 2 tests pin the
  contract; re-check `node_modules/dockview/dist/styles/dockview.css` if `package.json` dockview version changed.
- **SVG attribute resistance**: dockview sets `width="11" height="11"` attributes; CSS `width/height` overrides
  presentation attributes, so this is low risk — but confirm visually in Phase 3 and fall back to a custom tab
  component only then.
- **Invisible-but-clickable hit area**: mitigated with `pointer-events: none` at rest; confirm no dead clicks in the
  live check.

## Assumptions

- Linear label is Improvement → planned as a small feature/polish change, CSS-only.
- `opacity: 0` + `pointer-events: none` keeps the button keyboard-focusable (pointer-events does not affect tab order)
  and width-stable, satisfying the issue's focus and no-layout-shift requirements.
- No non-closable tab panels need placeholder handling (dockview omits the action element when `hideClose`).
- Test strategy follows the repo's established grain: substring assertions on `app/globals.css` via `node:test`
  (as in `src/studio/dock-tabs.test.ts`), since there is no CSS-rendering harness in the repo.
- Repository guard verified: `git remote get-url origin` → `https://github.com/dansigma/chess-studio.git`
  (target `dansigma/chess-studio`); dockview CSS is `@import`ed at `app/globals.css:2`, so later Studio rules win
  ties by source order.

## Open questions

None — scope, target files, tokens, and acceptance criteria are fully specified in SIG-955.
