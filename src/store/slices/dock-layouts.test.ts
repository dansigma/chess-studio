import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DOCK_LAYOUT_VERSION,
  setDockSnapshotReader,
  takePendingDockLayout,
  type DockLayoutSnapshot,
} from "../../studio/dock-layout.ts";
import {
  DOCK_LAYOUTS_STORAGE_KEY,
  MAX_LAYOUT_NAME_LENGTH,
  MAX_SAVED_LAYOUTS,
  readStoredLayouts,
} from "../../studio/dock-layouts.ts";
import { useStudioStore } from "../studio-store.ts";

// SIG-1316: saved layouts (guest localStorage path) and applying them. The
// Map-backed localStorage is installed after the store import, like dock.test.
const storage = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, String(value)),
    removeItem: (key: string) => void storage.delete(key),
  },
};

function snapshotFor(boardIds: string[]): DockLayoutSnapshot {
  const panels: Record<string, unknown> = {
    engine: { id: "engine", contentComponent: "engine", title: "Engine" },
  };
  for (const id of boardIds) {
    panels[`board:${id}`] = {
      id: `board:${id}`,
      contentComponent: "board",
      title: "Board",
      params: { boardId: id },
    };
  }
  const views = boardIds.map((id) => `board:${id}`);
  return {
    version: DOCK_LAYOUT_VERSION,
    dock: {
      grid: {
        root: {
          type: "branch",
          size: 800,
          data: [
            { type: "leaf", size: 500, data: { id: "g1", views, activeView: views[0] } },
            { type: "leaf", size: 300, data: { id: "g2", views: ["engine"], activeView: "engine" } },
          ],
        },
        width: 1200,
        height: 800,
        orientation: "VERTICAL",
      },
      panels,
      activeGroup: "g1",
    },
  } as unknown as DockLayoutSnapshot;
}

const store = () => useStudioStore.getState();

describe("SIG-1316 saved layouts", () => {
  it("saves, renames, updates and deletes a layout in localStorage", () => {
    setDockSnapshotReader(() => snapshotFor(["a"]));
    assert.equal(store().saveCurrentLayout("  My   layout "), true);
    const [saved] = store().savedLayouts;
    assert.equal(saved.name, "My layout");
    assert.equal(store().currentLayoutKey, `saved:${saved.id}`);
    assert.equal(readStoredLayouts().length, 1, "persisted for guests");

    assert.equal(store().renameSavedLayout(saved.id, "Renamed"), true);
    assert.equal(readStoredLayouts()[0].name, "Renamed");
    assert.equal(store().renameSavedLayout(saved.id, "   "), false, "empty names are rejected");

    setDockSnapshotReader(() => snapshotFor(["a", "b"]));
    assert.equal(store().updateSavedLayout(saved.id), true);
    assert.ok("board:b" in readStoredLayouts()[0].snapshot.dock.panels);

    store().deleteSavedLayout(saved.id);
    assert.deepEqual(store().savedLayouts, []);
    assert.equal(storage.has(DOCK_LAYOUTS_STORAGE_KEY), false);
    assert.equal(store().currentLayoutKey, null, "deleting the current layout clears the mark");
  });

  it("caps the name length and the list size", () => {
    setDockSnapshotReader(() => snapshotFor(["a"]));
    store().saveCurrentLayout("x".repeat(200));
    assert.equal(store().savedLayouts[0].name.length, MAX_LAYOUT_NAME_LENGTH);
    for (let index = 1; index < MAX_SAVED_LAYOUTS; index += 1) {
      assert.equal(store().saveCurrentLayout(`l${index}`), true);
    }
    assert.equal(store().saveCurrentLayout("one too many"), false);
    assert.equal(store().savedLayouts.length, MAX_SAVED_LAYOUTS);
    for (const layout of [...store().savedLayouts]) {
      store().deleteSavedLayout(layout.id);
    }
  });

  it("applying a saved layout remaps its board panels to the open boards", () => {
    const openId = store().boards[0].id;
    setDockSnapshotReader(() => snapshotFor(["old-board"]));
    store().saveCurrentLayout("Remap me");
    const [saved] = store().savedLayouts;
    const nonce = store().layoutNonce;
    store().applySavedLayout(saved.id);
    assert.equal(store().layoutNonce, nonce + 1);
    assert.equal(store().currentLayoutKey, `saved:${saved.id}`);
    const pending = takePendingDockLayout();
    assert.equal(pending?.kind, "snapshot");
    if (pending?.kind === "snapshot") {
      const ids = Object.keys(pending.snapshot.dock.panels).filter((id) => id.startsWith("board:"));
      assert.deepEqual(ids, [`board:${openId}`], "no board is invented, none left stale");
    }
    store().deleteSavedLayout(saved.id);
  });

  it("applying a preset queues it; Reset view restores the default", () => {
    store().applyPresetLayout("minimal");
    assert.deepEqual(takePendingDockLayout(), { kind: "preset", id: "minimal" });
    assert.equal(store().currentLayoutKey, "preset:minimal");
    store().applyPresetLayout("study");
    store().resetView();
    assert.equal(takePendingDockLayout(), null, "reset clears any pending preset so the default seeds");
    assert.equal(store().currentLayoutKey, "preset:full");
  });
});
