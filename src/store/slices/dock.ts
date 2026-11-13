import type { StateCreator } from "zustand";
import {
  bumpDockLayoutEpoch,
  clearStoredDockLayout,
  currentDockLayoutEpoch,
  queuePendingDockLayout,
  readLiveDockSnapshot,
  remapBoardPanels,
} from "@/src/studio/dock-layout";
import {
  addSavedLayout,
  deleteSavedLayout as removeSavedLayout,
  presetLayoutKey,
  readCurrentLayoutKey,
  readStoredLayouts,
  renameSavedLayout as renameInList,
  savedLayoutKey,
  updateSavedLayout as updateInList,
  writeCurrentLayoutKey,
} from "@/src/studio/dock-layouts";
import { persistDockLayoutRecord, persistSavedLayoutsRecord } from "@/src/lib/studio-persistence";
import type { SavedDockLayout } from "@/src/studio/dock-layouts";
import type { StudioState } from "./types";

// SIG-944: dock layout state moved out of studio-store.ts. The reset action
// talks to the store-free persistence helper directly (reading the signed-in
// user through get()) so this module never imports useStudioStore — the
// module-level persistDockLayout wrapper in the composer stays the public
// entry point for consumers.
// SIG-1316: presets, saved layouts and applying them live here too. Applying
// follows the resetView path: bump the epoch, queue what the dock should
// place, bump layoutNonce so the dock remounts and places it (keeping the
// open boards, which live in the store), and the dock persists the result.
export type DockSlice = Pick<
  StudioState,
  | "layoutNonce"
  | "resetView"
  | "savedLayouts"
  | "currentLayoutKey"
  | "layoutDialog"
  | "applyPresetLayout"
  | "applySavedLayout"
  | "saveCurrentLayout"
  | "renameSavedLayout"
  | "updateSavedLayout"
  | "deleteSavedLayout"
  | "hydrateSavedLayouts"
  | "setLayoutDialog"
>;

export const initialDockState = { layoutNonce: 0 };

function initialSavedLayouts(): SavedDockLayout[] {
  return readStoredLayouts();
}

export const createDockSlice: StateCreator<StudioState, [], [], DockSlice> = (set, get) => {
  const initialLayouts = initialSavedLayouts();

  function commitLayouts(next: SavedDockLayout[]): void {
    set({ savedLayouts: next });
    void persistSavedLayoutsRecord(next, get().user?.id ?? null).catch(() => undefined);
  }

  function markCurrent(key: string | null): void {
    writeCurrentLayoutKey(key);
    set({ currentLayoutKey: key });
  }

  return {
    ...initialDockState,
    savedLayouts: initialLayouts,
    currentLayoutKey: readCurrentLayoutKey(initialLayouts),
    layoutDialog: null,
    resetView: () => {
      bumpDockLayoutEpoch();
      clearStoredDockLayout();
      void persistDockLayoutRecord(
        null,
        currentDockLayoutEpoch(),
        get().user?.id ?? null,
      ).catch(() => undefined);
      writeCurrentLayoutKey(presetLayoutKey("full"));
      set((state) => ({
        layoutNonce: state.layoutNonce + 1,
        currentLayoutKey: presetLayoutKey("full"),
      }));
    },
    applyPresetLayout: (id) => {
      bumpDockLayoutEpoch();
      queuePendingDockLayout({ kind: "preset", id });
      writeCurrentLayoutKey(presetLayoutKey(id));
      set((state) => ({
        layoutNonce: state.layoutNonce + 1,
        currentLayoutKey: presetLayoutKey(id),
      }));
    },
    applySavedLayout: (id) => {
      const saved = get().savedLayouts.find((item) => item.id === id);
      if (!saved) {
        return;
      }
      // Board panels in the saved layout map onto the boards open now.
      const remapped = remapBoardPanels(
        saved.snapshot,
        get().boards.map((board) => board.id),
      );
      bumpDockLayoutEpoch();
      queuePendingDockLayout(
        remapped ? { kind: "snapshot", snapshot: remapped } : { kind: "preset", id: "full" },
      );
      writeCurrentLayoutKey(savedLayoutKey(id));
      set((state) => ({
        layoutNonce: state.layoutNonce + 1,
        currentLayoutKey: savedLayoutKey(id),
      }));
    },
    saveCurrentLayout: (name) => {
      const snapshot = readLiveDockSnapshot();
      if (!snapshot) {
        return false;
      }
      const id = crypto.randomUUID();
      const next = addSavedLayout(get().savedLayouts, name, snapshot, id, new Date().toISOString());
      if (!next) {
        return false;
      }
      commitLayouts(next);
      markCurrent(savedLayoutKey(id));
      return true;
    },
    renameSavedLayout: (id, name) => {
      const next = renameInList(get().savedLayouts, id, name, new Date().toISOString());
      if (!next) {
        return false;
      }
      commitLayouts(next);
      return true;
    },
    updateSavedLayout: (id) => {
      const snapshot = readLiveDockSnapshot();
      if (!snapshot) {
        return false;
      }
      const next = updateInList(get().savedLayouts, id, snapshot, new Date().toISOString());
      if (!next) {
        return false;
      }
      commitLayouts(next);
      markCurrent(savedLayoutKey(id));
      return true;
    },
    deleteSavedLayout: (id) => {
      commitLayouts(removeSavedLayout(get().savedLayouts, id));
      if (get().currentLayoutKey === savedLayoutKey(id)) {
        markCurrent(null);
      }
    },
    hydrateSavedLayouts: (layouts) => {
      set({ savedLayouts: layouts });
      const key = readCurrentLayoutKey(layouts);
      set({ currentLayoutKey: key });
    },
    setLayoutDialog: (layoutDialog) => set({ layoutDialog }),
  };
};
