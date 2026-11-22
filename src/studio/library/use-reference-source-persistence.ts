"use client";

import { useEffect } from "react";
import { useStudioStore, type StudioState } from "@/src/store/studio-store";
import { loadReferenceSource, resolveReferenceSource, saveReferenceSource } from "./reference-source";

function restoreReferenceSource(state: StudioState): void {
  const restored = resolveReferenceSource(
    loadReferenceSource(),
    state.files.databases.map((database) => database.id),
  );
  if (restored !== state.databaseSource) {
    state.setDatabaseSource(restored);
  }
}

/** Restores the Explorer reference database after the Library loads, then saves every change. */
export function useReferenceSourcePersistence(): void {
  useEffect(() => {
    const state = useStudioStore.getState();
    if (state.filesHydrated) restoreReferenceSource(state);

    return useStudioStore.subscribe((next, prev) => {
      if (!next.filesHydrated) return;
      if (!prev.filesHydrated) {
        restoreReferenceSource(next);
      } else if (next.databaseSource !== prev.databaseSource) {
        saveReferenceSource(next.databaseSource);
      }
    });
  }, []);
}
