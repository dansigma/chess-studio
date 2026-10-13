import type { StateCreator } from "zustand";
import {
  bumpDockLayoutEpoch,
  clearStoredDockLayout,
  currentDockLayoutEpoch,
} from "@/src/studio/dock-layout";
import { persistDockLayoutRecord } from "@/src/lib/studio-persistence";
import type { StudioState } from "./types";

// SIG-944: dock layout state moved out of studio-store.ts. The reset action
// talks to the store-free persistence helper directly (reading the signed-in
// user through get()) so this module never imports useStudioStore — the
// module-level persistDockLayout wrapper in the composer stays the public
// entry point for consumers.
export type DockSlice = Pick<StudioState, "layoutNonce" | "resetView">;

export const initialDockState = { layoutNonce: 0 };

export const createDockSlice: StateCreator<StudioState, [], [], DockSlice> = (set, get) => ({
  ...initialDockState,
  resetView: () => {
    bumpDockLayoutEpoch();
    clearStoredDockLayout();
    void persistDockLayoutRecord(
      null,
      currentDockLayoutEpoch(),
      get().user?.id ?? null,
    ).catch(() => undefined);
    set((state) => ({ layoutNonce: state.layoutNonce + 1 }));
  },
});
