"use client";

import { useSyncExternalStore } from "react";

// SIG-1370: a boolean remembered in localStorage (every access guarded).
const listeners = new Set<() => void>();
const memory = new Map<string, boolean>();

/** SIG-1387: a fallback may be computed on the client (e.g. from a media query). */
export type StoredFlagFallback = boolean | (() => boolean);

function resolveFallback(fallback: StoredFlagFallback): boolean {
  if (typeof fallback !== "function") {
    return fallback;
  }
  try {
    return fallback();
  } catch {
    return false;
  }
}

function read(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      return raw === "1";
    }
  } catch {
    // fall through to the in-memory value
  }
  return memory.get(key) ?? fallback;
}

export function useStoredFlag(
  key: string,
  fallback: StoredFlagFallback,
): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => read(key, resolveFallback(fallback)),
    () => resolveFallback(fallback),
  );
  function set(next: boolean) {
    memory.set(key, next);
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // storage unavailable: the choice just does not persist
    }
    listeners.forEach((notify) => notify());
  }
  return [value, set];
}
