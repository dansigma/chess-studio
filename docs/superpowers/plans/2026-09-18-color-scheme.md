# Color Scheme Implementation Plan

> **For agentic workers:** Implement inline in this session. Do not commit unless the user asks.

**Goal:** Dark / Light / System chrome via CSS tokens, persisted locally.

**Architecture:** `colorScheme` on studio settings. Resolve to `html[data-color-scheme]`. Studio Tailwind colors map to CSS variables. Blocking bootstrap reads `studio-clone-settings` before paint.

**Tech Stack:** Zustand, Tailwind v4 `@theme`, dockview CSS variables.

## Global Constraints

- English UI chrome
- No new Supabase column
- Board Theme / pieces / eval-bar side colors unchanged
- No git commit unless asked

---

### Task 1: Resolve + tokens + settings + menu

**Files:**

- Create: `src/studio/color-scheme.ts` — types, `resolveColorScheme`, `applyColorScheme`, bootstrap script
- Create: `src/studio/ColorSchemeSync.tsx` — apply store value + System media listener
- Modify: `app/globals.css` — `--studio-*` dark/light + `@theme` + dockview vars
- Modify: `app/layout.tsx` — bootstrap + sync, `suppressHydrationWarning`
- Modify: `src/store/studio-store.ts` — `colorScheme`, `setColorScheme`, load/persist local only
- Modify: `src/studio/MenuBar.tsx` — Color Scheme submenu

### Task 2: Chrome class pass

Replace hardcoded `#1e1f22` / `#25262b` / zinc chrome text in studio panels, shell, login. Keep eval-bar zinc as chess colors.

### Task 3: Verify

- `npx tsc --noEmit`
- Browser: Dark (current look), Light (readable chrome, board theme unchanged), System, reload keeps Light
