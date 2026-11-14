"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { fileSourceId } from "@/src/lib/library/file-source";
import { tLibrary } from "@/src/i18n/library-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { registerLibraryAdapters } from "./library-sources";
import { useLibraryStore } from "./library-store";
import { enqueuePgnFiles } from "./import-queue-store";
import { hasFileDrag } from "./library-drag";

function folderExists(folderId: string | null): boolean {
  return folderId === null || useStudioStore.getState().files.folders.some((folder) => folder.id === folderId);
}

/** The folder being viewed, when it still exists. */
function selectedFolderId(): string | null {
  const folderId = useLibraryStore.getState().folderId;
  return folderId && folderExists(folderId) ? folderId : null;
}

export type LibraryImportOptions = {
  /** Folder the files land in; defaults to the folder being viewed. `null` = no folder. */
  folderId?: string | null;
};

function targetFolderId(options?: LibraryImportOptions): string | null {
  if (options?.folderId !== undefined) {
    // The folder may have been deleted while the files were being dropped.
    return folderExists(options.folderId) ? options.folderId : null;
  }
  return selectedFolderId();
}

/**
 * Queues PGN files as personal databases without leaving the Library. Progress,
 * cancel and per-file failures show in the import widget; only non-.pgn files
 * still go to the status message. A drop on a rail folder passes its id.
 */
export function useLibraryImport(): (files: File[], options?: LibraryImportOptions) => Promise<void> {
  return useCallback(async (files: File[], options?: LibraryImportOptions) => {
    const folderId = targetFolderId(options);
    const { skipped, done } = enqueuePgnFiles(files, {
      databaseCount: () => useStudioStore.getState().files.databases.length,
      databases: () => useStudioStore.getState().files.databases,
      replaceDatabaseGames: (id, games) => useStudioStore.getState().replaceFileDatabaseGames(id, games),
      // Into the drop target, or the folder being viewed, so the new card is visible.
      importParsedDatabase: (name, games) =>
        useStudioStore.getState().importParsedDatabase(name, games, folderId),
      onDrained: (importedIds) => {
        const last = importedIds[importedIds.length - 1];
        if (last) {
          // Register the new adapters now so the reconcile effect keeps this selection.
          registerLibraryAdapters(useStudioStore.getState().files.databases);
          useLibraryStore.getState().setSources([fileSourceId(last)]);
        }
      },
    });
    await done;
    if (skipped.length > 0) {
      // Append to the import's own "Imported N games" message instead of replacing it.
      const state = useStudioStore.getState();
      const note = tLibrary(state.settings.locale, "library.import.skipped", { names: skipped.join(", ") });
      useStudioStore.setState({ statusMessage: [state.statusMessage, note].filter(Boolean).join(" · ") });
    }
  }, []);
}

/** Drop-zone handlers for the Library root; the counter keeps nested elements from flickering. */
export function useLibraryDrop(enabled: boolean) {
  const importFiles = useLibraryImport();
  const depth = useRef(0);
  const [active, setActive] = useState(false);

  const reset = useCallback(() => {
    depth.current = 0;
    setActive(false);
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        reset();
      }
    };
    window.addEventListener("dragend", reset);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, reset]);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      reset();
    }
  }, [enabled, reset]);

  return {
    active: enabled && active,
    handlers: {
      onDragEnter: (event: DragEvent) => {
        if (!enabled || !hasFileDrag(event)) {
          return;
        }
        event.preventDefault();
        depth.current += 1;
        setActive(true);
      },
      onDragOver: (event: DragEvent) => {
        if (!enabled || !hasFileDrag(event)) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (event: DragEvent) => {
        if (!enabled || !hasFileDrag(event)) {
          return;
        }
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) {
          setActive(false);
        }
      },
      /**
       * SIG-1343: the overlay hides as soon as the drop lands, even when a nested
       * zone (a folder in the rail) stops the event before the root handler.
       */
      onDropCapture: (event: DragEvent) => {
        if (!enabled || !hasFileDrag(event)) {
          return;
        }
        reset();
      },
      onDrop: (event: DragEvent) => {
        if (!enabled || !hasFileDrag(event)) {
          return;
        }
        event.preventDefault();
        const files = Array.from(event.dataTransfer.files ?? []);
        reset();
        void importFiles(files);
      },
    },
  };
}
