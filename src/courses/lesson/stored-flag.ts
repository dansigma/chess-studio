"use client";

import { useSyncExternalStore } from "react";

// SIG-1370: a boolean remembered in localStorage (every access guarded).
const listeners = new Set<() => void>();
const memory = new Map<string, boolean>();

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
  fallback: boolean,
): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => read(key, fallback),
    () => fallback,
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
