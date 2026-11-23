import type { DockviewApi } from "dockview-core";
import { DOCK_LAYOUT_VERSION, sanitizeDockLayout } from "./dock-layout";
import { isEditableTarget } from "./studio-shortcuts";

export function readNormalDockSnapshot(api: Pick<DockviewApi, "hasMaximizedGroup" | "toJSON">) {
  if (api.hasMaximizedGroup()) {
    return null;
  }
  return sanitizeDockLayout({ version: DOCK_LAYOUT_VERSION, dock: api.toJSON() });
}

export function handleDockRestoreKey(
  event: KeyboardEvent,
  api: Pick<DockviewApi, "hasMaximizedGroup" | "exitMaximizedGroup">,
): void {
  if (
    event.key !== "Escape" ||
    event.defaultPrevented ||
    event.repeat ||
    !api.hasMaximizedGroup() ||
    isEditableTarget(event.target) ||
    document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"], [data-promotion-open]')
  ) {
    return;
  }
  event.preventDefault();
  api.exitMaximizedGroup();
}
