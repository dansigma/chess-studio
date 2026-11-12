"use client";

import { useSyncExternalStore } from "react";

// ONE shared 1 s ticker for every running clock. It only runs while at least one ticking cell is
// mounted, and only those cells subscribe, so a tick re-renders the running clocks, not the rows.
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => now;

/** Epoch ms of the last shared tick. Only call it from a cell that is actually ticking. */
export function useLiveNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Tests: number of mounted ticking cells. */
export function tickerSubscribers(): number {
  return listeners.size;
}
