# Dock layout persistence

Date: 2026-09-21  
Status: approved

## Goal

A rearranged studio dock comes back after reload. Signed-in users get the same arrangement on another browser. Player panels stay temporary.

## In scope

- Save dockview’s own snapshot of the six studio panels: Board, Notation, Engine, Eval Graph, Ultra Database, Ultra Games
- Keep sizes, splits, closed panels, and which tab is in front
- This browser, key `studio-clone-dock-layout`
- Signed in, the same JSON in `user_settings.layout` (column and policies already exist)
- On sign-in, the account layout wins. If the account has none, keep the browser layout and upload it
- Restore only when `version` is `board-engine-eval-graph` and the snapshot parses. Otherwise use the built-in arrangement
- Reset View deletes the snapshot, sets `user_settings.layout` to null, and loads the built-in arrangement
- Strip `player-explorer` and `player-games` (and any other non-studio panel) before save. Add them again only when a player is open

## Out of scope

- Saving player panels
- A custom layout model
- New SQL
- Popout windows as the only place panels live

## Storage

```ts
type DockLayoutSnapshot = {
  version: "board-engine-eval-graph";
  dock: SerializedDockview; // studio panels only; grid root is a branch
};
```

Debounce writes by 400ms after a move, resize, open, or close. Programmatic restore, the built-in seed, and Reset View do not write the snapshot back.

## Restore rules

- Drop panels whose id is not one of the six, and panels whose `contentComponent` is set and does not match that id
- Drop groups that have no studio panels left. If the active group went away, use the first remaining group
- Dockview rejects a leaf root, so a single remaining group is wrapped in a branch
- `fromJSON` replaces the current dock. If it throws, seed the built-in arrangement
- Then, if a player is open, add the two player panels beside Notation
