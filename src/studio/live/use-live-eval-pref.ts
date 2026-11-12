"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useIsMobile } from "../use-is-mobile";

export const LIVE_EVAL_PREF_KEY = "chess-studio.live.showEvalBar";

const listeners = new Set<() => void>();
// Fallback when storage throws, so the toggle still works for this session.
let memory: boolean | null = null;

function readPref(): boolean | null {
  try {
    const raw = window.localStorage.getItem(LIVE_EVAL_PREF_KEY);
    return raw === "1" ? true : raw === "0" ? false : memory;
  } catch {
    return memory;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Per-device "Show eval bar" toggle for Live. Deliberately not `settings.showEvalBar` (that syncs to
 * the account). Until the user chooses, it defaults to on for desktop and off for mobile.
 */
export function useLiveEvalPref(): [boolean, (next: boolean) => void] {
  const mobile = useIsMobile();
  const stored = useSyncExternalStore(subscribe, readPref, () => null);
  const set = useCallback((next: boolean) => {
    memory = next;
    try {
      window.localStorage.setItem(LIVE_EVAL_PREF_KEY, next ? "1" : "0");
    } catch {
      // Storage unavailable: the choice lasts for this session only.
    }
    for (const l of listeners) {
      l();
    }
  }, []);
  return [stored ?? !mobile, set];
}
