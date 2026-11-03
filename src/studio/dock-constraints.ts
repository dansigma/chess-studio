import type { DockviewApi } from "dockview-react";

/** Dock tab strip height (`--dv-tabs-and-actions-container-height`). */
const TAB_STRIP = 32;
/** dockview's own floor for a group (MINIMUM_DOCKVIEW_GROUP_PANEL_HEIGHT). */
const DOCKVIEW_GROUP_FLOOR = 100;

/**
 * SIG-1197: the least content height each panel needs to stay usable when a
 * group is dragged small — engine: its control row + one line; notation:
 * header row + a few moves; explorer: its two header rows + a few moves.
 */
const PANEL_MIN_CONTENT: Array<[(id: string) => boolean, number]> = [
  [(id) => id === "engine", 32 + 28],
  [(id) => id === "notation", 120],
  [(id) => id === "explorer" || id.startsWith("explorer:"), 140],
];

/** Minimum group height for the panels it holds, or null for dockview's default. */
export function groupMinimumHeight(panelIds: readonly string[]): number | null {
  let content = 0;
  for (const id of panelIds) {
    for (const [matches, height] of PANEL_MIN_CONTENT) {
      if (matches(id)) {
        content = Math.max(content, height);
      }
    }
  }
  if (content === 0) {
    return null;
  }
  return Math.max(DOCKVIEW_GROUP_FLOOR, content + TAB_STRIP);
}

const applied = new WeakMap<object, number | null>();

/**
 * Sets each group's minimum height from the panels inside it. Only writes
 * when the value changes, so calling it from `onDidLayoutChange` cannot loop.
 * The constraint is not part of the saved layout: saved layouts open as they
 * were and pick the floor up at runtime.
 */
export function applyGroupMinimums(api: DockviewApi): void {
  for (const group of api.groups) {
    const minimum = groupMinimumHeight(group.panels.map((panel) => panel.id));
    if (applied.get(group) === minimum) {
      continue;
    }
    applied.set(group, minimum);
    group.api.setConstraints({ minimumHeight: minimum ?? DOCKVIEW_GROUP_FLOOR });
  }
}
