import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DOCK_LAYOUT_STORAGE_KEY,
  DOCK_LAYOUT_VERSION,
  currentDockLayoutEpoch,
  publishDockLayout,
  readStoredDockLayout,
  takeQueuedDockLayout,
  type DockLayoutSnapshot,
} from "../../studio/dock-layout.ts";
import { persistDockLayoutRecord } from "../../lib/studio-persistence.ts";
import { useStudioStore } from "../studio-store.ts";

// SIG-944: dock layout state/actions moved out of studio-store.ts into
// slices/dock.ts. These tests pin resetView's observable behaviour: bumping the
// layout nonce, dropping the persisted layout, and invalidating any in-flight
// persistence that captured the previous epoch. The Map-backed localStorage is
// installed after the store import (module init sees no browser) and node --test
// runs each file in its own process, so the stub cannot leak.
const storage = new Map<string, string>();

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  },
};

const SNAPSHOT: DockLayoutSnapshot = {
  version: DOCK_LAYOUT_VERSION,
  dock: { panels: [], groups: [] },
} as unknown as DockLayoutSnapshot;

describe("SIG-944 dock slice", () => {
  it("resetView bumps the layout nonce and clears the stored layout", () => {
    const store = () => useStudioStore.getState();
    const before = store().layoutNonce;
    storage.set(DOCK_LAYOUT_STORAGE_KEY, JSON.stringify(SNAPSHOT));

    store().resetView();

    assert.equal(store().layoutNonce, before + 1);
    assert.equal(storage.has(DOCK_LAYOUT_STORAGE_KEY), false, "the persisted layout is dropped");
    assert.equal(readStoredDockLayout(), null);
    assert.equal(store().boards.length, 1, "the dock reset leaves the session alone");
  });

  it("resetView bumps the nonce on every call", () => {
    const store = () => useStudioStore.getState();
    const before = store().layoutNonce;

    store().resetView();
    store().resetView();

    assert.equal(store().layoutNonce, before + 2);
  });

  it("resetView invalidates persistence that captured the previous epoch", async () => {
    const store = () => useStudioStore.getState();
    const staleEpoch = currentDockLayoutEpoch();
    storage.set(DOCK_LAYOUT_STORAGE_KEY, JSON.stringify(SNAPSHOT));

    store().resetView();
    assert.notEqual(currentDockLayoutEpoch(), staleEpoch, "the epoch moves with the reset");

    await persistDockLayoutRecord(SNAPSHOT, staleEpoch, null);
    assert.equal(storage.has(DOCK_LAYOUT_STORAGE_KEY), false, "a stale write is ignored");

    await persistDockLayoutRecord(SNAPSHOT, currentDockLayoutEpoch(), null);
    assert.equal(storage.has(DOCK_LAYOUT_STORAGE_KEY), true, "the current epoch still writes");
  });

  it("resetView drops a queued dock layout", () => {
    const store = () => useStudioStore.getState();

    publishDockLayout(SNAPSHOT);
    assert.equal(takeQueuedDockLayout(), SNAPSHOT, "no listener means the snapshot queues");

    publishDockLayout(SNAPSHOT);
    store().resetView();
    assert.equal(takeQueuedDockLayout(), null, "the reset drops anything queued before it");
  });
});
