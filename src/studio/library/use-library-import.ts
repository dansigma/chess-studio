"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { fileSourceId } from "@/src/lib/library/file-source";
import { tLibrary } from "@/src/i18n/library-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { registerLibraryAdapters } from "./library-sources";
import { useLibraryStore } from "./library-store";
import { importPgnFiles } from "./pgn-import-queue";

/** Imports PGN files as personal databases without leaving the Library. */
export function useLibraryImport(): (files: File[]) => Promise<void> {
  return useCallback(async (files: File[]) => {
    const store = useStudioStore.getState();
    const { importedIds, skipped } = await importPgnFiles(files, {
      importDatabase: (name, pgn) => store.importFileDatabase(name, pgn, null, { focusFiles: false }),
    });
    const last = importedIds[importedIds.length - 1];
    if (last) {
      // Register the new adapters now so the reconcile effect keeps this selection.
      registerLibraryAdapters(useStudioStore.getState().files.databases);
      useLibraryStore.getState().setSources([fileSourceId(last)]);
    }
    if (skipped.length > 0) {
      const locale = useStudioStore.getState().settings.locale;
      useStudioStore.setState({
        statusMessage: tLibrary(locale, "library.import.skipped", { names: skipped.join(", ") }),
      });
    }
  }, []);
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
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
        if (!enabled || !hasFiles(event)) {
          return;
        }
        event.preventDefault();
        depth.current += 1;
        setActive(true);
      },
      onDragOver: (event: DragEvent) => {
        if (!enabled || !hasFiles(event)) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (event: DragEvent) => {
        if (!enabled || !hasFiles(event)) {
          return;
        }
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) {
          setActive(false);
        }
      },
      onDrop: (event: DragEvent) => {
        if (!enabled || !hasFiles(event)) {
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
