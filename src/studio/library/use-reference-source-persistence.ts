"use client";

import { useEffect } from "react";
import { useStudioStore } from "@/src/store/studio-store";
import { loadReferenceSource, resolveReferenceSource, saveReferenceSource } from "./reference-source";

/** Restores the Explorer reference database once on the client, then saves every change. */
export function useReferenceSourcePersistence(): void {
  useEffect(() => {
    const state = useStudioStore.getState();
    const restored = resolveReferenceSource(
      loadReferenceSource(),
      state.files.databases.map((database) => database.id),
    );
    if (restored !== state.databaseSource) {
      state.setDatabaseSource(restored);
    }
    return useStudioStore.subscribe((next, prev) => {
      if (next.databaseSource !== prev.databaseSource) {
        saveReferenceSource(next.databaseSource);
      }
    });
  }, []);
}
