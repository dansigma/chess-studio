# SIG-1129 — Fix e2e after i18n 7/7 (ambiguous locator + flaky locale read)

## Goal

Make the e2e suite green and stable again with a test-only fix: the two specs
`e2e/i18n-studio-sidebars.spec.ts` and `e2e/i18n-studio-panels.spec.ts` pass with
`--repeat-each=5`, and the full `npx playwright test` run has no failed and no
flaky tests. "Done" is verifiable in CI (e2e job green) and locally via the
commands below.

## Scope

**In:**
- `e2e/i18n-studio-sidebars.spec.ts:29` — scope the `"Novo tabuleiro"` button
  locator to the sidebar (`page.getByRole("complementary").getByRole("button",
  { name: "Novo tabuleiro" })`).
- `e2e/i18n-studio-panels.spec.ts:74-80` — replace the one-shot localStorage
  read with `await expect.poll(() => page.evaluate(...)).toBe("en")`; delete
  the dead `context.storageState()` / `void stored` lines at `:75-76`.
- Audit of sibling assertions in both new i18n specs for the same ambiguity.

**Out:**
- No app-code changes (both translations and the 400 ms persist debounce are
  intended behavior).
- No test removals or skips; no new specs; no fixture/config changes.

## Phases

### Phase 1 — Scope the sidebar button locator

**Changes** (`e2e/i18n-studio-sidebars.spec.ts` only):
- Line 29: `await expect(page.getByRole("button", { name: "Novo tabuleiro" })).toBeVisible();`
  →
  `await expect(page.getByRole("complementary").getByRole("button", { name: "Novo tabuleiro" })).toBeVisible();`
- Root cause: SIG-1075 (PR #133, `panels.board.newBoard` at
  `src/studio/StudioDock.tsx:128`) introduced a second button with the identical
  pt-BR accessible name `"Novo tabuleiro"` (`src/studio/BoardsSidebar.tsx:70`
  via `sidebar.boards.newBoard`). `SidebarPanel` renders a bare `<aside>`
  (`src/studio/ui/Sidebar.tsx:19`) → implicit `complementary` role, so scoping
  to `complementary` selects exactly the sidebar button.
- Sibling audit (already done in triage, re-confirm while editing): `:19`
  `"Arquivos"` uses `.first()`; `:28` heading `"Tabuleiros abertos"` is
  role-`heading` (no clash with the activity-bar button); chrome `:30`
  `/Novo tabuleiro vazio/` is role-`menuitem`; panels tabs use `.first()`.
  Expected outcome: no other locator needs changing.

**Tests / verification:**
- `npx playwright test e2e/i18n-studio-sidebars.spec.ts --repeat-each=5`
  (previously hard-failed with strict-mode violation).

### Phase 2 — Make the locale persistence read retrying

**Changes** (`e2e/i18n-studio-panels.spec.ts` only, lines 74-80):
- Replace:
  ```ts
  const stored = await context.storageState();
  void stored;
  const locale = await page.evaluate(
    () => JSON.parse(window.localStorage.getItem("studio-clone-settings") ?? "{}").locale,
  );
  expect(locale).toBe("en");
  ```
  with:
  ```ts
  await expect
    .poll(() => page.evaluate(
      () => JSON.parse(window.localStorage.getItem("studio-clone-settings") ?? "{}").locale,
    ))
    .toBe("en");
  ```
- Root cause: `selectOption("en")` flips the store/UI synchronously
  (`SettingsDialog.tsx:178-181` → `setLocale`), but persistence is debounced
  400 ms (`StudioShell.tsx:185-190` → `persistSettingsRecord`,
  `src/lib/studio-persistence.ts:66-72`). The English-UI assertions at `:64-72`
  can pass before the timer fires, so the one-shot read sees stale `"pt-br"`.
  `expect.poll` retries until the debounce lands; no fixed sleeps.
- `expect.poll` precedent exists in-repo (`e2e/puzzle-trainer.spec.ts:144`);
  `@playwright/test ^1.64.0` supports it.
- `context` fixture param becomes unused after deleting the dead
  `storageState()` lines — remove it from that test's destructuring if lint
  flags it (keep the other test's `context` for its `addInitScript`).

**Tests / verification:**
- `npx playwright test e2e/i18n-studio-panels.spec.ts --repeat-each=5`
  (previously flaky: `"pt-br"` vs `"en"` on first attempt).

### Phase 3 — Full verification

- `npm run lint`
- `npx tsc --noEmit`
- `npx playwright test e2e/i18n-studio-sidebars.spec.ts e2e/i18n-studio-panels.spec.ts --repeat-each=5`
- Full `npx playwright test`
- Confirm `git status --short` shows only files under `e2e/` changed.

## Risks

- **`complementary` scope matches 0 or 2+ elements:** mitigated — `SidebarPanel`
  renders `<aside>` and boards is the default sidebar, so exactly one is
  visible; if the locator still misbehaves, fall back to scoping via the
  `"Tabuleiros abertos"` heading's ancestor instead.
- **`expect.poll` default timeout too short under load:** the 400 ms debounce
  is far below the default 5 s poll timeout; safe margin.
- **Pre-existing flakes elsewhere in the full suite:** out of scope, but report
  them distinctly from these two specs rather than folding unrelated fixes in.

## Assumptions

- CI-log excerpts in SIG-1129 are accurate; verified consistent with code (raw
  log not re-fetched).
- No app-code change needed — test-only fix under `e2e/` per the issue's
  acceptance criteria (`Only files under e2e/ change`, no removed/skipped tests).
- `expect.poll` available (`@playwright/test ^1.64.0`, precedent at
  `e2e/puzzle-trainer.spec.ts:144`).
- Rejected alternative: fixed `waitForTimeout` before the localStorage read —
  rejected per the issue's explicit "no fixed sleeps" requirement and because it
  trades one race for a slower one.
- Rejected alternative: disambiguating via `.first()`/`.nth()` — rejected
  because index-based selection is order-fragile; semantic `complementary`
  scoping names the intent.
- Rejected alternative: changing either `"Novo tabuleiro"` translation —
  rejected; both strings are intended product copy in different slices.

## Open questions

- None blocking.
