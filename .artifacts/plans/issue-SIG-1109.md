# SIG-1109 — Mobile bottom sheet, long-press menus, swipe navigation — plan

## Goal

At 390×844 a phone user opens a PGN from a hamburger bottom sheet, swipes the
board to step through moves, long-presses the board or a strip move to open
the same context menus as desktop right-click, and runs the engine and a
(fake-engine) review — with no horizontal scroll at any step. Gesture helpers
are unit-tested at their thresholds; desktop right-click menus and the desktop
menu bar behave exactly as before (existing unit + e2e suites green).

## Scope

In:
- `src/studio/use-gestures.ts` (new): pure `swipeDirection` + `createLongPress`
  helpers and thin React hooks, plus `src/studio/use-gestures.test.ts`
  (node:test, no DOM).
- Sheet strings in `src/i18n/mobile-strings.ts` (+ alignment test update).
- Menu-item reuse: extract File/Edit/View item lists into shared section
  renderers used by both the desktop menus and the sheet; desktop behavior
  unchanged.
- `src/studio/BottomSheet.tsx` (new): bottom-anchored sheet built on the same
  scrim/focus/Escape pattern as `src/studio/ui/Dialog.tsx`.
- `src/studio/MobileStudio.tsx`: compact header (hamburger + sheet) replacing
  the desktop `MenuBar` on mobile; `StudioShell.tsx` hides `MenuBar` below
  768 px and passes the existing `onOpenPgn` (hidden file input) through.
- Touch wiring: board swipe (left = forward, right = back via store
  `back`/`forward`); board long-press opens `BoardContextMenu` at the touch
  point; strip-move long-press opens `NotationContextMenu` at the touch point.
- `e2e/mobile-studio.spec.ts`: new `mobile`-project test (sheet → Open PGN via
  `setInputFiles`, swipe position change, long-press menu, Review fake-engine
  run, no h-scroll at every step).

Out (per issue): pinch-zoom, piece drag-and-drop tuning, activity sidebars on
mobile. Also out: mobile account/sign-in and locale switching — hiding
`MenuBar` on mobile removes the account pill and `LocaleSwitcher` from the
studio route; recorded as a follow-up, not this slice.

## Phases

### Phase 1 — gesture helpers + unit tests

New `src/studio/use-gestures.ts`:
- `swipeDirection(start, end, { minDistance = 40, maxVertical = 30 })` →
  `"left" | "right" | null`. Pure: horizontal-dominant
  (`|dy| <= maxVertical`), `dx >= minDistance` → `"left"` (forward),
  `dx <= -minDistance` → `"right"` (back), else `null`.
  (Swipe left = finger moves left = forward one move, matching toolbar
  forward semantics.)
- `createLongPress({ delayMs = 500, moveTolerance = 10 })` returning a small
  controller `{ start(point, onFire), move(point), end(), cancel() }` backed
  by `setTimeout`; fires `onFire` at most once per `start`; any `move` beyond
  `moveTolerance` or `end()`/`cancel()` before the delay suppresses the fire.
  Thin hooks (`useSwipeNav`, `useLongPress`) wrap these for React; hooks stay
  trivial so the node:test suite exercises the pure logic faithfully (same
  pattern as `watchMobileMedia` in `use-is-mobile.ts`).
- New `src/studio/use-gestures.test.ts` (node:test, runs under repo `npm
  test`): 39 px vs 41 px swipe, vertical drift above/below `maxVertical`,
  wrong-direction sign, long-press fires once after `delayMs`, movement beyond
  tolerance cancels, `end()`/`cancel()` before delay suppresses.

Verify: `npm test -- src/studio/use-gestures.test.ts` (via test-resolve
runner), `npx tsc --noEmit`.

### Phase 2 — sheet strings + BottomSheet + menu-item reuse

- `src/i18n/mobile-strings.ts`: add ~3 keys (`mobile.menu.open` hamburger
  aria-label, `mobile.menu.title` sheet title, `mobile.menu.close`); section
  headers reuse existing `chrome.menu.file/edit/view` strings (no duplication).
  Extend `src/i18n/mobile-strings.test.ts` short-label assertions.
- New `src/studio/BottomSheet.tsx`: same scrim (`bg-studio-scrim`), focus trap
  (`useDialogFocus`), and Escape handling as `Dialog.tsx`, but panel anchored
  bottom (`items-end`, full-width, `max-h-[80dvh]`, rounded top, scrollable
  content, 44 px touch targets). `role="dialog" aria-modal`.
- Refactor `MenuBarFileMenu.tsx` / `MenuBarEditMenu.tsx` /
  `MenuBarViewMenu.tsx` to export shared section renderers (e.g.
  `FileMenuItems`, `EditMenuItems`, `ViewMenuItems`) taking explicit props
  (`run`, `close`, plus each menu's current extras); desktop `MenuBar*`
  components become thin wrappers so desktop rendering is unchanged.
  Sheet-only adaptations behind an explicit prop (default off): flatten View
  submenus (theme/pieces/notation/scheme lists become inline sheet sections)
  and omit dock-only panel-management items (`openPanel` submenu and board /
  explorer openers — `openStudioPanel`/`openBoardPanel` are no-ops without a
  registered dock on mobile).
- Share/settings dialogs currently live in `MenuBar` state (`shareUrl`,
  `settingsOpen`): the sheet owns equivalent state and renders the share
  result `Dialog` + `SettingsDialog`, so File "Share…" and View "Settings"
  keep working from the sheet.

Verify: `npm test`, `npm run lint`, `npx tsc --noEmit`.

### Phase 3 — MobileStudio header + StudioShell wiring

- `MobileStudio.tsx`: compact header row above the board (hamburger button
  with `mobile.menu.open` label → opens `BottomSheet` with the File/Edit/View
  sections; "Open PGN…" calls the passed `onOpenPgn`). Accept `onOpenPgn`
  prop.
- `StudioShell.tsx`: on mobile render the compact header path instead of
  `MenuBar` (pass `() => fileRef.current?.click()` as `onOpenPgn`, same
  handler `MenuBar` uses today); desktop branch untouched.
- Sheet closes after any item action (reuse each menu's `run`/`close`
  protocol); sheet content scrolls vertically, never horizontally at 390 px.

Verify: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

### Phase 4 — touch gestures on board and strip

- `BoardPanel.tsx` (touch events only fire on touch devices, so desktop mouse
  behavior is untouched): `onTouchStart/Move/End` on the outer board wrapper
  — horizontal-dominant swipe via `swipeDirection` calls store `forward()` /
  `back()`; long-press via `createLongPress` calls the existing
  `setBoardMenu({ x, y })` with the touch point (same `BoardContextMenu`, no
  duplication). Long-press is suppressed while a piece drag is in progress
  (touch moved beyond tolerance, or chessboard drag claimed the gesture).
- `MobileMoveStrip.tsx`: long-press on a strip move button calls the same
  open-menu path as desktop `handleAnnotate` (`goPath` + menu at touch point)
  rendering the existing `NotationContextMenu` with the same store wiring as
  `NotationPanel` (comment/promote/makeMainline/prune/insertNull/nag actions).
  Tap (short press) keeps the current `goPath` jump behavior.
- Guard: swipe and long-press must not double-trigger (a swipe that exceeds
  `moveTolerance` cancels the pending long-press via the controller).

Verify: `npm test`, `npx tsc --noEmit`.

### Phase 5 — e2e + full verification

New test in `e2e/mobile-studio.spec.ts` (`mobile` project, 390×844):
1. Open the sheet via the hamburger, choose "Open PGN…" and `setInputFiles`
   the `TABS_GAME` PGN.
2. Swipe on the board via CDP `Input.dispatchTouchEvent`
   (`touchStart` → `touchMove` → `touchEnd`, `page.context().newCDPSession(page)`;
   `page.touchscreen.tap()` only emits taps, so raw CDP events are needed for
   swipe/long-press) and assert the board position changed (same `wP` e4/e2
   readback pattern as the existing test).
3. Long-press (touchStart, wait > 500 ms, touchEnd) a strip move and assert
   the notation context menu appears; assert no `document` horizontal
   overflow after every step.
4. Switch to the Review tab and complete the fake-engine review (same pattern
   as the existing tabs test).

Full verification: `npm test` · `npm run lint` · `npx tsc --noEmit` ·
`npm run build` · `npx playwright test` (both `chromium` and `mobile`
projects — desktop specs prove no regression).

## Risks

- `react-chessboard` touch handling may swallow or compete with board-level
  swipe/long-press (piece drag vs swipe disambiguation). Check: new e2e swipe
  and long-press steps on a real Chromium touch context; if the board wrapper
  proves unreliable, fall back to attaching swipe to the strip/board-adjacent
  area (still satisfies "swipe through the moves").
- View-menu submenu state (`viewSub`/`setViewSub` hover model) does not
  transfer to a sheet — hence flattening into sections (Phase 2), never hover
  submenus in the sheet.
- `window.innerWidth`-clamped menu positioning (`BoardContextMenu`,
  `NotationContextMenu`) at 390 px — the e2e overflow assertions catch
  regressions; fix only proven offenders.
- Hiding `MenuBar` on mobile removes account/locale UI on the studio route
  (follow-up, recorded out of scope).

## Assumptions

- Triage claims re-verified against the current tree (branch
  `factory/linear-sig-1109`, HEAD `f1a37db` = SIG-1108 tabs): `MobileStudio`
  has board + strip + tab bar and no header/sheet; no `use-gestures` /
  `BottomSheet` / swipe / long-press code exists; menus open only via
  `onContextMenu`; SIG-1108 is Done so the dependency is satisfied.
- Sheet reuses the File/Edit/View item definitions (extracted shared
  renderers), not reimplemented actions; desktop wrappers keep identical
  output.
- The triage open question (hide desktop `MenuBar` below 768 px?) is decided:
  yes — requirement 3 says "replace the menu bar with a compact header".
- Swipe left = forward, right = back (toolbar/strip semantics).
- Strip long-press renders the same `NotationContextMenu` with `NotationPanel`
  wiring; board long-press renders the same `BoardContextMenu`.
- Node:test style (`node:assert/strict` + `node:test`, fake timers where
  needed) matches `use-is-mobile.test.ts` / `mobile-strings.test.ts` and runs
  under the repo `npm test` runner.
- No test removed or skipped (aceitação explícita).

## Open questions

None — all design forks resolved above; the account/locale-on-mobile gap is a
follow-up, not a blocker.
