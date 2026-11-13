"use client";

import { useCallback, useSyncExternalStore } from "react";

// SIG-1313: how the desktop board grid is laid out. Per device (like the eval-bar toggle), never synced.
export const LIVE_LAYOUTS = ["grid", "compact", "focus"] as const;
export type LiveLayout = (typeof LIVE_LAYOUTS)[number];
export const DEFAULT_LIVE_LAYOUT: LiveLayout = "grid";
export const LIVE_LAYOUT_PREF_KEY = "chess-studio.live.layout";

const listeners = new Set<() => void>();
// Fallback when storage throws, so the choice still holds for this session.
let memory: LiveLayout | null = null;

export function isLiveLayout(value: unknown): value is LiveLayout {
  return typeof value === "string" && (LIVE_LAYOUTS as readonly string[]).includes(value);
}

function readPref(): LiveLayout | null {
  try {
    const raw = window.localStorage.getItem(LIVE_LAYOUT_PREF_KEY);
    return isLiveLayout(raw) ? raw : memory;
  } catch {
    return memory;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper: forget the in-memory fallback. */
export function resetLiveLayoutMemory(): void {
  memory = null;
}

export function useLiveLayoutPref(): [LiveLayout, (next: LiveLayout) => void] {
  const stored = useSyncExternalStore(subscribe, readPref, () => null);
  const set = useCallback((next: LiveLayout) => {
    memory = next;
    try {
      window.localStorage.setItem(LIVE_LAYOUT_PREF_KEY, next);
    } catch {
      // Storage unavailable: the choice lasts for this session only.
    }
    for (const l of listeners) {
      l();
    }
  }, []);
  return [stored ?? DEFAULT_LIVE_LAYOUT, set];
}
