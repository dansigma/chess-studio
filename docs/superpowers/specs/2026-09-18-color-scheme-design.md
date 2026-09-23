# Color Scheme

Date: 2026-09-18  
Status: approved (Dark / Light / System)

## Goal

View → Color Scheme switches Studio chrome between Dark, Light, and System (`auto`). Board Theme and Piece Set stay independent.

## In scope

- Submenu Dark / Light / System (check the stored choice)
- Default **Dark**
- Resolve System with `prefers-color-scheme`
- CSS variables for chrome (shell, menus, sidebars, dockview, login)
- Persist `colorScheme` in `studio-clone-settings` only
- Blocking bootstrap so Light does not flash Dark on reload

## Out of scope

- New Supabase `color_scheme` column
- Copying ChessMonitor / Mantine palettes or artwork
- Changing Board Theme square colors or piece SVGs
- Extra palettes (high contrast, sepia, etc.)
- Eval-bar / WDL colors (those encode chess sides, not chrome)

## Behavior

### Stored vs resolved

`settings.colorScheme` is `"dark" | "light" | "auto"`.  
`html[data-color-scheme]` is always the **resolved** value `"dark"` or `"light"`.  
`html.dark` is present only when resolved is dark (Tailwind `dark:` if any).  
`html.style.colorScheme` matches the resolved value for native form controls.

System listens to `matchMedia("(prefers-color-scheme: dark)")` while `auto` is selected.

### Chrome tokens

Dark tokens match the current Studio hex (`#111113`, `#1a1b1e`, `#1e1f22`, `#25262b`, zinc text).  
Light tokens are an original zinc-light palette (light panels, dark text). Menu hover stays `#094771` with white label text.

### Surfaces that must follow the scheme

Menu bar, activity bar, all sidebars, dockview tabs/sashes, panel bodies, dropdowns, dialogs, login page.

### Surfaces that must not

- Board Theme light/dark squares
- Piece set images
- Evaluation bar (white/black mass)
- Engine score badges and the thin eval strip (side colors)
- Explorer WDL bars

## Data

`StudioSettings.colorScheme: "dark" | "light" | "auto"` default `"dark"`.  
Not written to `user_settings`. `hydrateSettings` from remote must not overwrite it.

## Constraints

- English Studio chrome
- Do not copy ChessMonitor artwork
- No git commit unless asked
