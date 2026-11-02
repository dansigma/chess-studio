# SIG-1187 — Plan: Forward continuation chooser at branching positions

## Goal

Pressing Forward (ArrowRight, notation toolbar, board swipe, mobile strip) from a node
with 2+ children opens a modal "Choose a continuation" dialog listing every child in
tree order instead of silently following child 0. Selecting an option moves exactly one
ply to that child; a single-child node still advances automatically with no dialog.
Done means: store gates `forward()` on child count, the dialog works from `StudioShell`
in EN + PT-BR with full keyboard support, and tree/store/component/e2e tests pin the
behavior. Verification: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`,
`npx playwright test e2e/studio-variations.spec.ts e2e/studio-move.spec.ts`.

## Scope

In:
- `continuationsAt(tree, path)` export in `src/chess/tree.ts` (no changes to
  `goForward` / `goForwardN` / `goEnd`).
- `variationChoice: { boardId: string; path: Path } | null` in the boards slice
  (`initialBoardsState` + `SessionResetPayload` in `studio-store.ts`), gated
  `forward()`, new `chooseVariation(index)` / `cancelVariationChoice()`, and clearing
  in `setActiveBoard` / `newBoard` / `cloneBoard` / `closeBoard` / `goPath`.
- `src/studio/VariationChoiceDialog.tsx` rendered from `StudioShell`, using the
  existing `Dialog` + `tPanels` strings; move labels `{moveNumber}{. | ...} {SAN}`
  via `moveNumberForPath` / `plyColor`; first-option autofocus; click + 1–9 +
  ArrowUp/Down/Home/End/Enter + Escape/outside-click/Cancel.
- Four new i18n keys (`notation.variationChooser.title/body/mainline/hint`) in all
  three places in `src/i18n/studio-panel-strings.ts` (KEYS list, EN, PT-BR); dialog
  Cancel reuses `dialog.cancel`.
- Tests: tree (`src/chess/tree.test.ts`), store (`src/store/slices/boards.test.ts`),
  component (`src/studio/VariationChoiceDialog.test.tsx`, new), e2e
  (`e2e/studio-variations.spec.ts`, new).

Out (unchanged behavior):
- `skipForward`, `toEnd`, autoplay, PGN import keep following child 0.
- Notation variation rendering, mainline ordering, `MobileMoveStrip` mainline-only
  model (its Next button just calls the same gated `forward()`; keep its existing
  `currentIndex >= moves.length - 1` disabled rule).
- No settings toggle; no shortcuts beyond the dialog's 1–9/arrows/Enter/Escape; no
  touch long-press menus (SIG-1109).
- `redo` keeps aliasing `forward()` and therefore inherits the chooser.

## Phases

### Phase 1 — Tree helper + unit tests

File: `src/chess/tree.ts`, `src/chess/tree.test.ts`.
- Add next to `childrenAt`:

  ```ts
  export function continuationsAt(tree: GameTree, path: Path): TreeNode[] {
    return childrenAt(tree, path) ?? [];
  }
  ```

  Private `childrenAt` already returns `tree.children` for `[]` and the node's
  children otherwise, `null` only for an invalid path — so `?? []` yields exactly
  the spec semantics (root children / nested children / `[]` on invalid path).
  Do not touch `goForward`, `goForwardN`, `goEnd`.
- Tests in `tree.test.ts` (reuse the existing `sampleTree()`, which already has
  root children `[e4, d4]` and nested `[e5, c5]` under `[0]`):
  - root: `continuationsAt(tree, []).map(n => n.san)` deep-equals `["e4", "d4"]`;
  - nested: `continuationsAt(tree, [0])` SANs are `["e5", "c5"]`;
  - leaf/invalid: `continuationsAt(tree, [1])` and `continuationsAt(tree, [9])`
    both deep-equal `[]`.
- Verify: `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test src/chess/tree.test.ts`

### Phase 2 — Store: choice state, gated forward, choose/cancel, clearing

Files: `src/store/slices/types.ts`, `src/store/slices/boards.ts`,
`src/store/studio-store.ts`.

1. `types.ts`:
   - Add `export type VariationChoice = { boardId: string; path: Path };`
   - Add to `StudioState`: `variationChoice: VariationChoice | null;`
   - Add actions: `chooseVariation: (index: number) => void;`,
     `cancelVariationChoice: () => void;`
2. `boards.ts`:
   - Import `continuationsAt`; extend the `BoardsSlice` Pick with
     `"variationChoice" | "chooseVariation" | "cancelVariationChoice"`.
   - `initialBoardsState`: add `variationChoice: null`.
   - `newBoard`: set `variationChoice: null` in both `set` calls. `cloneBoard`:
     set `variationChoice: null` in its `set` call. `closeBoard`: add
     `variationChoice: null` to the returned object. `setActiveBoard`: add
     `variationChoice: null` to the `set` object. `goPath`: add
     `variationChoice: null` to the `set` object (keep its `threat: null` and
     `soundForAdvance` behavior).
   - Rewrite `forward()`:

     ```ts
     forward: () => {
       if (get().training) return;
       if (get().variationChoice) return; // choice already open: no-op
       const board = get().active();
       const continuations = continuationsAt(board.tree, board.path);
       if (continuations.length === 0) return;          // 0 children: no-op
       if (continuations.length === 1) {
         const previous = board.path;                    // 1 child: as today
         set((state) => ({
           threat: null,
           boards: withActive(state.boards, state.activeBoardId, (b) => ({
             ...b, path: goForward(b.tree, b.path),
           })),
         }));
         soundForAdvance(get, previous);
         return;
       }
       set({ variationChoice: { boardId: board.id, path: [...board.path] } });
       // path untouched, no sound
     },
     ```

     Reads `get().active()` outside `set` (same grain as `makeUciMove`); the
     single-child branch reuses `goForward` via `withActive` so per-board trees
     stay correct. `redo` (`get().forward()`) inherits the gate unchanged.
   - Add:

     ```ts
     chooseVariation: (index) => {
       const choice = get().variationChoice;
       if (!choice) return;
       const board = get().active();
       const valid =
         board.id === choice.boardId &&
         pathsEqual(board.path, choice.path); // import pathsEqual from tree.ts
       const continuations = valid ? continuationsAt(board.tree, choice.path) : [];
       if (
         !valid ||
         !Number.isInteger(index) ||
         index < 0 ||
         index >= continuations.length
       ) {
         set({ variationChoice: null });
         return;
       }
       const previous = board.path;
       set((state) => ({
         threat: null,
         variationChoice: null,
         boards: withActive(state.boards, state.activeBoardId, (b) => ({
           ...b, path: [...choice.path, index],
         })),
       }));
       soundForAdvance(get, previous);
     },
     cancelVariationChoice: () => {
       if (get().variationChoice) set({ variationChoice: null });
     },
     ```

     Clearing `threat` on choose mirrors every other navigation action in this
     slice. `back`/`toStart` while a choice is open are left alone per spec
     (only the five listed actions clear); the choice self-invalidates via the
     stale path check on next `chooseVariation`, and `forward()` stays a no-op
     until the user cancels or picks.
3. `studio-store.ts` `resetSessionState`: add `variationChoice: null` to the
   `sessionReset` object (it is `satisfies SessionResetPayload`, so the new
   non-function key must appear there or `tsc` fails).
4. Store tests in `src/store/slices/boards.test.ts` (new `describe`, seed via
   `useStudioStore.setState` like the SIG-916 block; build trees with
   `playMove(createEmptyTree(), [], MOVE)` chains or `importPgn`):
   - 2+ children: `forward()` leaves `path` unchanged and sets
     `variationChoice` to `{ boardId, path }`; second `forward()` is a no-op
     (choice unchanged).
   - 1 child: `forward()` advances to `[...path, 0]` with no choice set.
   - 0 children: `forward()` no-ops, no choice.
   - `chooseVariation(1)` moves to `[...choice.path, 1]` and clears the choice.
   - cancel leaves the path; stale board/path (switch board, or `goPath`
     elsewhere first — note `goPath` clears, so seed the stale state with a raw
     `setState` to simulate a mid-flight tree swap) clears the choice without
     moving.
   - clearing: open a choice, then each of `setActiveBoard` / `newBoard` /
     `cloneBoard` / `closeBoard` / `goPath` yields `variationChoice: null`.
- Verify: `node --experimental-test-module-mocks --import ./scripts/test-resolve.mjs --test src/store/slices/boards.test.ts` then
  `npx tsc --noEmit` (catches the `SessionResetPayload` / Pick omissions).

Rejected alternative: storing the choice per-board inside `BoardSession`. The
  spec fixes global (single-open-dialog) semantics and five explicit clearing
  points; a top-level nullable field is simpler, matches `aboutOpen` /
  `notationEditor` precedent, and needs no guest-board persistence changes
  (guest save/load only round-trips PGN+path+metadata, so a transient choice
  never persists — correct).

### Phase 3 — Strings

File: `src/i18n/studio-panel-strings.ts` (three edits, same order each time):
- KEYS list (after `"notation.menu.inSetupMode"`): add
  `"notation.variationChooser.title"`, `"notation.variationChooser.body"`,
  `"notation.variationChooser.mainline"`, `"notation.variationChooser.hint"`.
- EN table (after `"notation.menu.inSetupMode": "In setup mode",`): title
  `"Choose a continuation"`, body
  `"This position has more than one move. Pick the one to follow."`, mainline
  `"Main line"`, hint `"1–9 or ↑↓ then Enter"` (en-dash U+2013, up/down arrows
  U+2191/U+2193, matching file conventions).
- PT-BR table (after `"notation.menu.inSetupMode": "No modo de configuração",`):
  title `"Escolher uma continuação"`, body
  `"Esta posição tem mais de um lance. Escolha qual seguir."`, mainline
  `"Linha principal"`, hint `"1–9 ou ↑↓ e Enter"`.
- Verify: `npx tsc --noEmit` (the `createT` strict tables fail on a missing
  PT-BR key).

### Phase 4 — VariationChoiceDialog component + StudioShell wiring

New file `src/studio/VariationChoiceDialog.tsx`, edited file
`src/studio/StudioShell.tsx`.

Component (client component; props: none — reads the store directly so the
executor needs no prop plumbing):

```tsx
"use client";
import { useLayoutEffect, useRef } from "react";
import { continuationsAt, moveNumberForPath, plyColor } from "@/src/chess/tree";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

export function VariationChoiceDialog() {
  const locale = useStudioStore((s) => s.settings.locale);
  const choice = useStudioStore((s) => s.variationChoice);
  const chooseVariation = useStudioStore((s) => s.chooseVariation);
  const cancel = useStudioStore((s) => s.cancelVariationChoice);
  const listRef = useRef<HTMLDivElement>(null);
  const board = useStudioStore((s) => s.boards.find((b) => b.id === choice?.boardId));
  // render null unless choice && board && pathsEqual(board.path, choice.path)
  //   && continuationsAt(board.tree, choice.path).length >= 2
  // options: label = `${moveNumberForPath(startFen, choice.path.length + 1)}${color === "b" ? "..." : "."} ${san}`,
  //   index 0 gets the mainline badge (tPanels "notation.variationChooser.mainline")
  // focus: useLayoutEffect on [choice] → listRef.current?.querySelector("button")?.focus()
  //   (layout effect so it runs before useDialogFocus's mount effect? No:
  //   child effects run before parent effects, so the Dialog's focus effect
  //   (parent) already ran — our focus call wins. Either hook order works;
  //   useLayoutEffect guarantees it lands before paint.)
  // keys on the list container: 1–9 → chooseVariation(n-1); ArrowDown/Up →
  //   focus next/prev option (wrap); Home/End → first/last; Enter → click
  //   document.activeElement if it is an option button.
  // footer: <Button variant="ghost" onClick={cancel}>{tPanels(locale, "dialog.cancel")}</Button>
  // hint: {tPanels(locale, "notation.variationChooser.hint")}
}
```

Notes:
- Guard rendering on the stale conditions (wrong board / moved path / < 2
  children → null) so a mid-flight tree edit never shows a phantom dialog; the
  store-side validation in `chooseVariation` is the backstop.
- `moveNumberForPath(startFen, choice.path.length + 1)` + `plyColor(startFen,
  choice.path.length + 1)`: the child ply index is `choice.path.length + 1`
  (follows the `NotationMoves` convention, e.g. `1... c5`).
- Roving focus: keep it local with refs (`querySelectorAll("button[data-option]")`),
  not component state — no new focus hook, no changes to `useDialogFocus`.
- `StudioShell`: import `VariationChoiceDialog`, read
  `const variationChoice = useStudioStore((s) => s.variationChoice)`, render
  `{variationChoice ? <VariationChoiceDialog /> : null}` next to the existing
  `aboutOpen` dialog block (before `</div>` / print sheet). Renders for both
  desktop and mobile branches since it sits outside the `isMobile` split; no
  entry-point changes needed (ArrowRight handler, toolbar, swipe, strip all call
  the same gated `forward()`).
- Component tests in `src/studio/VariationChoiceDialog.test.tsx` (follow
  `ReviewPanel.test.tsx` grain: `setupDom`/`teardownDom`, `mock.module` not
  needed, seed store with a two-child tree, set `variationChoice`, `render`
  `<VariationChoiceDialog />`):
  - lists both SANs, index 0 carries the mainline badge;
  - click option 2 calls through to path `[...choice.path, 1]` and unmounts;
  - `fireEvent.keyDown` "2" selects; ArrowDown then Enter selects the second;
  - Escape (Dialog handler) and Cancel both close without moving.
- Verify: targeted `node --test` on the new file, then `npx tsc --noEmit`.

### Phase 5 — e2e: studio-variations branch choice

New file `e2e/studio-variations.spec.ts` (follow `studio-move.spec.ts` grain —
board squares via `[data-board-image]` / `[data-square=...]`, notation tokens via
`button[aria-current="step"]`):

1. `goto /studio`, play `e2-e4` (click e2, e4), `e7-e5`, `g1-f3` by clicking
   squares (or `makeUciMove` equivalent clicks); `back()` twice via the
   Back toolbar button to reach `1. e4`; play `c7-c5` (creates the `1... c5`
   variation at path `[0]`); press `toStart`-equivalent (Start button) then
   ArrowRight (`page.keyboard.press("ArrowRight")`).
2. Assert: dialog heading "Choose a continuation" visible; board still shows
   the start position (path unchanged — `e4` token is NOT `aria-current`);
   click the `1... c5` option; assert the `c5` notation token becomes
   `aria-current="step"`.
3. Second test: fresh line `1. e4 e5` with no variation — ArrowRight from start
   advances with no dialog (`queryByText("Choose a continuation")` null, `e4`
   active).

The e2e needs real engine-free guest flow only (no login, no workers). If the
click-square selectors differ, mirror `mobile-studio.spec.ts` for the
established board-click helper before inventing new ones.

- Verify: `npx playwright test e2e/studio-variations.spec.ts
  e2e/studio-move.spec.ts` (second file guards regressions).

### Phase 6 — Full verification

Run in order, fix before proceeding:
1. `npm test` (whole suite)
2. `npm run lint`
3. `npx tsc --noEmit`
4. `npm run build`
5. `npx playwright test e2e/studio-variations.spec.ts e2e/studio-move.spec.ts`

## Risks

- **Focus race**: `useDialogFocus` focuses the first focusable descendant (the X
  close button) on mount; the dialog must re-focus the first option after that.
  Child-effects-first ordering makes the option focus win; if flaky in tests,
  gate the child focus on `requestAnimationFrame` — check by asserting
  `document.activeElement` in the component test.
- **Stale choice vs. tree edits**: `promoteVariation` / `makeMainline` /
  `pruneAfter` / `insertEngineLines` mutate the tree without clearing the
  choice; the dialog's render guard + `chooseVariation` validation turn this
  into a silent clear rather than a wrong move. Watch for a visible flicker
  (dialog opens then vanishes) — acceptable per spec, flag if reviewers object.
- **Mobile strip disabled state**: `MobileMoveStrip` disables Next at
  `currentIndex >= moves.length - 1` on a mainline-only model; at a branch with
  the cursor mid-line the button may look disabled while `forward()` would open
  the chooser. Spec explicitly defers reworking this; e2e covers the desktop
  toolbar + ArrowRight, and swipe shares the action.
- **`resetSessionState` completeness**: the new key must be added to the reset
  payload (`satisfies SessionResetPayload` fails `tsc` otherwise) — covered in
  Phase 2 step 3; `tsc` is the check.

## Assumptions

- Triage claims re-verified on this checkout: `goForward` (`tree.ts:193-199`)
  returns `[...path, 0]`; `forward` (`boards.ts:402-415`) delegates directly;
  no `continuationsAt` / `variationChoice` / chooser dialog exist; all four
  single-step entry points call the same `forward()`.
- `continuationsAt` returns `[]` (not `null`) for invalid paths — diverts from
  the private `childrenAt` nullable grain deliberately so store/dialog code has
  no null branch; spec's "return tree.children / node children" holds for all
  valid paths.
- `forward()` while a choice is open is a no-op and `back()`/`toStart()` do not
  clear the choice (spec lists exactly five clearing actions); stale choices
  self-invalidate on `chooseVariation`.
- `redo` inheriting the chooser is intended (spec keeps the alias; no
  decoupling work planned).
- Focus-first-option is achievable with a local `useLayoutEffect` + list ref,
  no changes to `Dialog` / `useDialogFocus`.
- PT-BR strings as specified in the issue are taken verbatim.
- e2e can build a variation purely through board clicks (play line, back up,
  play divergent move) following `studio-move.spec.ts` selectors.

## Open questions

None — the issue's Decision section already settled modal-vs-popover,
chooser threshold (2+), and bulk-path exclusions.
