# SIG-1073 — i18n 5/7: studio menu bar, settings dialog, activity bar and shell in PT-BR

## Goal

All chrome strings in the studio shell (top menu bar + file/edit/view menus, settings dialog,
activity bar, status bar, about dialog, share dialog, locale switcher) render from a new strict
`src/i18n/studio-chrome-strings.ts` EN/PT-BR table via `createT` (same grain as
`auth-strings`/`puzzle-strings`/`course-admin-strings`): with `pt-br` stored in
`localStorage["studio-clone-settings"]`, `/studio` shows Portuguese chrome, and switching the
locale back shows English again. Done means: the table passes `assertStringTablesAligned`, no
English UI literal remains in the listed files outside brand names and shortcut hints, the new
e2e passes in both directions, and existing `studio-move` + `pgn-import-export` e2e specs still
pass (English default unchanged).

## Scope

**In scope (files to change):**

- NEW `src/i18n/studio-chrome-strings.ts` + NEW `src/i18n/studio-chrome-strings.test.ts`
- `src/studio/MenuBar.tsx` — top menus (`File/Edit/View/Help`), `aria-label="Close menu"`,
  account menu (`My boards`, `Settings…`, `Sign out`, sync lines), share dialog, `setStatus` where
  present. Note the `dirtyCount` interpolation and `Sign in` button (Line 228-230).
- `src/studio/MenuBarFileMenu.tsx` — 14 item labels + `setStatus` strings.
- `src/studio/MenuBarEditMenu.tsx` — ~14 labels + `disabledReason` strings
  (`At start`/`In setup mode`/`No marks`).
- `src/studio/MenuBarViewMenu.tsx` — toggles, `Open panel`, `Board theme`/`Piece set`/
  `Color scheme`/`Move notation` submenus, `Settings…`, `Reset view`.
- `src/studio/SettingsDialog.tsx` — title, sections, rows, `Done`. **Do not touch the
  "E-mails" section added by SIG-1067** (owned by `email-strings.ts`); if the section exists in
  the working tree, leave it wired as-is.
- `src/studio/ActivityBar.tsx` — 5 titles + expand/collapse labels.
- `src/studio/StudioShell.tsx` — about dialog + status strings set from this file.
- `src/studio/StatusBar.tsx` — sync labels (`Guest · not synced`, `Saving…`, `Synced`),
  `thread/threads` plural. The Offline badge (SIG-1046, own table) is untouched.
- `src/i18n/LocaleSwitcher.tsx` — `aria-label="Site language"` (Line 16).
- NEW `e2e/i18n-studio-chrome.spec.ts`.

**Explicitly out of scope:**

- Sidebars (`SearchSidebar`, `BoardsSidebar`, `FilesSidebar`, `DatabasesSidebar`,
  `BookmarksSidebar`) and board/notation/engine panels — next slices.
- Game-review strings (already translated), course strings, e-mail settings section
  (SIG-1067, `email-strings.ts`), offline badge (SIG-1046).
- `setStatus` strings produced by files NOT in the target list (they live in later slices).

## Phases

### Phase 1 — New string table + unit test

Create `src/i18n/studio-chrome-strings.ts` following `src/i18n/course-admin-strings.ts` grain:

```ts
import { createT } from "./create-t.ts";
export const STUDIO_CHROME_STRING_KEYS = [ "chrome.menu.file", … ] as const;
export type StudioChromeStringKey = (typeof STUDIO_CHROME_STRING_KEYS)[number];
const EN: Record<StudioChromeStringKey, string> = { … };
const PT_BR: Record<StudioChromeStringKey, string> = { … };
export const TABLES = { en: EN, "pt-br": PT_BR };
export const tStudioChrome = createT(EN, PT_BR);
```

Key coverage (~95 keys, namespace `chrome.`):

1. `chrome.menu.file/edit/view/help`, `chrome.menu.closeMenu` (aria-label),
   `chrome.menu.aboutSite` (`About {site}` — whole-sentence template, `{site}` var).
2. Account: `chrome.account.myBoards`, `chrome.account.settings` (`Settings…`),
   `chrome.account.signOut`, `chrome.account.signIn`, `chrome.account.waitingToSync.one/other`
   (`{count} board(s) waiting to sync`), `chrome.account.allSynced`.
3. Share dialog: `chrome.share.title`, `chrome.share.body`, `chrome.share.done`,
   `chrome.share.copyLink`, `chrome.share.copied`.
4. File menu (14): `chrome.file.newBoard`, `chrome.file.openPgn`, `chrome.file.openClipboard`,
   `chrome.file.save`, `chrome.file.saveAs`, `chrome.file.exportPgn`, `chrome.file.copyPgn`,
   `chrome.file.copyFen`, `chrome.file.copyImage`, `chrome.file.share`, `chrome.file.print`,
   `chrome.file.clone`, `chrome.file.closeBoard`; status keys:
   `chrome.status.pgnCopied`, `chrome.status.fenCopied`, `chrome.status.fenFailed`,
   `chrome.status.cannotShare`, `chrome.status.boardNotOpen`, `chrome.status.imageCopied`,
   `chrome.status.imageDownloaded`, `chrome.status.imageFailed`,
   `chrome.status.savedPgnFile`, `chrome.status.boardSaved`, `chrome.status.saveFailed`.
5. Edit menu (~14 + 3 reasons): `chrome.edit.undo/redo/setupBoard/gameInfo/promote/makeMainline/
   deleteVariation/deleteAfter/textAfter/textBefore/insertNull/clearMarks/goStart/goEnd`,
   `chrome.edit.reason.atStart/inSetupMode/noMarks`.
6. View menu: `chrome.view.flip/showCoordinates/showEvalBar/gamePreview/moveSound/
   compactNotation/openPanel/explorer/board/boardTheme/pieceSet/colorScheme/moveNotation/
   settings/resetView`.
7. Settings: `chrome.settings.title/done/appearance/colorScheme/boardTheme/pieceSet/board/
   showCoordinates/showEvalBar/moveSound/gamePreview/engine/notation/moveNotation/
   notationDensity/gameReview/savedReviews/clearReviews/language/siteLanguage`.
8. Activity: `chrome.activity.search/boards/databases/files/bookmarks/expand/collapse`.
9. Status: `chrome.statusBar.guest/saving/synced`, `chrome.statusBar.threads.one/other`
   (`{count} thread(s)` — one/other plural pair like puzzle-strings `solvedCount`).
10. Locale switcher: `chrome.locale.siteLanguage` (aria-label).
11. About dialog (StudioShell): `chrome.about.body/engine/openingData/storage`,
    `chrome.about.close`, `chrome.shell.courseLineFailed`, `chrome.shell.saveFailed`.
12. Explorer-panel menu label copy `chrome.view.panel.explorer` and per-item panel copies
    `chrome.view.panel.<id>` (see assumption 3).

PT-BR translations (authoritative; use verbatim):

- Menus: Arquivo, Editar, Ver, Ajuda, `Sobre {site}`, Fechar menu.
- Account: Meus tabuleiros, Configurações…, Sair, Entrar,
  one: `{count} tabuleiro aguardando sincronização`, other: `{count} tabuleiros aguardando sincronização`,
  Todos os tabuleiros sincronizados.
- Share: Compartilhar tabuleiro, Qualquer pessoa com este link abre esta posição em um novo tabuleiro.,
  Concluir, Copiar link, Copiado.
- File: Novo tabuleiro vazio, Abrir PGN…, Abrir da área de transferência, Salvar, Salvar como…,
  Exportar PGN, Copiar PGN, Copiar FEN, Copiar imagem do tabuleiro, Compartilhar tabuleiro…,
  Imprimir, Duplicar tabuleiro, Fechar tabuleiro.
- File status: PGN copiado para a área de transferência, FEN copiado para a área de transferência,
  Não foi possível copiar o FEN, Esta posição não pode ser compartilhada, O tabuleiro não está aberto,
  Imagem do tabuleiro copiada, Imagem do tabuleiro baixada, Não foi possível copiar a imagem do tabuleiro,
  Salvo como arquivo PGN (entre para salvar na nuvem), Tabuleiro salvo, Falha ao salvar.
- Edit: Desfazer, Refazer, Configurar tabuleiro, Informações da partida, Promover variante,
  Tornar linha principal, Excluir variante, Excluir após, Texto após o lance, Texto antes do lance,
  Inserir lance nulo, Limpar setas e destaques, Ir para o início, Ir para o fim;
  reasons: No início, No modo de configuração, Sem marcações.
- View: Virar tabuleiro, Mostrar coordenadas, Mostrar barra de avaliação, Modo de prévia de partidas,
  Som de lance, Notação compacta, Abrir painel, Explorador, Tabuleiro, Tema do tabuleiro,
  Conjunto de peças, Esquema de cores, Notação de lances, Configurações…, Redefinir visualização.
- Settings: Configurações, Concluir, Aparência, Esquema de cores, Tema do tabuleiro,
  Conjunto de peças, Tabuleiro, Mostrar coordenadas, Mostrar barra de avaliação, Som de lance,
  Modo de prévia de partidas, Motor, Notação, Notação de lances, Densidade da notação,
  Revisão de partida, Revisões salvas, Limpar revisões salvas, Idioma, Idioma do site.
- Activity: Buscar, Tabuleiros abertos, Bases de dados, Arquivos, Favoritos,
  Expandir barra lateral, Recolher barra lateral.
- Status: Convidado · sem sincronização, Salvando…, Sincronizado,
  one: `{count} thread`, other: `{count} threads` (keep "thread" as loanword — engine jargon).
- Locale: Idioma do site.
- About: `chrome.about.body` — "GUI de análise inspirada no ChessMonitor Studio. Nenhum recurso
  ou base de dados privada do ChessMonitor é utilizado."; `chrome.about.engine` — keep
  "Stockfish 19 lite, executado localmente" (proper name Stockfish untranslated);
  `chrome.about.openingData` — Explorador público do Lichess (proper name Lichess kept);
  `chrome.about.storage` — "Os tabuleiros sincronizam com sua conta quando você está conectado";
  `chrome.about.close` — Fechar. Shell: `chrome.shell.courseLineFailed` —
  "Não foi possível abrir essa linha de curso."; `chrome.shell.saveFailed` —
  "Não foi possível salvar o tabuleiro."
- `chrome.view.panel.*`: reuse the panel-name PT-BR decided in the later panel slice? No —
  this slice needs them now; use: Notação, Repertório, Motor, Gráfico de avaliação,
  Revisão de partida, Insights, Ultra Database (brand, keep), Ultra Games (brand, keep),
  Partidas, Busca de posição. Mark with `// panels slice owns canonical names` so the later
  slice can reconcile.

Create `src/i18n/studio-chrome-strings.test.ts` mirroring `auth-strings.test.ts`: alignment
check + every key non-empty in both locales + spot-check one interpolated sentence per locale
(e.g. `waitingToSync.other` with `{count: 3}` and `threads.other` with `{count: 4}`).

Verify: `npm test -- src/i18n/studio-chrome-strings.test.ts` (repo script:
`node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test "src/**/*.test.ts"…`).

### Phase 2 — Wire components through `t(locale, …)`

Pattern (already used by ReviewPanel/puzzle slices): in each client component,
`const locale = useStudioStore((state) => state.settings.locale);` then
`tStudioChrome(locale, "chrome.…")`. `MenuBar.tsx` already subscribes to locale (line 59).
`MenuBarFileMenu/EditMenu/ViewMenu`, `SettingsDialog`, `ActivityBar`, `StatusBar`,
`StudioShell`, `LocaleSwitcher` each add the one-line subscription.

Per-file edits:

- `MenuBar.tsx`: replace `TOP_MENUS` literal labels with keys; `aria-label="Close menu"` →
  `chrome.menu.closeMenu`; `About ${SITE_NAME}` → `tStudioChrome(locale, "chrome.menu.aboutSite", { site: SITE_NAME })`;
  account sync line → `waitingToSync.one/other` keyed on `dirtyCount === 1` (same one/other
  pattern as `puzzle.feedback.solvedCount`); `My boards`/`Settings…`/`Sign out`/`Sign in`;
  share dialog 5 strings. Shortcut props untouched.
- `MenuBarFileMenu.tsx`: 14 `label=` + `setStatus(…)` literals → table keys.
  `openPgnSource("Clipboard", …)` — the string `"Clipboard"` is a board title, NOT chrome:
  leave untranslated (author/content data, same rule as course content).
  `saveBoard` catch: `error instanceof Error ? error.message : "Save failed"` — keep the
  `error.message` passthrough (runtime server message, cannot be keyed); only the fallback
  `"Save failed"` becomes `chrome.status.saveFailed`.
- `MenuBarEditMenu.tsx`: labels + 3 `disabledReason`.
- `MenuBarViewMenu.tsx`: toggles, submenu labels, `Settings…`, `Reset view`;
  `"Board"` (line 99) and `"Explorer"` (line 108) and `OPEN_PANEL_ITEMS` labels →
  `chrome.view.panel.*` copies; `BOARD_THEMES`/`PIECE_SETS`/`COLOR_SCHEMES`/`MOVE_NOTATIONS`/
  `NOTATION_DENSITIES`/`ENGINE_BUILD_INFO` option labels stay as-is (proper names / later slices).
- `SettingsDialog.tsx`: title/sections/rows/`Done`/toggle `label=` (same string as row label);
  `SITE_LOCALE_LABELS` options untouched (already localized); E-mails section untouched.
- `ActivityBar.tsx`: `items` titles + expand/collapse ternaries → keys.
- `StatusBar.tsx`: sync labels; `{threads} thread{s}` → `threads.one/other` keyed on
  `threads === 1`; `explorerSourceTitle(…)` and `ENGINE_BUILD_INFO…label` untouched.
- `StudioShell.tsx`: about dialog (body paragraph, Engine/Opening data/Storage rows, Close
  button) + the two status strings (`Could not open that course line.`, `Could not save board.`).
- `LocaleSwitcher.tsx`: `aria-label` → `chrome.locale.siteLanguage`.

Verify per file: `npx tsc --noEmit` after each 2–3 files; then
`grep -rn '"[A-Z][a-z…]'` spot-check (see Risks) + `npm run lint`.

### Phase 3 — e2e spec `e2e/i18n-studio-chrome.spec.ts`

Follow `e2e/i18n-auth.spec.ts` localStorage pattern. Two tests in one file:

1. `beforeEach` seeds `localStorage["studio-clone-settings"] = JSON.stringify({ locale: "pt-br" })`;
   `page.goto("/studio")`; assert Portuguese chrome visible (`Arquivo`, `Configurações`,
   `Tabuleiros abertos` tooltip/aria) and English absent (`File` menu button count 0 —
   scope the `getByText("File")` query to the menubar to avoid false hits from panel content).
2. Same seed, then switch back: open Settings via the `Ver` menu → `Configurações…` item,
   change `Idioma do site` select to English, assert `File` reappears and `Arquivo` count is 0.

Keep selectors robust: prefer `getByRole("button", { name: … })` for menu buttons and dialog
title roles. Do NOT assert on sidebar/panel content (later slices).

Verify: `npx playwright test e2e/i18n-studio-chrome.spec.ts`
then the regression pair `npx playwright test e2e/studio-move.spec.ts e2e/pgn-import-export.spec.ts`
(English default must be unchanged).
Full gate: `npm test` · `npm run lint` · `npx tsc --noEmit` · `npm run build`.

## Risks

- **Grep acceptance vs. shared constants.** `OPTION` label constants (`BOARD_THEMES`,
  `COLOR_SCHEMES`, `MOVE_NOTATIONS`, `NOTATION_DENSITIES`, `ENGINE_BUILD_INFO`,
  `OPEN_PANEL_ITEMS`, `explorerSourceTitle`) legally remain English in the touched files
  because they are imported shared constants, not literals. The "no English literal" grep
  must target string *literals* (`label="…"`, `>"…"<`, `"…"` args), not rendered English words.
  Paste the exact grep used in the PR description and document exclusions
  (`Clipboard` board title, `error.message` passthrough, shared-constant references).
- **Menu-item English words inside PT-BR.** Words like "Explorer", "Ultra Database" are kept
  deliberately (proper names / later panel slice owns canonical panel names). Call this out in
  the PR so reviewers don't flag it.
- **Settings E-mails section (SIG-1067).** If the working tree already contains it, do not
  rewire it; merge conflicts with that slice are the maintaner's call.
- **`waitingToSync` plural shape.** Prior slices use `.one`/`.other` key pairs resolved in the
  component (`edits.length > 0 ? … : …` in ReviewPanel). Follow that — no ICU, no new plural
  helper.

## Assumptions

1. (Triage correction) Issue lists StatusBar strings as counted but omits `StatusBar.tsx`
   from target files "rendered through `t(locale, …)`". Decision: StatusBar sync labels and
   thread plural ARE in scope and `StatusBar.tsx` IS wired — the sync/thread strings cannot be
   translated otherwise, and the issue counts them in its own grep.
2. (Triage open Q1 resolved) `setStatus` strings produced inside the 8 listed files +
   `StatusBar.tsx` are in scope (they render through `StatusBar`'s message prop); `setStatus`
   strings from non-listed files belong to later slices.
3. (Triage open Q2 resolved) Option-label policy: `BOARD_THEMES`/`PIECE_SETS`/
   `COLOR_SCHEMES`/`MOVE_NOTATIONS`/`NOTATION_DENSITIES`/`ENGINE_BUILD_INFO` values are proper
   names or later-slice vocabulary — NOT translated here; the chrome table only covers the row/
   submenu chrome around them plus dedicated `chrome.view.panel.*` menu copies for panel names.
4. `About {site}` and `{count}` lines are whole-sentence templates with vars (prior-slice
   convention); shortcut hints (`Ctrl+N`…) and brand names (`SITE_NAME`, Stockfish, Lichess,
   Ultra Database/Games, PGN/FEN) stay untranslated; `"Clipboard"` in `openPgnSource` is board
   content data, not chrome.
5. `Game Review` → `Revisão de partida` matches the existing game-review slice vocabulary
   (verify against `src/i18n/strings.ts` during implementation; if that file uses a different
   term, follow it and note the change).

## Open questions

None — both triage questions are resolved above as assumptions; remaining uncertainty
(panel canonical names) is flagged inline for the later slice to reconcile.
