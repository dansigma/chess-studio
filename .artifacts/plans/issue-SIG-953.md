# Implementation Plan - SIG-953: Studio: make the Open boards sidebar resizable with a much smaller minimum width

## Goal
Make the Studio sidebar resizable by introducing a draggable, keyboard-accessible vertical resize handle between the active sidebar panel and the dock area. Replace the fixed 256px (`w-64`) width with a dynamic width persisted in the settings store, allowing users to shrink the sidebar down to 160px or expand it up to 480px (or 40% of the window width), while preserving double-click reset to 256px and smooth live dock relayout without layout thrash.

## Scope
- **In Scope**:
  - `src/studio/sidebar-width.ts`: Pure clamping helper and width constants (`DEFAULT_SIDEBAR_WIDTH = 256`, `MIN_SIDEBAR_WIDTH = 160`, `MAX_SIDEBAR_WIDTH = 480`).
  - `src/store/slices/types.ts`: Extend `StudioSettings` and `SettingsSlice` with `sidebarWidth: number` and `setSidebarWidth(width: number): void`.
  - `src/store/slices/settings.ts`: Add `sidebarWidth` to `DEFAULT_SETTINGS`, `loadLocalSettings` (with validation/clamp), `hydrateSettings`, and action implementation.
  - `src/studio/ui/Sidebar.tsx`: Update `SidebarPanel` to use CSS variable `var(--sidebar-width, 256px)`.
  - `src/studio/ui/ResizeHandle.tsx`: Create vertical resize sash with pointer capture, keyboard navigation, ARIA attributes, and double-click reset.
  - `src/studio/StudioShell.tsx`: Mount `ResizeHandle` between sidebar and dock, feed `--sidebar-width` CSS variable, maintain layout rhythm.
  - Unit tests in `src/studio/sidebar-width.test.ts` and `src/store/slices/settings.test.ts`.
- **Out of Scope**:
  - Converting sidebar panels into Dockview panels (dockview integration remains purely for board tabs and explorer panels).
  - Adding remote Supabase schema migration for `sidebar_width` (it follows `notationDensity` as local-only JSON persistence in `localStorage`).
  - Modifying dockview horizontal sash styling or z-index tiers (SIG-912).

## Phases

### Phase 1: Pure Clamping Helper & Width Constants
- **Files**:
  - `src/studio/sidebar-width.ts` (new)
  - `src/studio/sidebar-width.test.ts` (new)
- **Changes**:
  - Define `DEFAULT_SIDEBAR_WIDTH = 256`, `MIN_SIDEBAR_WIDTH = 160`, `MAX_SIDEBAR_WIDTH = 480`.
  - Export `clampSidebarWidth(width: number, windowWidth?: number): number`:
    - Handles invalid / non-numeric input by falling back to `DEFAULT_SIDEBAR_WIDTH`.
    - Clamps lower bound to `MIN_SIDEBAR_WIDTH`.
    - Clamps upper bound to `Math.min(MAX_SIDEBAR_WIDTH, Math.floor(windowWidth * 0.40))` when `windowWidth > 0`, or `MAX_SIDEBAR_WIDTH` otherwise.
- **Verification**:
  - `npm test src/studio/sidebar-width.test.ts`

### Phase 2: Settings Slice & Local Persistence
- **Files**:
  - `src/store/slices/types.ts`
  - `src/store/slices/settings.ts`
  - `src/store/slices/settings.test.ts`
- **Changes**:
  - Add `sidebarWidth: number` to `StudioSettings`.
  - Add `setSidebarWidth: (sidebarWidth: number) => void` to `SettingsSlice`.
  - Update `DEFAULT_SETTINGS` with `sidebarWidth: DEFAULT_SIDEBAR_WIDTH`.
  - In `loadLocalSettings()`: validate `parsed.sidebarWidth` is a valid number, clamp via `clampSidebarWidth`, fallback to default on invalid/missing.
  - In `hydrateSettings()`: handle `partial.sidebarWidth !== undefined` with `clampSidebarWidth`.
  - Add `setSidebarWidth` action in `createSettingsSlice` setting clamped `sidebarWidth`.
- **Verification**:
  - `npm test src/store/slices/settings.test.ts`

### Phase 3: SidebarPanel Styling & ResizeHandle Component
- **Files**:
  - `src/studio/ui/Sidebar.tsx`
  - `src/studio/ui/ResizeHandle.tsx` (new)
- **Changes**:
  - In `Sidebar.tsx`: replace `w-64` in `SidebarPanel` with `style={{ width: "var(--sidebar-width, 256px)" }}`.
  - Create `ResizeHandle`:
    - Render an 8px wide sash element matching dockview spacing (`w-2 shrink-0 cursor-col-resize select-none relative group`).
    - Focusable (`tabIndex={0}`), ARIA `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label="Resize sidebar"`.
    - Pointer capture on `onPointerDown`: track start position and sidebar left boundary; update width live on `onPointerMove`; clean up on `onPointerUp`/`onPointerCancel`/`onLostPointerCapture`.
    - Ensure `user-select: none` on body during drag; clean up safely on completion or unmount.
    - Double click handler resets width to `DEFAULT_SIDEBAR_WIDTH`.
    - Keyboard handlers: `ArrowLeft`/`ArrowRight` (8px step, 16px with Shift), `Home` (min), `End` (max), `Enter` (reset).
- **Verification**:
  - `npx tsc --noEmit`

### Phase 4: StudioShell Integration & Dock Relayout
- **Files**:
  - `src/studio/StudioShell.tsx`
- **Changes**:
  - Read `sidebarWidth = useStudioStore((s) => s.settings.sidebarWidth)` and `setSidebarWidth`.
  - Attach ref to sidebar container for coordinate tracking during drag.
  - Set CSS variable style `--sidebar-width: ${sidebarWidth}px` on container.
  - Render `<ResizeHandle />` between sidebar and dock when `!sidebarCollapsed`.
  - Ensure existing dockview 400ms debounce handles resize layout events without thrashing.
- **Verification**:
  - `npx tsc --noEmit`
  - `npm test`

## Risks & Mitigations
- **Risk**: Dockview layout thrashing during continuous drag.
  - *Mitigation*: Dockview's `onDidLayoutChange` in `StudioDock.tsx` and settings persistence in `StudioShell.tsx` already feature 400ms debounce timers. Live width updates resize the DOM flex child while debounced saves prevent I/O thrash.
- **Risk**: Dragging below min-width collapsing the sidebar or getting stuck.
  - *Mitigation*: Clamp logic prevents width from dropping below 160px; pointer calculation directly tracks pointer position relative to sidebar left origin, ensuring moving back to the right immediately increases width with zero deadzone.
- **Risk**: Text selection and pointer capture leaks.
  - *Mitigation*: Apply `user-select: none` on document body only while drag is active; release pointer capture and clear body styles in `pointerup`, `pointercancel`, and `useEffect` unmount cleanup.

## Assumptions
- Supabase `user_settings` table does not need a `sidebar_width` column; `sidebarWidth` follows `notationDensity` convention and persists locally in `localStorage[SETTINGS_KEY]`.
- Resetting sidebar width (via double-click or Enter) resets to `DEFAULT_SIDEBAR_WIDTH` (256px).
- Minimum width is 160px and maximum width is 480px (or 40% of viewport width).

## Open Questions
- None. All architectural decisions adhere to existing codebase conventions.
