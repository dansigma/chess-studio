import { DOCK_LAYOUT_CURRENT_KEY, DOCK_LAYOUTS_KEY, readRawCache, removeRawCache, writeRawCache } from "@/src/lib/local-cache";
import { sanitizeDockLayout, type DockLayoutSnapshot } from "./dock-layout";

// SIG-1316: user-saved dock layouts. A saved layout is a sanitized dock
// snapshot plus an id, a name and a timestamp. The list is stored in
// localStorage for guests and mirrored to user_settings.layouts for accounts
// (see studio-persistence). Pure list operations keep the store slice thin.

export const DOCK_LAYOUTS_STORAGE_KEY = DOCK_LAYOUTS_KEY;
export const MAX_SAVED_LAYOUTS = 20;
export const MAX_LAYOUT_NAME_LENGTH = 40;

export type SavedDockLayout = {
  id: string;
  name: string;
  updatedAt: string;
  snapshot: DockLayoutSnapshot;
};

export function normalizeLayoutName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_LAYOUT_NAME_LENGTH).trim();
  return name.length > 0 ? name : null;
}

export function sanitizeSavedLayouts(raw: unknown): SavedDockLayout[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: SavedDockLayout[] = [];
  const ids = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const item = entry as Record<string, unknown>;
    const name = typeof item.name === "string" ? normalizeLayoutName(item.name) : null;
    const snapshot = sanitizeDockLayout(item.snapshot);
    if (typeof item.id !== "string" || item.id === "" || ids.has(item.id) || !name || !snapshot) {
      continue;
    }
    ids.add(item.id);
    out.push({
      id: item.id,
      name,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date(0).toISOString(),
      snapshot,
    });
    if (out.length >= MAX_SAVED_LAYOUTS) {
      break;
    }
  }
  return out;
}

export function addSavedLayout(
  list: readonly SavedDockLayout[],
  name: string,
  snapshot: DockLayoutSnapshot,
  id: string,
  now: string,
): SavedDockLayout[] | null {
  const clean = normalizeLayoutName(name);
  if (!clean || list.length >= MAX_SAVED_LAYOUTS) {
    return null;
  }
  return [...list, { id, name: clean, updatedAt: now, snapshot }];
}

export function renameSavedLayout(
  list: readonly SavedDockLayout[],
  id: string,
  name: string,
  now: string,
): SavedDockLayout[] | null {
  const clean = normalizeLayoutName(name);
  if (!clean || !list.some((item) => item.id === id)) {
    return null;
  }
  return list.map((item) => (item.id === id ? { ...item, name: clean, updatedAt: now } : item));
}

export function updateSavedLayout(
  list: readonly SavedDockLayout[],
  id: string,
  snapshot: DockLayoutSnapshot,
  now: string,
): SavedDockLayout[] | null {
  if (!list.some((item) => item.id === id)) {
    return null;
  }
  return list.map((item) => (item.id === id ? { ...item, snapshot, updatedAt: now } : item));
}

export function deleteSavedLayout(list: readonly SavedDockLayout[], id: string): SavedDockLayout[] {
  return list.filter((item) => item.id !== id);
}

export function readStoredLayouts(): SavedDockLayout[] {
  const raw = readRawCache(DOCK_LAYOUTS_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    return sanitizeSavedLayouts(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function writeStoredLayouts(list: readonly SavedDockLayout[]): void {
  if (list.length === 0) {
    removeRawCache(DOCK_LAYOUTS_STORAGE_KEY);
    return;
  }
  writeRawCache(DOCK_LAYOUTS_STORAGE_KEY, JSON.stringify(list));
}

// "preset:<id>" / "saved:<id>" — which layout was applied last.
export type LayoutKey = string;
export const presetLayoutKey = (id: string): LayoutKey => `preset:${id}`;
export const savedLayoutKey = (id: string): LayoutKey => `saved:${id}`;

export function readCurrentLayoutKey(list: readonly SavedDockLayout[]): LayoutKey | null {
  const raw = readRawCache(DOCK_LAYOUT_CURRENT_KEY);
  if (!raw) {
    return null;
  }
  if (raw.startsWith("preset:")) {
    return raw;
  }
  if (raw.startsWith("saved:") && list.some((item) => savedLayoutKey(item.id) === raw)) {
    return raw;
  }
  return null;
}

export function writeCurrentLayoutKey(key: LayoutKey | null): void {
  if (key === null) {
    removeRawCache(DOCK_LAYOUT_CURRENT_KEY);
  } else {
    writeRawCache(DOCK_LAYOUT_CURRENT_KEY, key);
  }
}
